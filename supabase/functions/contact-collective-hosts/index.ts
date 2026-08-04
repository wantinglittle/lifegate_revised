const ALLOWED_PRODUCTION_ORIGINS = new Set([
  "https://lifegatecommunity.com",
  "https://www.lifegatecommunity.com",
  "https://wantinglittle.github.io"
]);

const DEFAULT_FROM = "LifeGate Community <messages@lifegatecommunity.com>";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RequestBody = Record<string, unknown>;

function isAllowedLocalOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  return ALLOWED_PRODUCTION_ORIGINS.has(origin) || isAllowedLocalOrigin(origin);
}

function corsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json"
  };
  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return headers;
}

function jsonResponse(origin: string | null, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeString(value: unknown, maxLength: number): string {
  return (typeof value === "string" ? value.trim() : "").slice(0, maxLength);
}

function normalizeEmail(value: unknown): string {
  return normalizeString(value, 254).toLowerCase();
}

function resolveSupabaseElevatedKey(): string {
  const hostedSecretKeys = Deno.env.get("SUPABASE_SECRET_KEYS") || "";
  if (hostedSecretKeys) {
    try {
      const parsed = JSON.parse(hostedSecretKeys) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch {
      // Fall through.
    }
  }
  return Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

function supabaseHeaders(key: string): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json"
  };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  return headers;
}

async function loadRecipients(supabaseUrl: string, key: string, collectiveId: string): Promise<string[]> {
  const params = new URLSearchParams({
    select: "pending_email,user_id",
    collective_id: `eq.${collectiveId}`
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/collective_hosts?${params}`, {
    headers: supabaseHeaders(key)
  });
  if (!response.ok) throw new Error(`Collective host lookup failed: ${await response.text()}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) return [];

  const pendingEmails = rows
    .map((row) => normalizeEmail(row?.pending_email))
    .filter((email) => EMAIL_PATTERN.test(email));
  const userIds = rows
    .map((row) => String(row?.user_id || "").trim())
    .filter(Boolean);

  let linkedEmails: string[] = [];
  if (userIds.length > 0) {
    const portalParams = new URLSearchParams({
      select: "email",
      user_id: `in.(${userIds.join(",")})`
    });
    const portalResponse = await fetch(`${supabaseUrl}/rest/v1/portal_users?${portalParams}`, {
      headers: supabaseHeaders(key)
    });
    if (!portalResponse.ok) throw new Error(`Portal email lookup failed: ${await portalResponse.text()}`);
    const portalRows = await portalResponse.json();
    linkedEmails = Array.isArray(portalRows)
      ? portalRows.map((row) => normalizeEmail(row?.email)).filter((email) => EMAIL_PATTERN.test(email))
      : [];
  }

  return Array.from(new Set([...pendingEmails, ...linkedEmails]));
}

async function loadCollective(supabaseUrl: string, key: string, collectiveId: string): Promise<{ city: string; cross_streets: string } | null> {
  const params = new URLSearchParams({
    select: "city,cross_streets,approval_status,listing_status",
    id: `eq.${collectiveId}`,
    limit: "1"
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/collectives?${params}`, {
    headers: supabaseHeaders(key)
  });
  if (!response.ok) throw new Error(`Collective lookup failed: ${await response.text()}`);
  const rows = await response.json();
  const collective = Array.isArray(rows) ? rows[0] : null;
  return collective?.approval_status === "approved" && collective?.listing_status === "active" ? collective : null;
}

async function sendResendEmail(params: {
  messageId: string;
  to: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `${params.messageId}:${params.to}`
    },
    body: JSON.stringify({
      from: Deno.env.get("COLLECTIVES_FROM_EMAIL") || DEFAULT_FROM,
      to: [params.to],
      reply_to: params.replyTo,
      subject: params.subject,
      html: params.html,
      text: params.text
    })
  });
  if (!response.ok) throw new Error(`Resend request failed with status ${response.status}: ${await response.text()}`);
}

async function writeAudit(supabaseUrl: string, key: string, values: {
  messageId: string;
  collectiveId: string;
  senderName: string;
  senderEmail: string;
  senderPhone: string;
  recipientCount: number;
  status: "completed" | "failed";
  errorMessage?: string;
}): Promise<void> {
  const response = await fetch(`${supabaseUrl}/rest/v1/collective_contact_message_audits`, {
    method: "POST",
    headers: {
      ...supabaseHeaders(key),
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      message_id: values.messageId,
      collective_id: values.collectiveId,
      sender_name: values.senderName,
      sender_email: values.senderEmail,
      sender_phone: values.senderPhone || null,
      recipient_count: values.recipientCount,
      overall_status: values.status,
      error_message: values.errorMessage || null
    })
  });
  if (!response.ok) {
    console.warn("Collective contact audit insert failed.", await response.text());
  }
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "POST") return jsonResponse(origin, 405, { error: "Method not allowed." });
  if (!isAllowedOrigin(origin)) return jsonResponse(origin, 403, { error: "Origin not allowed." });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(origin, 400, { error: "Invalid JSON request body." });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse(origin, 400, { error: "Invalid JSON request body." });
  }

  const requestBody = body as RequestBody;
  const collectiveId = normalizeString(requestBody.collectiveId, 80);
  const name = normalizeString(requestBody.name, 120);
  const email = normalizeEmail(requestBody.email);
  const phone = normalizeString(requestBody.phone, 40);
  const message = normalizeString(requestBody.message, 2000);
  const website = normalizeString(requestBody.website, 200);

  if (website) return jsonResponse(origin, 200, { ok: true });
  if (!collectiveId) return jsonResponse(origin, 400, { error: "Collective is required." });
  if (!name) return jsonResponse(origin, 400, { error: "Name is required." });
  if (!EMAIL_PATTERN.test(email)) return jsonResponse(origin, 400, { error: "A valid email is required." });
  if (!message) return jsonResponse(origin, 400, { error: "Message is required." });

  try {
    const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
    const supabaseKey = resolveSupabaseElevatedKey();
    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase elevated credentials are not configured.");

    const collective = await loadCollective(supabaseUrl, supabaseKey, collectiveId);
    if (!collective) return jsonResponse(origin, 404, { error: "Collective is not available." });

    const recipients = await loadRecipients(supabaseUrl, supabaseKey, collectiveId);
    if (recipients.length === 0) return jsonResponse(origin, 404, { error: "No host email is available for this Collective." });

    const messageId = crypto.randomUUID();
    const subject = `Collective Host Message - ${collective.city}`;
    const text = [
      `A visitor sent a message about your Collective near ${collective.cross_streets}, ${collective.city}.`,
      "",
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone || "Not provided"}`,
      "",
      message
    ].join("\n");
    const html = `
      <p>A visitor sent a message about your Collective near <strong>${escapeHtml(collective.cross_streets)}, ${escapeHtml(collective.city)}</strong>.</p>
      <p><strong>Name:</strong> ${escapeHtml(name)}<br>
      <strong>Email:</strong> ${escapeHtml(email)}<br>
      <strong>Phone:</strong> ${escapeHtml(phone || "Not provided")}</p>
      <p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
    `;

    try {
      for (const recipient of recipients) {
        await sendResendEmail({ messageId, to: recipient, replyTo: email, subject, html, text });
      }
      await writeAudit(supabaseUrl, supabaseKey, {
        messageId,
        collectiveId,
        senderName: name,
        senderEmail: email,
        senderPhone: phone,
        recipientCount: recipients.length,
        status: "completed"
      });
    } catch (sendError) {
      await writeAudit(supabaseUrl, supabaseKey, {
        messageId,
        collectiveId,
        senderName: name,
        senderEmail: email,
        senderPhone: phone,
        recipientCount: recipients.length,
        status: "failed",
        errorMessage: sendError instanceof Error ? sendError.message : String(sendError)
      });
      throw sendError;
    }

    return jsonResponse(origin, 200, { ok: true });
  } catch (err) {
    console.error("contact-collective-hosts failed.", err instanceof Error ? err.message : err);
    return jsonResponse(origin, 500, { error: "Unable to send your message right now." });
  }
});

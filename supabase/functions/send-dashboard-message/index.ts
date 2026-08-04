const ALLOWED_PRODUCTION_ORIGINS = new Set([
  "https://lifegatecommunity.com",
  "https://www.lifegatecommunity.com",
  "https://wantinglittle.github.io"
]);

const FUNCTION_NAME = "send-dashboard-message";
const FOOTER_LINK = "https://lifegatecommunity.com/portal-login.html";
const DEFAULT_FROM = "LifeGate Community <messages@lifegatecommunity.com>";
const SAFE_RECIPIENT_LIMIT = 100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MESSAGE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_TAGS = new Set(["p", "strong", "b", "em", "i", "a", "ul", "ol", "li", "br"]);
const VOID_TAGS = new Set(["br"]);

type RequestBody = {
  action?: unknown;
  subject?: unknown;
  html?: unknown;
  messageId?: unknown;
};

type AuthUser = {
  id: string;
  email?: string;
};

type PortalUserRow = {
  user_id: string;
  email: string | null;
  is_admin: boolean;
};

type Recipient = {
  email: string;
};

type MessageDraft = {
  subject: string;
  sanitizedHtml: string;
  text: string;
};

type SendMode = "test" | "production";

type AuditStatus = "started" | "completed" | "partial_failure" | "failed";

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
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin)
  });
}

function resolveSupabaseElevatedKey(): string {
  const hostedSecretKeys = Deno.env.get("SUPABASE_SECRET_KEYS") || "";
  if (hostedSecretKeys) {
    try {
      const parsed = JSON.parse(hostedSecretKeys) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        typeof (parsed as Record<string, unknown>).default === "string"
      ) {
        const defaultKey = (parsed as Record<string, string>).default;
        if (defaultKey) return defaultKey;
      }
    } catch {
      // Fall through to explicitly configured local and legacy variables.
    }
  }

  return Deno.env.get("SUPABASE_SECRET_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    "";
}

function supabaseHeaders(key: string, extra: Record<string, string> = {}): HeadersInit {
  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
    ...extra
  };

  if (!key.startsWith("sb_secret_")) {
    headers.Authorization = `Bearer ${key}`;
  }

  return headers;
}

function normalizeEmail(email: unknown): string {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email);
}

function escapeHtml(value: unknown): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: unknown): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function isSafeHref(value: string): boolean {
  try {
    const parsed = new URL(value, "https://lifegatecommunity.com");
    return parsed.protocol === "https:" ||
      parsed.protocol === "http:" ||
      parsed.protocol === "mailto:";
  } catch {
    return false;
  }
}

function sanitizeHtml(input: string): string {
  const tokens = input.match(/<\/?[^>]+>|[^<]+/g) || [];
  const output: string[] = [];
  const stack: string[] = [];

  for (const token of tokens) {
    if (!token.startsWith("<")) {
      output.push(escapeHtml(token));
      continue;
    }

    const closeMatch = token.match(/^<\/\s*([a-z0-9]+)\s*>$/i);
    if (closeMatch) {
      let tag = closeMatch[1].toLowerCase();
      if (tag === "div") tag = "p";
      if (ALLOWED_TAGS.has(tag) && stack.includes(tag)) {
        while (stack.length > 0) {
          const openTag = stack.pop() as string;
          output.push(`</${openTag}>`);
          if (openTag === tag) break;
        }
      }
      continue;
    }

    const openMatch = token.match(/^<\s*([a-z0-9]+)([^>]*)>$/i);
    if (!openMatch) continue;

    let tag = openMatch[1].toLowerCase();
    const attributes = openMatch[2] || "";
    if (tag === "div") tag = "p";
    if (tag === "b") tag = "strong";
    if (tag === "i") tag = "em";
    if (!ALLOWED_TAGS.has(tag)) continue;

    if (tag === "a") {
      const hrefMatch = attributes.match(/\shref\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i);
      const rawHref = hrefMatch ? hrefMatch[1].replace(/^['"]|['"]$/g, "").trim() : "";
      if (!rawHref || !isSafeHref(rawHref)) {
        output.push("<a>");
        stack.push("a");
        continue;
      }
      output.push(`<a href="${escapeAttribute(rawHref)}">`);
      stack.push("a");
      continue;
    }

    output.push(`<${tag}>`);
    if (!VOID_TAGS.has(tag)) {
      stack.push(tag);
    }
  }

  while (stack.length > 0) {
    output.push(`</${stack.pop()}>`);
  }

  return output.join("").trim();
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function validateDraft(body: RequestBody): { draft?: MessageDraft; error?: string } {
  const subject = String(body.subject || "").trim().replace(/\s+/g, " ");
  if (!subject || subject.length > 140) {
    return { error: "Subject is required and must be 140 characters or fewer." };
  }

  const submittedHtml = String(body.html || "");
  const sanitizedHtml = sanitizeHtml(submittedHtml);
  const text = htmlToText(sanitizedHtml);
  if (!text) {
    return { error: "Message is required." };
  }

  if (submittedHtml.length > 50000 || sanitizedHtml.length > 50000) {
    return { error: "Message is too long." };
  }

  return { draft: { subject, sanitizedHtml, text } };
}

function messageFrom(): string {
  return Deno.env.get("DASHBOARD_MESSAGE_FROM") || DEFAULT_FROM;
}

function standardFooterHtml(): string {
  return [
    '<hr style="border:0;border-top:1px solid #d7d7d7;margin:24px 0 16px;">',
    '<p style="margin:0 0 8px;font-weight:700;">LifeGate Community</p>',
    `<p style="margin:0;"><a href="${FOOTER_LINK}">Manage Your Group Here</a></p>`
  ].join("");
}

function standardFooterText(): string {
  return `\n\n--\nLifeGate Community\nManage Your Group Here: ${FOOTER_LINK}`;
}

function renderMessage(draft: MessageDraft, options: { isTest?: boolean } = {}): { subject: string; html: string; text: string } {
  const testBannerHtml = options.isTest
    ? '<p style="border:1px solid #d7d7d7;padding:12px;font-weight:700;">TEST MESSAGE - sent only to the authenticated admin.</p>'
    : "";
  const testBannerText = options.isTest ? "TEST MESSAGE - sent only to the authenticated admin.\n\n" : "";
  const subject = options.isTest ? `[TEST] ${draft.subject}` : draft.subject;

  return {
    subject,
    html: `${testBannerHtml}${draft.sanitizedHtml}${standardFooterHtml()}`,
    text: `${testBannerText}${draft.text}${standardFooterText()}`
  };
}

async function getAuthenticatedUser(request: Request, supabaseUrl: string, supabaseKey: string): Promise<AuthUser> {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const user = await response.json() as AuthUser;
  if (!user?.id) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return user;
}

async function getPortalUser(supabaseUrl: string, supabaseKey: string, userId: string): Promise<PortalUserRow | null> {
  const params = new URLSearchParams({
    select: "user_id,email,is_admin",
    user_id: `eq.${userId}`,
    limit: "1"
  });

  const response = await fetch(`${supabaseUrl}/rest/v1/portal_users?${params}`, {
    headers: supabaseHeaders(supabaseKey)
  });

  if (!response.ok) {
    throw new Error(`Portal user lookup failed: ${await response.text()}`);
  }

  const rows = await response.json() as PortalUserRow[];
  return rows[0] || null;
}

async function requireAdmin(request: Request): Promise<{ supabaseUrl: string; supabaseKey: string; user: AuthUser; adminEmail: string }> {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  const supabaseKey = resolveSupabaseElevatedKey();
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase elevated credentials are not configured.");
  }

  const user = await getAuthenticatedUser(request, supabaseUrl, supabaseKey);
  const portalUser = await getPortalUser(supabaseUrl, supabaseKey, user.id);
  if (!portalUser?.is_admin) {
    throw new Response("Forbidden", { status: 403 });
  }

  const adminEmail = normalizeEmail(user.email || portalUser.email);
  if (!isValidEmail(adminEmail)) {
    throw new Response("Forbidden", { status: 403 });
  }

  return { supabaseUrl, supabaseKey, user, adminEmail };
}

async function loadRecipients(supabaseUrl: string, supabaseKey: string): Promise<{ recipients: Recipient[]; skippedInvalidCount: number }> {
  const response = await fetch(`${supabaseUrl}/rest/v1/portal_users?select=email`, {
    headers: supabaseHeaders(supabaseKey)
  });

  if (!response.ok) {
    throw new Error(`Recipient lookup failed: ${await response.text()}`);
  }

  const rows = await response.json() as Array<{ email: string | null }>;
  const seen = new Set<string>();
  let skippedInvalidCount = 0;
  const recipients: Recipient[] = [];

  for (const row of rows) {
    const email = normalizeEmail(row.email);
    if (!email || !isValidEmail(email)) {
      skippedInvalidCount += 1;
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    recipients.push({ email });
  }

  return { recipients, skippedInvalidCount };
}

async function auditExists(supabaseUrl: string, supabaseKey: string, messageId: string): Promise<boolean> {
  const params = new URLSearchParams({
    select: "message_id",
    message_id: `eq.${messageId}`,
    limit: "1"
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/dashboard_message_audits?${params}`, {
    headers: supabaseHeaders(supabaseKey)
  });
  if (!response.ok) {
    throw new Error(`Audit lookup failed: ${await response.text()}`);
  }
  const rows = await response.json() as Array<{ message_id: string }>;
  return rows.length > 0;
}

async function insertAudit(
  supabaseUrl: string,
  supabaseKey: string,
  values: {
    messageId: string;
    userId: string;
    adminEmail: string;
    subject: string;
    recipientCount: number;
    skippedInvalidCount: number;
    isTest: boolean;
  }
): Promise<void> {
  const response = await fetch(`${supabaseUrl}/rest/v1/dashboard_message_audits`, {
    method: "POST",
    headers: supabaseHeaders(supabaseKey, { Prefer: "return=minimal" }),
    body: JSON.stringify({
      message_id: values.messageId,
      sending_admin_user_id: values.userId,
      sending_admin_email: values.adminEmail,
      subject: values.subject,
      recipient_count: values.recipientCount,
      skipped_invalid_count: values.skippedInvalidCount,
      is_test: values.isTest,
      overall_status: "started"
    })
  });

  if (!response.ok) {
    throw new Error(`Audit insert failed: ${await response.text()}`);
  }
}

async function updateAudit(
  supabaseUrl: string,
  supabaseKey: string,
  messageId: string,
  values: {
    successfulCount: number;
    failedCount: number;
    status: AuditStatus;
  }
): Promise<void> {
  const response = await fetch(`${supabaseUrl}/rest/v1/dashboard_message_audits?message_id=eq.${messageId}`, {
    method: "PATCH",
    headers: supabaseHeaders(supabaseKey, { Prefer: "return=minimal" }),
    body: JSON.stringify({
      successful_count: values.successfulCount,
      failed_count: values.failedCount,
      completed_at: new Date().toISOString(),
      overall_status: values.status
    })
  });

  if (!response.ok) {
    throw new Error(`Audit update failed: ${await response.text()}`);
  }
}

async function sendResendEmail(params: {
  messageId: string;
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `${params.messageId}:${params.to}`
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      reply_to: params.replyTo,
      subject: params.subject,
      html: params.html,
      text: params.text
    })
  });

  if (!response.ok) {
    throw new Error(`Resend request failed with status ${response.status}.`);
  }
}

function validateMessageId(value: unknown): string {
  const messageId = String(value || "").trim();
  if (!MESSAGE_ID_PATTERN.test(messageId)) {
    throw new Response("Invalid message ID.", { status: 400 });
  }
  return messageId;
}

function previewPayload(draft: MessageDraft, adminEmail: string, isTest = false): Record<string, unknown> {
  const rendered = renderMessage(draft, { isTest });
  return {
    subject: rendered.subject,
    from: messageFrom(),
    replyTo: adminEmail,
    html: rendered.html
  };
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin)
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(origin, 405, { error: "Method not allowed." });
  }

  if (!isAllowedOrigin(origin)) {
    return jsonResponse(origin, 403, { error: "Origin not allowed." });
  }

  let body: RequestBody;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return jsonResponse(origin, 400, { error: "Invalid JSON request body." });
    }
    body = parsed as RequestBody;
  } catch {
    return jsonResponse(origin, 400, { error: "Invalid JSON request body." });
  }

  try {
    const { supabaseUrl, supabaseKey, user, adminEmail } = await requireAdmin(request);
    const action = String(body.action || "").trim();

    if (action === "summary") {
      const { recipients, skippedInvalidCount } = await loadRecipients(supabaseUrl, supabaseKey);
      return jsonResponse(origin, 200, {
        audienceLabel: "All Dashboard Users",
        eligibleRecipientCount: recipients.length,
        skippedInvalidCount,
        from: messageFrom(),
        replyTo: adminEmail,
        safeRecipientLimit: SAFE_RECIPIENT_LIMIT
      });
    }

    const { draft, error } = validateDraft(body);
    if (error || !draft) {
      return jsonResponse(origin, 400, { error });
    }

    if (action === "preview") {
      return jsonResponse(origin, 200, previewPayload(draft, adminEmail));
    }

    if (action !== "test" && action !== "send") {
      return jsonResponse(origin, 400, { error: "Unsupported action." });
    }

    const messageId = validateMessageId(body.messageId);
    if (await auditExists(supabaseUrl, supabaseKey, messageId)) {
      return jsonResponse(origin, 409, { error: "This message has already been submitted." });
    }

    const mode: SendMode = action === "test" ? "test" : "production";
    const { recipients, skippedInvalidCount } = mode === "test"
      ? { recipients: [{ email: adminEmail }], skippedInvalidCount: 0 }
      : await loadRecipients(supabaseUrl, supabaseKey);
    if (mode === "production" && recipients.length > SAFE_RECIPIENT_LIMIT) {
      return jsonResponse(origin, 400, { error: "Recipient count exceeds this version's safe send limit." });
    }
    const rendered = renderMessage(draft, { isTest: mode === "test" });
    const from = messageFrom();

    await insertAudit(supabaseUrl, supabaseKey, {
      messageId,
      userId: user.id,
      adminEmail,
      subject: rendered.subject,
      recipientCount: recipients.length,
      skippedInvalidCount,
      isTest: mode === "test"
    });

    let successfulCount = 0;
    let failedCount = 0;

    for (const recipient of recipients) {
      try {
        await sendResendEmail({
          messageId,
          to: recipient.email,
          from,
          replyTo: adminEmail,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text
        });
        successfulCount += 1;
      } catch (error) {
        failedCount += 1;
        console.error(`${FUNCTION_NAME} recipient send failed.`, {
          messageId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const status: AuditStatus = failedCount === 0
      ? "completed"
      : successfulCount > 0 ? "partial_failure" : "failed";

    await updateAudit(supabaseUrl, supabaseKey, messageId, {
      successfulCount,
      failedCount,
      status
    });

    return jsonResponse(origin, 200, {
      eligibleRecipientCount: recipients.length,
      successfulCount,
      failedCount,
      skippedInvalidCount,
      preview: mode === "test" ? previewPayload(draft, adminEmail, true) : undefined
    });
  } catch (error) {
    if (error instanceof Response) {
      const status = error.status || 500;
      return jsonResponse(origin, status, {
        error: status === 403
          ? "Administrator access required."
          : status === 400 ? "Invalid message request." : "Request could not be authorized."
      });
    }

    console.error(`${FUNCTION_NAME} failed.`, error instanceof Error ? error.message : error);
    return jsonResponse(origin, 500, { error: "Message request could not be completed." });
  }
});

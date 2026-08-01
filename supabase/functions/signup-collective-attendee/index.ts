const ALLOWED_PRODUCTION_ORIGINS = new Set([
  "https://lifegatecommunity.com",
  "https://www.lifegatecommunity.com"
]);

const DEFAULT_FROM = "LifeGate Community <messages@lifegatecommunity.com>";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_TTL_MS = 15 * 60 * 1000;
const CLOSED_MESSAGE = "We’re sorry, this group is currently closed due to capacity.";

type RequestBody = Record<string, unknown>;

type SignupPayload = {
  collectiveId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  normalizedEmail: string;
  normalizedPhone: string;
  adultCount: number;
  childCount: number;
};

type CollectiveDetails = {
  id: string;
  city: string;
  crossStreets: string;
  displayName: string;
};

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

function normalizePhone(value: unknown): string {
  return normalizeString(value, 40).replace(/\D/g, "");
}

function normalizeCount(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return Number.NaN;
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

async function verifyRecaptcha(token: string, request: Request): Promise<boolean> {
  const secret = Deno.env.get("RECAPTCHA_SECRET_KEY") || "";
  if (!secret) throw new Error("RECAPTCHA_SECRET_KEY is not configured.");

  const body = new URLSearchParams({
    secret,
    response: token,
    remoteip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || ""
  });
  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) throw new Error("Failed to verify reCAPTCHA.");
  const result = await response.json();
  return result.success === true;
}

function buildSignupPayload(body: RequestBody): { payload?: SignupPayload; error?: string } {
  const collectiveId = normalizeString(body.collectiveId, 120);
  const firstName = normalizeString(body.firstName, 80);
  const lastName = normalizeString(body.lastName, 80);
  const phone = normalizeString(body.phone, 40);
  const email = normalizeString(body.email, 254);
  const emailConfirm = normalizeString(body.emailConfirm, 254);
  const normalizedEmail = normalizeEmail(email);
  const normalizedEmailConfirm = normalizeEmail(emailConfirm);
  const normalizedPhone = normalizePhone(phone);
  const adultCount = normalizeCount(body.adultCount);
  const childCount = normalizeCount(body.childCount);
  const privacyAccepted = body.privacyAccepted === true;

  if (!collectiveId) return { error: "Collective is required." };
  if (!firstName || !lastName) return { error: "First and last name are required." };
  if (!EMAIL_PATTERN.test(normalizedEmail)) return { error: "Email is invalid." };
  if (normalizedEmail !== normalizedEmailConfirm) return { error: "Email entries must match." };
  if (!/^[0-9]{10,15}$/.test(normalizedPhone)) return { error: "Phone number is invalid." };
  if (!Number.isInteger(adultCount) || adultCount < 1 || adultCount > 10) {
    return { error: "Number of adults is invalid." };
  }
  if (!Number.isInteger(childCount) || childCount < 0 || childCount > 10) {
    return { error: "Number of kids is invalid." };
  }
  if (!privacyAccepted) return { error: "Please accept the privacy agreement." };

  return {
    payload: {
      collectiveId,
      firstName,
      lastName,
      phone,
      email,
      normalizedEmail,
      normalizedPhone,
      adultCount,
      childCount
    }
  };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacSignature(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return bytesToBase64Url(new Uint8Array(signature));
}

function randomConfirmationCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const value = ((bytes[0] << 24) >>> 0) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3];
  return String(value % 1000000).padStart(6, "0");
}

async function createConfirmationToken(payload: SignupPayload, conflictKind: string, code: string): Promise<string> {
  const secret = Deno.env.get("COLLECTIVES_SIGNUP_TOKEN_SECRET") || "";
  if (!secret) throw new Error("COLLECTIVES_SIGNUP_TOKEN_SECRET is not configured.");
  const encodedPayload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({
    payload,
    conflictKind,
    codeHash: await hmacSignature(secret, code),
    expiresAt: Date.now() + TOKEN_TTL_MS
  })));
  const signature = await hmacSignature(secret, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

async function verifyConfirmationToken(token: string, payload: SignupPayload, code: string): Promise<boolean> {
  const secret = Deno.env.get("COLLECTIVES_SIGNUP_TOKEN_SECRET") || "";
  if (!secret) throw new Error("COLLECTIVES_SIGNUP_TOKEN_SECRET is not configured.");
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return false;
  const expected = await hmacSignature(secret, encodedPayload);
  if (signature !== expected) return false;

  const decoded = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encodedPayload))) as {
    payload?: SignupPayload;
    codeHash?: string;
    expiresAt?: number;
  };
  if (!decoded.expiresAt || decoded.expiresAt < Date.now()) return false;
  if (JSON.stringify(decoded.payload) !== JSON.stringify(payload)) return false;
  return decoded.codeHash === await hmacSignature(secret, normalizeString(code, 16));
}

async function callSignupRpc(
  supabaseUrl: string,
  key: string,
  payload: SignupPayload,
  confirmed: boolean
): Promise<Record<string, unknown>> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/complete_fall_2026_collective_signup`, {
    method: "POST",
    headers: supabaseHeaders(key),
    body: JSON.stringify({
      p_collective_id: payload.collectiveId,
      p_first_name: payload.firstName,
      p_last_name: payload.lastName,
      p_phone: payload.phone,
      p_email: payload.email,
      p_adult_count: payload.adultCount,
      p_child_count: payload.childCount,
      p_confirmed: confirmed
    })
  });
  if (!response.ok) {
    const text = await response.text();
    let message = "Unable to complete signup right now.";
    try {
      message = JSON.parse(text)?.message || message;
    } catch {
      message = text || message;
    }
    throw new Error(message);
  }
  return await response.json();
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

async function loadCollectiveDetails(supabaseUrl: string, key: string, collectiveId: string): Promise<CollectiveDetails | null> {
  const collectiveParams = new URLSearchParams({
    select: "id,city,cross_streets",
    id: `eq.${collectiveId}`,
    limit: "1"
  });
  const collectiveResponse = await fetch(`${supabaseUrl}/rest/v1/collectives?${collectiveParams}`, {
    headers: supabaseHeaders(key)
  });
  if (!collectiveResponse.ok) throw new Error(`Collective lookup failed: ${await collectiveResponse.text()}`);
  const collectives = await collectiveResponse.json();
  const collective = Array.isArray(collectives) ? collectives[0] : null;
  if (!collective) return null;

  const hostParams = new URLSearchParams({
    select: "pending_last_name,user_id",
    collective_id: `eq.${collectiveId}`,
    is_primary: "eq.true",
    limit: "1"
  });
  const hostResponse = await fetch(`${supabaseUrl}/rest/v1/collective_hosts?${hostParams}`, {
    headers: supabaseHeaders(key)
  });
  if (!hostResponse.ok) throw new Error(`Collective host lookup failed: ${await hostResponse.text()}`);
  const hostRows = await hostResponse.json();
  const host = Array.isArray(hostRows) ? hostRows[0] : null;

  let lastName = normalizeString(host?.pending_last_name, 80);
  const userId = normalizeString(host?.user_id, 80);
  if (!lastName && userId) {
    const portalParams = new URLSearchParams({
      select: "last_name",
      user_id: `eq.${userId}`,
      limit: "1"
    });
    const portalResponse = await fetch(`${supabaseUrl}/rest/v1/portal_users?${portalParams}`, {
      headers: supabaseHeaders(key)
    });
    if (!portalResponse.ok) throw new Error(`Portal user lookup failed: ${await portalResponse.text()}`);
    const portalRows = await portalResponse.json();
    lastName = normalizeString(Array.isArray(portalRows) ? portalRows[0]?.last_name : "", 80);
  }

  return {
    id: collective.id,
    city: normalizeString(collective.city, 120),
    crossStreets: normalizeString(collective.cross_streets, 160),
    displayName: `${lastName || "Host"} Collective`
  };
}

async function sendResendEmail(params: {
  idempotencyKey: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");
  const body: Record<string, unknown> = {
    from: Deno.env.get("COLLECTIVES_FROM_EMAIL") || DEFAULT_FROM,
    to: [params.to],
    subject: params.subject,
    html: params.html,
    text: params.text
  };
  if (params.replyTo) body.reply_to = params.replyTo;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": params.idempotencyKey
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Resend request failed with status ${response.status}: ${await response.text()}`);
}

function attendeeConfirmation(details: CollectiveDetails, payload: SignupPayload): { subject: string; html: string; text: string } {
  const subject = `You're signed up for ${details.displayName}`;
  const text = [
    `You're signed up for ${details.displayName}.`,
    `Cross streets: ${details.crossStreets}`,
    `Adults: ${payload.adultCount}`,
    `Kids: ${payload.childCount}`,
    "The host will follow up with more details."
  ].join("\n");
  const html = `
    <p>You're signed up for <strong>${escapeHtml(details.displayName)}</strong>.</p>
    <p><strong>Cross streets:</strong> ${escapeHtml(details.crossStreets)}</p>
    <p><strong>Adults:</strong> ${payload.adultCount}<br><strong>Kids:</strong> ${payload.childCount}</p>
    <p>The host will follow up with more details.</p>
  `;
  return { subject, html, text };
}

function hostSignupNotification(details: CollectiveDetails, payload: SignupPayload): { subject: string; html: string; text: string } {
  const fullName = `${payload.firstName} ${payload.lastName}`;
  const subject = `New signup for ${details.displayName}`;
  const text = [
    `New signup for ${details.displayName}`,
    `Name: ${fullName}`,
    `Phone: ${payload.phone}`,
    `Email: ${payload.email}`,
    `Adults: ${payload.adultCount}`,
    `Kids: ${payload.childCount}`
  ].join("\n");
  const html = `
    <p>New signup for <strong>${escapeHtml(details.displayName)}</strong>.</p>
    <p>
      <strong>Name:</strong> ${escapeHtml(fullName)}<br>
      <strong>Phone:</strong> ${escapeHtml(payload.phone)}<br>
      <strong>Email:</strong> ${escapeHtml(payload.email)}<br>
      <strong>Adults:</strong> ${payload.adultCount}<br>
      <strong>Kids:</strong> ${payload.childCount}
    </p>
  `;
  return { subject, html, text };
}

function priorHostNotification(details: CollectiveDetails): { subject: string; html: string; text: string } {
  const subject = `Signup moved from ${details.displayName}`;
  const text = `A Fall 2026 attendee registration was removed or moved from ${details.displayName}.`;
  const html = `<p>A Fall 2026 attendee registration was removed or moved from <strong>${escapeHtml(details.displayName)}</strong>.</p>`;
  return { subject, html, text };
}

async function sendConflictCode(payload: SignupPayload, code: string): Promise<void> {
  await sendResendEmail({
    idempotencyKey: `collective-signup-code:${payload.normalizedEmail}:${Date.now()}`,
    to: payload.email,
    subject: "Your Collective signup confirmation code",
    text: [
      "Use this code to move your Fall 2026 Collective signup:",
      code,
      "This code expires in 15 minutes."
    ].join("\n"),
    html: `
      <p>Use this code to move your Fall 2026 Collective signup:</p>
      <p><strong>${escapeHtml(code)}</strong></p>
      <p>This code expires in 15 minutes.</p>
    `
  });
}

async function sendSignupEmails(
  supabaseUrl: string,
  key: string,
  payload: SignupPayload,
  result: Record<string, unknown>
): Promise<void> {
  const details = await loadCollectiveDetails(supabaseUrl, key, payload.collectiveId);
  if (!details) return;

  const recipientEmails = await loadRecipients(supabaseUrl, key, payload.collectiveId);
  const hostMessage = hostSignupNotification(details, payload);
  for (const recipient of recipientEmails) {
    await sendResendEmail({
      idempotencyKey: `${result.attendee_id || payload.normalizedEmail}:host:${recipient}`,
      to: recipient,
      replyTo: payload.email,
      ...hostMessage
    });
  }

  const attendeeMessage = attendeeConfirmation(details, payload);
  await sendResendEmail({
    idempotencyKey: `${result.attendee_id || payload.normalizedEmail}:attendee:${payload.normalizedEmail}`,
    to: payload.email,
    ...attendeeMessage
  });

  const priorIds = Array.isArray(result.prior_collective_ids)
    ? Array.from(new Set(result.prior_collective_ids.map((id) => String(id)).filter((id) => id && id !== payload.collectiveId)))
    : [];
  for (const priorCollectiveId of priorIds) {
    const priorDetails = await loadCollectiveDetails(supabaseUrl, key, priorCollectiveId);
    if (!priorDetails) continue;
    const priorRecipients = await loadRecipients(supabaseUrl, key, priorCollectiveId);
    const priorMessage = priorHostNotification(priorDetails);
    for (const recipient of priorRecipients) {
      await sendResendEmail({
        idempotencyKey: `${result.attendee_id || payload.normalizedEmail}:prior:${priorCollectiveId}:${recipient}`,
        to: recipient,
        ...priorMessage
      });
    }
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
    return jsonResponse(origin, 400, { error: "Request body must be valid JSON." });
  }

  const requestBody = body as RequestBody;
  const recaptchaToken = normalizeString(requestBody.recaptchaToken, 4096);
  if (!recaptchaToken) return jsonResponse(origin, 400, { error: "Missing reCAPTCHA token." });
  if (normalizeString(requestBody.website, 120)) {
    return jsonResponse(origin, 200, { status: "success", message: "You're signed up for this Collective." });
  }

  const { payload, error } = buildSignupPayload(requestBody);
  if (error || !payload) return jsonResponse(origin, 400, { error });

  try {
    if (!await verifyRecaptcha(recaptchaToken, request)) {
      return jsonResponse(origin, 400, { error: "reCAPTCHA verification failed." });
    }

    const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
    const supabaseKey = resolveSupabaseElevatedKey();
    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase elevated credentials are not configured.");

    const confirmationToken = normalizeString(requestBody.confirmationToken, 8192);
    const confirmationCode = normalizeString(requestBody.confirmationCode, 16);
    const confirmed = Boolean(confirmationToken);
    if (confirmed && !await verifyConfirmationToken(confirmationToken, payload, confirmationCode)) {
      return jsonResponse(origin, 400, { error: "Signup confirmation expired or the code is invalid. Please submit the form again." });
    }

    const result = await callSignupRpc(supabaseUrl, supabaseKey, payload, confirmed);
    if (result.status === "conflict") {
      const conflictKind = String(result.conflict_kind || "single");
      const code = randomConfirmationCode();
      const token = await createConfirmationToken(payload, conflictKind, code);
      await sendConflictCode(payload, code);
      return jsonResponse(origin, 409, {
        status: "conflict",
        conflictKind,
        confirmationToken: token,
        codeSent: true,
        message: conflictKind === "multiple"
          ? "We found existing signup information connected to a different Collective. Would you like to cancel the previous signup information and sign up for this Collective instead?"
          : "You are already signed up for a different Collective. Would you like to cancel that signup and sign up for this Collective instead?"
      });
    }

    if (result.status === "same_collective") {
      return jsonResponse(origin, 200, {
        status: "already_registered",
        message: "You are already signed up for this Collective."
      });
    }

    try {
      await sendSignupEmails(supabaseUrl, supabaseKey, payload, result);
    } catch (emailError) {
      console.error("Collective attendee signup emails failed.", emailError instanceof Error ? emailError.message : emailError);
    }

    return jsonResponse(origin, 200, {
      status: "success",
      message: "You're signed up for this Collective."
    });
  } catch (err) {
    console.error("signup-collective-attendee failed.", err instanceof Error ? err.message : err);
    const message = err instanceof Error ? err.message : "Unable to complete signup right now.";
    return jsonResponse(origin, message === CLOSED_MESSAGE ? 403 : 500, {
      error: message === CLOSED_MESSAGE ? CLOSED_MESSAGE : "Unable to complete signup right now."
    });
  }
});

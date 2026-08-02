const ALLOWED_PRODUCTION_ORIGINS = new Set([
  "https://lifegatecommunity.com",
  "https://www.lifegatecommunity.com"
]);

const VALID_AUDIENCES = new Set(["Everyone Welcome", "Men", "Women", "Couples"]);
const VALID_CHILDCARE_OPTIONS = new Set([
  "Childcare Available | Sitter Provided",
  "Children Welcome | No Sitter Provided",
  "Childcare Not Provided"
]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\([0-9]{3}\) [0-9]{3}-[0-9]{4}$/;

type RequestBody = Record<string, unknown>;

type PortalUser = {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
};

type Submission = {
  primaryFirstName: string;
  primaryLastName: string;
  primaryEmail: string;
  primaryPhone: string;
  secondaryEmail: string;
  city: string;
  zipCode: string;
  crossStreets: string;
  audience: string;
  childcareOption: string;
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

function normalizeString(value: unknown, maxLength: number): string {
  return (typeof value === "string" ? value.trim() : "").slice(0, maxLength);
}

function normalizeEmail(value: unknown): string {
  return normalizeString(value, 254).toLowerCase();
}

function buildSubmission(body: RequestBody): { submission?: Submission; error?: string } {
  const submission: Submission = {
    primaryFirstName: normalizeString(body.primaryFirstName, 80),
    primaryLastName: normalizeString(body.primaryLastName, 80),
    primaryEmail: normalizeEmail(body.primaryEmail),
    primaryPhone: normalizeString(body.primaryPhone, 14),
    secondaryEmail: normalizeEmail(body.secondaryEmail),
    city: normalizeString(body.city, 120),
    zipCode: normalizeString(body.zipCode, 5),
    crossStreets: normalizeString(body.crossStreets, 200),
    audience: normalizeString(body.audience, 32),
    childcareOption: normalizeString(body.childcareOption, 80)
  };

  if (!submission.primaryFirstName) return { error: "Primary host first name is required." };
  if (!submission.primaryLastName) return { error: "Primary host last name is required." };
  if (!EMAIL_PATTERN.test(submission.primaryEmail)) return { error: "A valid primary host email is required." };
  if (!PHONE_PATTERN.test(submission.primaryPhone)) return { error: "Primary host phone number is invalid." };
  if (submission.secondaryEmail && !EMAIL_PATTERN.test(submission.secondaryEmail)) return { error: "Second host email is invalid." };
  if (submission.secondaryEmail && submission.secondaryEmail === submission.primaryEmail) {
    return { error: "Second host email must be different from the primary host email." };
  }
  if (!submission.city) return { error: "City is required." };
  if (!/^[0-9]{5}$/.test(submission.zipCode)) return { error: "ZIP code must be exactly 5 digits." };
  if (!submission.crossStreets) return { error: "Cross streets are required." };
  if (/\d{2,}\s+\S+/.test(submission.crossStreets)) {
    return { error: "Please enter nearby cross streets only, not an exact home address." };
  }
  if (!VALID_AUDIENCES.has(submission.audience)) return { error: "Audience is invalid." };
  if (!VALID_CHILDCARE_OPTIONS.has(submission.childcareOption)) return { error: "Childcare option is invalid." };
  return { submission };
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

function supabaseHeaders(key: string, extra: Record<string, string> = {}): HeadersInit {
  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
    ...extra
  };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  return headers;
}

async function currentAuthUserId(request: Request, supabaseUrl: string): Promise<{ id: string; email: string } | null> {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: Deno.env.get("SUPABASE_ANON_KEY") || "",
      Authorization: authorization
    }
  });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === "string" ? { id: user.id, email: normalizeEmail(user.email) } : null;
}

async function findPortalUserByEmail(supabaseUrl: string, key: string, email: string): Promise<PortalUser | null> {
  const params = new URLSearchParams({
    select: "user_id,email,first_name,last_name",
    email: `eq.${email}`,
    limit: "1"
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/portal_users?${params}`, {
    headers: supabaseHeaders(key)
  });
  if (!response.ok) throw new Error(`Portal user lookup failed: ${await response.text()}`);
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function geocode(submission: Submission): Promise<{ latitude: number; longitude: number; formattedLocation: string }> {
  const apiKey = Deno.env.get("GOOGLE_GEOCODING_API_KEY") || Deno.env.get("GOOGLE_MAPS_API_KEY") || "";
  if (!apiKey) throw new Error("GOOGLE_GEOCODING_API_KEY is not configured.");

  const address = `${submission.crossStreets}, ${submission.city}, CO ${submission.zipCode}`;
  const params = new URLSearchParams({
    address,
    key: apiKey,
    components: "country:US|administrative_area:CO"
  });
  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
  if (!response.ok) throw new Error("Google geocoding request failed.");
  const result = await response.json();
  if (result.status !== "OK" || !result.results?.[0]?.geometry?.location) {
    throw new Error("We could not place those cross streets on the map. Please check the city, ZIP code, and cross streets.");
  }
  const location = result.results[0].geometry.location;
  return {
    latitude: location.lat,
    longitude: location.lng,
    formattedLocation: result.results[0].formatted_address || address
  };
}

async function insertCollective(
  supabaseUrl: string,
  key: string,
  submission: Submission,
  coords: { latitude: number; longitude: number; formattedLocation: string },
  primaryUserId: string | null,
  secondaryUserId: string | null
): Promise<string> {
  const id = crypto.randomUUID();
  const row = {
    id,
    submitted_at: new Date().toISOString(),
    approval_status: "pending",
    listing_status: "inactive",
    city: submission.city,
    zip_code: submission.zipCode,
    cross_streets: submission.crossStreets,
    formatted_location: coords.formattedLocation,
    audience: submission.audience,
    childcare_option: submission.childcareOption,
    primary_host_phone: submission.primaryPhone,
    latitude: coords.latitude,
    longitude: coords.longitude
  };

  const collectiveResponse = await fetch(`${supabaseUrl}/rest/v1/collectives`, {
    method: "POST",
    headers: supabaseHeaders(key, { Prefer: "return=minimal" }),
    body: JSON.stringify(row)
  });
  if (!collectiveResponse.ok) throw new Error(`Collective insert failed: ${await collectiveResponse.text()}`);

  const hostRows = [
    {
      collective_id: id,
      user_id: primaryUserId,
      pending_first_name: primaryUserId ? null : submission.primaryFirstName,
      pending_last_name: primaryUserId ? null : submission.primaryLastName,
      pending_email: primaryUserId ? null : submission.primaryEmail,
      phone: submission.primaryPhone,
      is_primary: true
    }
  ];
  if (submission.secondaryEmail) {
    hostRows.push({
      collective_id: id,
      user_id: secondaryUserId,
      pending_first_name: null,
      pending_last_name: null,
      pending_email: secondaryUserId ? null : submission.secondaryEmail,
      phone: null,
      is_primary: false
    });
  }

  const hostResponse = await fetch(`${supabaseUrl}/rest/v1/collective_hosts`, {
    method: "POST",
    headers: supabaseHeaders(key, { Prefer: "return=minimal" }),
    body: JSON.stringify(hostRows)
  });
  if (!hostResponse.ok) throw new Error(`Collective hosts insert failed: ${await hostResponse.text()}`);

  return id;
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
  const recaptchaToken = typeof requestBody.recaptchaToken === "string" ? requestBody.recaptchaToken : "";
  if (!recaptchaToken) return jsonResponse(origin, 400, { error: "Missing reCAPTCHA token." });

  const { submission, error } = buildSubmission(requestBody);
  if (error || !submission) return jsonResponse(origin, 400, { error });

  try {
    if (!await verifyRecaptcha(recaptchaToken, request)) {
      return jsonResponse(origin, 400, { error: "reCAPTCHA verification failed." });
    }

    const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
    const supabaseKey = resolveSupabaseElevatedKey();
    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase elevated credentials are not configured.");

    const currentUser = await currentAuthUserId(request, supabaseUrl);
    const primaryUser = await findPortalUserByEmail(supabaseUrl, supabaseKey, submission.primaryEmail);
    const primaryUserId = currentUser && currentUser.email === submission.primaryEmail && primaryUser?.user_id === currentUser.id
      ? currentUser.id
      : primaryUser?.user_id || null;
    const secondaryUser = submission.secondaryEmail
      ? await findPortalUserByEmail(supabaseUrl, supabaseKey, submission.secondaryEmail)
      : null;
    const coords = await geocode(submission);
    const id = await insertCollective(
      supabaseUrl,
      supabaseKey,
      submission,
      coords,
      primaryUserId,
      secondaryUser?.user_id || null
    );

    return jsonResponse(origin, 200, {
      ok: true,
      id,
      primaryHostLinked: Boolean(primaryUserId),
      secondHostLinked: submission.secondaryEmail ? Boolean(secondaryUser?.user_id) : null
    });
  } catch (err) {
    console.error("submit-collective failed.", err instanceof Error ? err.message : err);
    const message = err instanceof Error && err.message.startsWith("We could not place")
      ? err.message
      : "Unable to submit Collective right now.";
    return jsonResponse(origin, 500, { error: message });
  }
});

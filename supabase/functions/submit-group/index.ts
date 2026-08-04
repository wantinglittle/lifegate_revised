const ALLOWED_PRODUCTION_ORIGINS = new Set([
  "https://lifegatecommunity.com",
  "https://www.lifegatecommunity.com",
  "https://wantinglittle.github.io"
]);

const VALID_DAYS = new Set(["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
const VALID_HOURS = new Set(["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
const VALID_MINUTES = new Set(["", "00", "15", "30", "45"]);
const VALID_AMPM = new Set(["", "AM", "PM"]);
const VALID_AUDIENCES = new Set(["All", "Men", "Women"]);
const VALID_AGE_GROUPS = new Set(["All-ages", "Kids", "Teens", "Adult"]);

type RequestBody = Record<string, unknown>;

type Submission = {
  title: string;
  description: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  day: string;
  hour: string;
  minute: string;
  ampm: string;
  audience: string;
  ageGroup: string;
  city: string;
  zipCode: string;
  crossStreets: string;
  additionalInfo: string;
};

type GroupRow = {
  id: string;
  title: string;
  description: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  day: string | null;
  meeting_time: string | null;
  audience: string;
  age_group: string;
  city: string;
  zip_code: string;
  cross_streets: string;
  additional_info: string | null;
  status: "pending";
  submitted_at: string;
  latitude: number;
  longitude: number;
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
    "Access-Control-Allow-Headers": "Content-Type",
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

function normalizeString(value: unknown, maxLength: number): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.slice(0, maxLength);
}

function buildSubmission(body: RequestBody): { submission?: Submission; error?: string } {
  const submission: Submission = {
    title: normalizeString(body.title, 120),
    description: normalizeString(body.description, 500),
    contactName: normalizeString(body.contactName, 120),
    contactEmail: normalizeString(body.contactEmail, 254),
    contactPhone: normalizeString(body.contactPhone, 14),
    day: normalizeString(body.day, 20),
    hour: normalizeString(body.hour, 2),
    minute: normalizeString(body.minute, 2),
    ampm: normalizeString(body.ampm, 2),
    audience: normalizeString(body.audience, 10),
    ageGroup: normalizeString(body.ageGroup, 20),
    city: normalizeString(body.city, 120),
    zipCode: normalizeString(body.zipCode, 5),
    crossStreets: normalizeString(body.crossStreets, 200),
    additionalInfo: normalizeString(body.additionalInfo, 500)
  };

  if (!submission.title) return { error: "Community name is required." };
  if (!submission.description) return { error: "Description is required." };
  if (!submission.contactName) return { error: "Contact name is required." };
  if (!submission.contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submission.contactEmail)) {
    return { error: "A valid contact email is required." };
  }
  if (!/^\([0-9]{3}\) [0-9]{3}-[0-9]{4}$/.test(submission.contactPhone)) {
    return { error: "Phone number format is invalid." };
  }
  if (!VALID_DAYS.has(submission.day)) return { error: "Meeting day is invalid." };
  if (!VALID_HOURS.has(submission.hour)) return { error: "Meeting hour is invalid." };
  if (!VALID_MINUTES.has(submission.minute)) return { error: "Meeting minute is invalid." };
  if (!VALID_AMPM.has(submission.ampm)) return { error: "Meeting AM/PM value is invalid." };
  if (!VALID_AUDIENCES.has(submission.audience)) return { error: "Audience is invalid." };
  if (!VALID_AGE_GROUPS.has(submission.ageGroup)) return { error: "Age group is invalid." };
  if (!submission.city) return { error: "City is required." };
  if (!/^[0-9]{5}$/.test(submission.zipCode)) return { error: "ZIP code must be exactly 5 digits." };
  if (!submission.crossStreets) return { error: "Closest cross streets are required." };

  return { submission };
}

function toMeetingTime(hour: string, minute: string, ampm: string): string | null {
  if (!hour || !minute || !ampm) return null;

  let hour24 = Number.parseInt(hour, 10);
  if (ampm === "AM" && hour24 === 12) hour24 = 0;
  if (ampm === "PM" && hour24 !== 12) hour24 += 12;

  return `${String(hour24).padStart(2, "0")}:${minute}:00`;
}

async function geocode(submission: Submission): Promise<{ latitude: number; longitude: number }> {
  const apiKey = Deno.env.get("GOOGLE_GEOCODING_API_KEY") || "";
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
    longitude: location.lng
  };
}

function toGroupRow(submission: Submission, coords: { latitude: number; longitude: number }): GroupRow {
  return {
    id: crypto.randomUUID(),
    title: submission.title,
    description: submission.description,
    contact_name: submission.contactName,
    contact_email: submission.contactEmail,
    contact_phone: submission.contactPhone,
    day: submission.day || null,
    meeting_time: toMeetingTime(submission.hour, submission.minute, submission.ampm),
    audience: submission.audience,
    age_group: submission.ageGroup,
    city: submission.city,
    zip_code: submission.zipCode,
    cross_streets: submission.crossStreets,
    additional_info: submission.additionalInfo || null,
    status: "pending",
    submitted_at: new Date().toISOString(),
    latitude: coords.latitude,
    longitude: coords.longitude
  };
}

async function verifyRecaptcha(token: string, request: Request): Promise<boolean> {
  const secret = Deno.env.get("RECAPTCHA_SECRET_KEY") || "";
  if (!secret) {
    throw new Error("RECAPTCHA_SECRET_KEY is not configured.");
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const body = new URLSearchParams({
    secret,
    response: token,
    remoteip: forwardedFor
  });

  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    throw new Error("Failed to verify reCAPTCHA.");
  }

  const result = await response.json();
  return result.success === true;
}

function supabaseHeaders(key: string): HeadersInit {
  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
    Prefer: "return=minimal"
  };

  if (!key.startsWith("sb_secret_")) {
    headers.Authorization = `Bearer ${key}`;
  }

  return headers;
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

async function insertGroup(row: GroupRow): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseKey = resolveSupabaseElevatedKey();

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase elevated credentials are not configured.");
  }

  const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/groups`, {
    method: "POST",
    headers: supabaseHeaders(supabaseKey),
    body: JSON.stringify(row)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase insert failed: ${errorText}`);
  }
}

async function sendNotificationEmail(submission: Submission, rowId: string): Promise<void> {
  const publicKey = Deno.env.get("EMAILJS_PUBLIC_KEY") || "";
  const privateKey = Deno.env.get("EMAILJS_PRIVATE_KEY") || "";
  const serviceId = Deno.env.get("EMAILJS_SERVICE_ID") || "";
  const templateId = Deno.env.get("EMAILJS_TEMPLATE_ID") || "";

  if (!publicKey || !privateKey || !serviceId || !templateId) {
    console.warn("EmailJS settings are not fully configured; skipping notification email.", { rowId });
    return;
  }

  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      accessToken: privateKey,
      template_params: {
        title: submission.title,
        description: submission.description,
        contactName: submission.contactName,
        contactEmail: submission.contactEmail,
        contactPhone: submission.contactPhone,
        meetingDay: submission.day,
        meetingTime: `${submission.hour}:${submission.minute} ${submission.ampm}`.trim(),
        audience: submission.audience,
        ageGroup: submission.ageGroup,
        zipCode: submission.zipCode,
        crossStreets: submission.crossStreets,
        additionalInfo: submission.additionalInfo
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`EmailJS request failed: ${errorText}`);
  }
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
  if (!recaptchaToken) {
    return jsonResponse(origin, 400, { error: "Missing reCAPTCHA token." });
  }

  const { submission, error } = buildSubmission(requestBody);
  if (error || !submission) {
    return jsonResponse(origin, 400, { error });
  }

  try {
    const verificationOk = await verifyRecaptcha(recaptchaToken, request);
    if (!verificationOk) {
      return jsonResponse(origin, 400, { error: "reCAPTCHA verification failed." });
    }

    const coords = await geocode(submission);
    const row = toGroupRow(submission, coords);
    await insertGroup(row);

    try {
      await sendNotificationEmail(submission, row.id);
    } catch (emailError) {
      console.warn("Notification email failed after group insert.", {
        rowId: row.id,
        error: emailError instanceof Error ? emailError.message : String(emailError)
      });
    }

    return jsonResponse(origin, 200, { ok: true, id: row.id });
  } catch (err) {
    console.error("submit-group failed.", err instanceof Error ? err.message : err);
    const message = err instanceof Error && err.message.startsWith("We could not place")
      ? err.message
      : "Unable to submit group right now.";
    return jsonResponse(origin, message.startsWith("We could not place") ? 400 : 500, { error: message });
  }
});

const ALLOWED_PRODUCTION_ORIGINS = new Set([
  "https://lifegatecommunity.com",
  "https://www.lifegatecommunity.com",
  "https://wantinglittle.github.io"
]);

type RequestBody = Record<string, unknown>;
type JsonObject = Record<string, unknown>;

type AuthUser = {
  id: string;
  email: string;
};

type PortalUser = {
  user_id: string;
  email: string;
  is_admin: boolean;
};

type Group = {
  id: string;
  title: string;
  city: string;
  zip_code: string;
  cross_streets: string;
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

function readChanges(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
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

async function getAuthenticatedUser(request: Request, supabaseUrl: string): Promise<AuthUser | null> {
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

async function loadPortalUser(supabaseUrl: string, key: string, userId: string): Promise<PortalUser | null> {
  const params = new URLSearchParams({
    select: "user_id,email,is_admin",
    user_id: `eq.${userId}`,
    limit: "1"
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/portal_users?${params}`, {
    headers: supabaseHeaders(key)
  });
  if (!response.ok) throw new Error(`Portal user lookup failed: ${await response.text()}`);
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function loadGroup(supabaseUrl: string, key: string, groupId: string): Promise<Group | null> {
  const params = new URLSearchParams({
    select: "id,title,city,zip_code,cross_streets",
    id: `eq.${groupId}`,
    limit: "1"
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/groups?${params}`, {
    headers: supabaseHeaders(key)
  });
  if (!response.ok) throw new Error(`Group lookup failed: ${await response.text()}`);
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function validateLocation(values: { city: string; zip_code: string; cross_streets: string }): string | null {
  if (!values.city || values.city.length > 120) return "City is required.";
  if (!/^[0-9]{5}$/.test(values.zip_code)) return "ZIP code must be exactly 5 digits.";
  if (!values.cross_streets || values.cross_streets.length > 200) return "Cross streets are required.";
  return null;
}

async function geocode(values: { cross_streets: string; city: string; zip_code: string }): Promise<{
  latitude: number;
  longitude: number;
}> {
  const apiKey = Deno.env.get("GOOGLE_GEOCODING_API_KEY") || "";
  if (!apiKey) throw new Error("GOOGLE_GEOCODING_API_KEY is not configured.");

  const address = `${values.cross_streets}, ${values.city}, CO ${values.zip_code}`;
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

async function updateAdminGroupWithUserAuth(
  request: Request,
  supabaseUrl: string,
  groupId: string,
  changes: JsonObject
): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/update_admin_group`, {
    method: "POST",
    headers: {
      apikey: Deno.env.get("SUPABASE_ANON_KEY") || "",
      Authorization: request.headers.get("authorization") || "",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_group_id: groupId,
      p_changes: changes
    })
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof result?.message === "string" ? result.message : "Community update failed.";
    throw new Error(message);
  }
  return Array.isArray(result) ? result[0] || null : result;
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
  const groupId = normalizeString(requestBody.groupId, 80);
  const changes = readChanges(requestBody.changes);
  if (!groupId) return jsonResponse(origin, 400, { error: "Community is required." });

  try {
    const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
    const supabaseKey = resolveSupabaseElevatedKey();
    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase elevated credentials are not configured.");

    const user = await getAuthenticatedUser(request, supabaseUrl);
    if (!user) return jsonResponse(origin, 401, { error: "Authentication required." });

    const [portalUser, group] = await Promise.all([
      loadPortalUser(supabaseUrl, supabaseKey, user.id),
      loadGroup(supabaseUrl, supabaseKey, groupId)
    ]);
    if (!portalUser) return jsonResponse(origin, 403, { error: "Portal access is required." });
    if (portalUser.is_admin !== true) return jsonResponse(origin, 403, { error: "Administrator access required." });
    if (!group) return jsonResponse(origin, 404, { error: "Community not found." });

    const patch: JsonObject = { ...changes };
    const nextLocation = {
      city: group.city,
      zip_code: group.zip_code,
      cross_streets: group.cross_streets
    };

    if ("city" in changes) nextLocation.city = normalizeString(changes.city, 120);
    if ("zip_code" in changes) nextLocation.zip_code = normalizeString(changes.zip_code, 5);
    if ("cross_streets" in changes) nextLocation.cross_streets = normalizeString(changes.cross_streets, 200);

    const locationChanged =
      nextLocation.city !== group.city ||
      nextLocation.zip_code !== group.zip_code ||
      nextLocation.cross_streets !== group.cross_streets;

    if (locationChanged) {
      const locationError = validateLocation(nextLocation);
      if (locationError) return jsonResponse(origin, 400, { error: locationError });
      const coords = await geocode(nextLocation);
      patch.city = nextLocation.city;
      patch.zip_code = nextLocation.zip_code;
      patch.cross_streets = nextLocation.cross_streets;
      patch.latitude = coords.latitude;
      patch.longitude = coords.longitude;
    }

    const updated = await updateAdminGroupWithUserAuth(request, supabaseUrl, groupId, patch);
    return jsonResponse(origin, 200, { group: updated });
  } catch (err) {
    console.error("update-group failed.", err instanceof Error ? err.message : err);
    const rawMessage = err instanceof Error ? err.message : "";
    const message = rawMessage.startsWith("We could not place")
      ? rawMessage
      : "Unable to update Community right now.";
    return jsonResponse(origin, rawMessage.startsWith("We could not place") ? 400 : 500, { error: message });
  }
});

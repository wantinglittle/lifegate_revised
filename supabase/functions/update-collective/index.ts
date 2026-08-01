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
const VALID_APPROVAL_STATUSES = new Set(["pending", "approved"]);
const VALID_LISTING_STATUSES = new Set(["active", "inactive"]);

type RequestBody = Record<string, unknown>;
type JsonObject = Record<string, unknown>;

type AuthUser = {
  id: string;
  email: string;
};

type PortalUser = {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_admin: boolean;
};

type Collective = {
  id: string;
  approval_status: string;
  listing_status: string;
  is_closed: boolean;
  approved_at: string | null;
  approved_by: string | null;
  city: string;
  zip_code: string;
  cross_streets: string;
  formatted_location: string | null;
  audience: string;
  childcare_option: string;
  primary_host_phone: string;
  latitude: number | null;
  longitude: number | null;
};

type HostRow = {
  user_id: string | null;
  pending_first_name: string | null;
  pending_last_name: string | null;
  pending_email: string | null;
  is_primary: boolean;
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

function nullableString(value: unknown, maxLength: number): string | null {
  const text = normalizeString(value, maxLength);
  return text || null;
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
  return typeof user?.id === "string" ? { id: user.id, email: normalizeString(user.email, 254).toLowerCase() } : null;
}

async function loadPortalUser(supabaseUrl: string, key: string, userId: string): Promise<PortalUser | null> {
  const params = new URLSearchParams({
    select: "user_id,email,first_name,last_name,is_admin",
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

async function loadCollective(supabaseUrl: string, key: string, collectiveId: string): Promise<Collective | null> {
  const params = new URLSearchParams({
    select: "*",
    id: `eq.${collectiveId}`,
    limit: "1"
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/collectives?${params}`, {
    headers: supabaseHeaders(key)
  });
  if (!response.ok) throw new Error(`Collective lookup failed: ${await response.text()}`);
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function loadHosts(supabaseUrl: string, key: string, collectiveId: string): Promise<HostRow[]> {
  const params = new URLSearchParams({
    select: "user_id,pending_first_name,pending_last_name,pending_email,is_primary",
    collective_id: `eq.${collectiveId}`,
    order: "is_primary.desc,created_at.asc"
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/collective_hosts?${params}`, {
    headers: supabaseHeaders(key)
  });
  if (!response.ok) throw new Error(`Collective host lookup failed: ${await response.text()}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

async function loadPortalUsers(supabaseUrl: string, key: string, userIds: string[]): Promise<Map<string, PortalUser>> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  const users = new Map<string, PortalUser>();
  if (uniqueIds.length === 0) return users;

  const params = new URLSearchParams({
    select: "user_id,email,first_name,last_name,is_admin",
    user_id: `in.(${uniqueIds.join(",")})`
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/portal_users?${params}`, {
    headers: supabaseHeaders(key)
  });
  if (!response.ok) throw new Error(`Portal users lookup failed: ${await response.text()}`);
  const rows = await response.json();
  if (Array.isArray(rows)) {
    rows.forEach((row) => {
      if (typeof row?.user_id === "string") users.set(row.user_id, row);
    });
  }
  return users;
}

async function loadAttendeeCount(supabaseUrl: string, key: string, collectiveId: string): Promise<number> {
  const params = new URLSearchParams({
    select: "id",
    collective_id: `eq.${collectiveId}`
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/fall_2026_collective_attendees?${params}`, {
    method: "HEAD",
    headers: supabaseHeaders(key, { Prefer: "count=exact" })
  });
  if (!response.ok) return 0;
  const range = response.headers.get("content-range") || "";
  const count = Number(range.split("/")[1] || "0");
  return Number.isFinite(count) ? count : 0;
}

async function geocode(values: { cross_streets: string; city: string; zip_code: string }): Promise<{
  latitude: number;
  longitude: number;
  formatted_location: string;
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
    longitude: location.lng,
    formatted_location: result.results[0].formatted_address || address
  };
}

function displayStatus(collective: Pick<Collective, "approval_status" | "listing_status">): string {
  if (collective.approval_status === "pending") return "pending";
  return collective.listing_status === "active" ? "active" : "inactive";
}

function validateLocation(values: { city: string; zip_code: string; cross_streets: string }): string | null {
  if (!values.city || values.city.length > 120) return "City is required.";
  if (!/^[0-9]{5}$/.test(values.zip_code)) return "ZIP code must be exactly 5 digits.";
  if (!values.cross_streets || values.cross_streets.length > 200) return "Cross streets are required.";
  if (/\d{2,}\s+\S+/.test(values.cross_streets)) {
    return "Enter nearby cross streets only, not an exact home address.";
  }
  return null;
}

function readChanges(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function assertNoUnknownKeys(changes: JsonObject, allowedKeys: Set<string>): string | null {
  const unknownKey = Object.keys(changes).find((key) => !allowedKeys.has(key));
  return unknownKey ? `Field "${unknownKey}" cannot be updated here.` : null;
}

async function updateCollectiveRow(
  supabaseUrl: string,
  key: string,
  collectiveId: string,
  patch: JsonObject
): Promise<Collective> {
  const params = new URLSearchParams({
    id: `eq.${collectiveId}`,
    select: "*"
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/collectives?${params}`, {
    method: "PATCH",
    headers: supabaseHeaders(key, { Prefer: "return=representation" }),
    body: JSON.stringify(patch)
  });
  if (!response.ok) throw new Error(`Collective update failed: ${await response.text()}`);
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows[0]) throw new Error("Collective update did not return a row.");
  return rows[0];
}

async function buildResponseRecord(
  supabaseUrl: string,
  key: string,
  collective: Collective
): Promise<JsonObject> {
  const hosts = await loadHosts(supabaseUrl, key, collective.id);
  const userIds = hosts.map((host) => host.user_id || "").filter(Boolean);
  const portalUsers = await loadPortalUsers(supabaseUrl, key, userIds);
  const primaryHost = hosts.find((host) => host.is_primary) || null;
  const secondaryHost = hosts.find((host) => !host.is_primary) || null;
  const primaryUser = primaryHost?.user_id ? portalUsers.get(primaryHost.user_id) || null : null;
  const secondaryUser = secondaryHost?.user_id ? portalUsers.get(secondaryHost.user_id) || null : null;
  const attendeeCount = await loadAttendeeCount(supabaseUrl, key, collective.id);

  return {
    ...collective,
    status: displayStatus(collective),
    attendee_count: attendeeCount,
    primary_host_user_id: primaryHost?.user_id || null,
    primary_host_email: primaryUser?.email || primaryHost?.pending_email || null,
    primary_host_first_name: primaryUser?.first_name || primaryHost?.pending_first_name || null,
    primary_host_last_name: primaryUser?.last_name || primaryHost?.pending_last_name || null,
    secondary_host_user_id: secondaryHost?.user_id || null,
    secondary_host_email: secondaryUser?.email || secondaryHost?.pending_email || null
  };
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
  const changes = readChanges(requestBody.changes);
  if (!collectiveId) return jsonResponse(origin, 400, { error: "Collective is required." });

  try {
    const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
    const supabaseKey = resolveSupabaseElevatedKey();
    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase elevated credentials are not configured.");

    const user = await getAuthenticatedUser(request, supabaseUrl);
    if (!user) return jsonResponse(origin, 401, { error: "Authentication required." });

    const [portalUser, collective, hosts] = await Promise.all([
      loadPortalUser(supabaseUrl, supabaseKey, user.id),
      loadCollective(supabaseUrl, supabaseKey, collectiveId),
      loadHosts(supabaseUrl, supabaseKey, collectiveId)
    ]);
    if (!portalUser) return jsonResponse(origin, 403, { error: "Portal access is required." });
    if (!collective) return jsonResponse(origin, 404, { error: "Collective not found." });

    const isAdmin = portalUser.is_admin === true;
    const isLinkedHost = hosts.some((host) => host.user_id === user.id);
    if (!isAdmin && !isLinkedHost) return jsonResponse(origin, 403, { error: "Collective access denied." });

    const allowedKeys = isAdmin
      ? new Set(["city", "zip_code", "cross_streets", "audience", "childcare_option", "listing_status", "approval_status", "primary_host_phone", "is_closed"])
      : new Set(["city", "zip_code", "cross_streets", "audience", "childcare_option", "listing_status", "is_closed"]);
    const unknownError = assertNoUnknownKeys(changes, allowedKeys);
    if (unknownError) return jsonResponse(origin, 400, { error: unknownError });

    const patch: JsonObject = {};
    const nextLocation = {
      city: collective.city,
      zip_code: collective.zip_code,
      cross_streets: collective.cross_streets
    };

    if ("city" in changes) nextLocation.city = normalizeString(changes.city, 120);
    if ("zip_code" in changes) nextLocation.zip_code = normalizeString(changes.zip_code, 5);
    if ("cross_streets" in changes) nextLocation.cross_streets = normalizeString(changes.cross_streets, 200);

    const locationChanged =
      nextLocation.city !== collective.city ||
      nextLocation.zip_code !== collective.zip_code ||
      nextLocation.cross_streets !== collective.cross_streets;

    if (locationChanged) {
      const locationError = validateLocation(nextLocation);
      if (locationError) return jsonResponse(origin, 400, { error: locationError });
      const geocoded = await geocode(nextLocation);
      patch.city = nextLocation.city;
      patch.zip_code = nextLocation.zip_code;
      patch.cross_streets = nextLocation.cross_streets;
      patch.formatted_location = geocoded.formatted_location;
      patch.latitude = geocoded.latitude;
      patch.longitude = geocoded.longitude;
    }

    if ("audience" in changes) {
      const audience = normalizeString(changes.audience, 32);
      if (!VALID_AUDIENCES.has(audience)) return jsonResponse(origin, 400, { error: "Audience is invalid." });
      patch.audience = audience;
    }

    if ("childcare_option" in changes) {
      const childcareOption = normalizeString(changes.childcare_option, 80);
      if (!VALID_CHILDCARE_OPTIONS.has(childcareOption)) return jsonResponse(origin, 400, { error: "Childcare option is invalid." });
      patch.childcare_option = childcareOption;
    }

    if ("is_closed" in changes) {
      if (typeof changes.is_closed !== "boolean") return jsonResponse(origin, 400, { error: "Closed status is invalid." });
      patch.is_closed = changes.is_closed;
    }

    if ("primary_host_phone" in changes) {
      const phone = normalizeString(changes.primary_host_phone, 40);
      if (!phone) return jsonResponse(origin, 400, { error: "Primary host phone is required." });
      patch.primary_host_phone = phone;
    }

    let nextApprovalStatus = collective.approval_status;
    if ("approval_status" in changes) {
      const approvalStatus = normalizeString(changes.approval_status, 20);
      if (!VALID_APPROVAL_STATUSES.has(approvalStatus)) return jsonResponse(origin, 400, { error: "Approval status is invalid." });
      if (!isAdmin) return jsonResponse(origin, 403, { error: "Only administrators may approve Collectives." });
      if (collective.approval_status === "approved" && approvalStatus !== "approved") {
        return jsonResponse(origin, 400, { error: "Approved Collectives cannot be returned to pending." });
      }
      if (collective.approval_status === "pending" && approvalStatus === "approved") {
        patch.approval_status = "approved";
        patch.approved_at = collective.approved_at || new Date().toISOString();
        patch.approved_by = collective.approved_by || user.id;
      }
      nextApprovalStatus = approvalStatus;
    }

    if ("listing_status" in changes) {
      const listingStatus = normalizeString(changes.listing_status, 20);
      if (!VALID_LISTING_STATUSES.has(listingStatus)) return jsonResponse(origin, 400, { error: "Listing status is invalid." });
      if (nextApprovalStatus !== "approved") {
        return jsonResponse(origin, 403, { error: "Listing visibility cannot change until the Collective is approved." });
      }
      patch.listing_status = listingStatus;
    }

    if (Object.keys(patch).length === 0) {
      return jsonResponse(origin, 200, { collective: await buildResponseRecord(supabaseUrl, supabaseKey, collective) });
    }

    const updated = await updateCollectiveRow(supabaseUrl, supabaseKey, collectiveId, patch);
    return jsonResponse(origin, 200, { collective: await buildResponseRecord(supabaseUrl, supabaseKey, updated) });
  } catch (err) {
    console.error("update-collective failed.", err instanceof Error ? err.message : err);
    const message = err instanceof Error && err.message.startsWith("We could not place")
      ? err.message
      : "Unable to update Collective right now.";
    return jsonResponse(origin, 500, { error: message });
  }
});

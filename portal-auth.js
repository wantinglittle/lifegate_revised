import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';

const SUPABASE_URL_PLACEHOLDER = "https://YOUR_PROJECT_REF.supabase.co";
const SUPABASE_ANON_KEY_PLACEHOLDER = "YOUR_SUPABASE_ANON_KEY";

export const PORTAL_LOGIN_PAGE = "portal-login.html";
export const PORTAL_CALLBACK_PAGE = "portal-callback.html";
export const PORTAL_PAGE = "portal.html";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
    flowType: "pkce"
  }
});

export function ensureSupabaseConfig() {
  if (
    SUPABASE_URL === SUPABASE_URL_PLACEHOLDER ||
    SUPABASE_ANON_KEY === SUPABASE_ANON_KEY_PLACEHOLDER
  ) {
    throw new Error("Supabase public configuration is missing.");
  }
}

export function pageUrl(pageName) {
  return new URL(pageName, window.location.href).toString();
}

export function redirectTo(pageName) {
  window.location.assign(pageUrl(pageName));
}

export function portalCallbackUrl() {
  return pageUrl(PORTAL_CALLBACK_PAGE);
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function looksLikeEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function sendPortalMagicLink(email) {
  ensureSupabaseConfig();

  return supabase.auth.signInWithOtp({
    email: normalizeEmail(email),
    options: {
      shouldCreateUser: false,
      emailRedirectTo: portalCallbackUrl()
    }
  });
}

export async function getCurrentSession() {
  ensureSupabaseConfig();
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }
  return data.session;
}

export async function signOutPortalUser() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}

export async function getMyCommunities() {
  const { data, error } = await supabase.rpc("get_my_communities");
  if (error) {
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

export async function getAdminGroups() {
  const { data, error } = await supabase.rpc("get_admin_groups");
  if (error) {
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

export async function updateMyCommunity(groupId, changes) {
  const { data, error } = await supabase.rpc("update_my_community", {
    p_group_id: groupId,
    p_changes: changes
  });
  if (error) {
    throw error;
  }
  return Array.isArray(data) ? data[0] : data;
}

export async function updateAdminGroup(groupId, changes) {
  const { data, error } = await supabase.rpc("update_admin_group", {
    p_group_id: groupId,
    p_changes: changes
  });
  if (error) {
    throw error;
  }
  return Array.isArray(data) ? data[0] : data;
}

export function isExpectedNonAdminError(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42501" ||
    message.includes("administrator access required") ||
    message.includes("permission denied");
}

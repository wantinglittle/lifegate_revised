import {
  getCurrentSession,
  PORTAL_LOGIN_PAGE,
  PORTAL_PAGE,
  redirectTo,
  supabase
} from './portal-auth.js';

const statusMessage = document.getElementById("portal-callback-status");
const loginLink = document.getElementById("portal-callback-login-link");
const AUTH_INIT_TIMEOUT_MS = 3000;

let authSubscription;
let timeoutId;
let hasRedirected = false;

function setStatus(message, tone = "info") {
  statusMessage.textContent = message;
  statusMessage.dataset.tone = tone;
}

function getUrlAuthError() {
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.search);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));

  return (
    params.get("error_description") ||
    params.get("error") ||
    hashParams.get("error_description") ||
    hashParams.get("error")
  );
}

function cleanCallbackUrl() {
  if (!window.location.search && !window.location.hash) return;
  window.history.replaceState(null, document.title, window.location.pathname);
}

function cleanupCallbackListeners() {
  if (timeoutId) {
    window.clearTimeout(timeoutId);
    timeoutId = undefined;
  }

  if (authSubscription) {
    authSubscription.unsubscribe();
    authSubscription = undefined;
  }
}

function openPortal() {
  if (hasRedirected) return;

  hasRedirected = true;
  cleanupCallbackListeners();
  cleanCallbackUrl();
  setStatus("Sign-in confirmed. Opening the portal...", "success");
  redirectTo(PORTAL_PAGE);
}

function showInvalidLink(error) {
  if (hasRedirected) return;

  cleanupCallbackListeners();
  if (error) {
    console.error("Portal callback failed:", error);
  }

  setStatus("This sign-in link is invalid or expired. Please request a new link.", "error");
  loginLink.hidden = false;
  loginLink.href = PORTAL_LOGIN_PAGE;
}

function waitForAuthInitialization() {
  return new Promise((resolve) => {
    timeoutId = window.setTimeout(() => {
      resolve({ timedOut: true });
    }, AUTH_INIT_TIMEOUT_MS);
  });
}

async function checkCurrentSession() {
  const session = await getCurrentSession();
  if (session) {
    openPortal();
    return true;
  }

  return false;
}

async function handleCallback() {
  setStatus("Signing you in...", "info");
  const urlAuthError = getUrlAuthError();

  authSubscription = supabase.auth.onAuthStateChange((event, session) => {
    if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && session) {
      openPortal();
    }
  }).data.subscription;

  try {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    if (await checkCurrentSession()) return;

    const authWaitResult = await waitForAuthInitialization();
    if (hasRedirected) return;
    if (await checkCurrentSession()) return;

    if (urlAuthError) {
      throw new Error(urlAuthError);
    }

    if (authWaitResult.timedOut) {
      throw new Error("Timed out waiting for Supabase auth initialization.");
    }

    throw new Error("The sign-in link could not be confirmed.");
  } catch (error) {
    try {
      if (await checkCurrentSession()) return;
    } catch (sessionError) {
      console.error("Portal callback session check failed:", sessionError);
    }
    showInvalidLink(error);
  }
}

handleCallback();

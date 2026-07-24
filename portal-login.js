import {
  getCurrentSession,
  looksLikeEmail,
  normalizeEmail,
  PORTAL_PAGE,
  redirectTo,
  sendPortalMagicLink,
  supabase
} from './portal-auth.js';

const form = document.getElementById("portal-login-form");
const emailInput = document.getElementById("portal-email");
const submitButton = document.getElementById("portal-login-submit");
const statusMessage = document.getElementById("portal-login-status");

function setStatus(message, tone = "info") {
  statusMessage.textContent = message;
  statusMessage.dataset.tone = tone;
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "Sending Link..." : "Send Sign-In Link";
}

async function redirectIfSignedIn() {
  try {
    const session = await getCurrentSession();
    if (session) {
      redirectTo(PORTAL_PAGE);
    }
  } catch (error) {
    console.error("Portal session check failed:", error);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = normalizeEmail(emailInput.value);
  emailInput.value = email;

  if (!looksLikeEmail(email)) {
    setStatus("Enter a valid email address.", "error");
    emailInput.focus();
    return;
  }

  setLoading(true);
  setStatus("Sending a secure sign-in link...", "info");

  try {
    const { error } = await sendPortalMagicLink(email);
    if (error) {
      throw error;
    }

    setStatus("If this email has portal access, a secure sign-in link has been sent.", "success");
    form.reset();
  } catch (error) {
    console.error("Portal magic link request failed:", error);
    setStatus("We could not send a sign-in link right now. Please try again later.", "error");
  } finally {
    setLoading(false);
  }
});

const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_IN") {
    redirectTo(PORTAL_PAGE);
  }
});

window.addEventListener("pagehide", () => {
  authListener.subscription.unsubscribe();
});

redirectIfSignedIn();

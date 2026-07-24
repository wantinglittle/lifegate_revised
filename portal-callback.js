import {
  completeMagicLinkCallback,
  PORTAL_LOGIN_PAGE,
  PORTAL_PAGE,
  redirectTo
} from './portal-auth.js';

const statusMessage = document.getElementById("portal-callback-status");
const loginLink = document.getElementById("portal-callback-login-link");

function setStatus(message, tone = "info") {
  statusMessage.textContent = message;
  statusMessage.dataset.tone = tone;
}

async function handleCallback() {
  setStatus("Signing you in...", "info");

  try {
    const session = await completeMagicLinkCallback();
    if (!session) {
      throw new Error("The sign-in link could not be confirmed.");
    }

    setStatus("Sign-in confirmed. Opening the portal...", "success");
    redirectTo(PORTAL_PAGE);
  } catch (error) {
    console.error("Portal callback failed:", error);
    setStatus("This sign-in link is invalid or expired. Please request a new link.", "error");
    loginLink.hidden = false;
    loginLink.href = PORTAL_LOGIN_PAGE;
  }
}

handleCallback();

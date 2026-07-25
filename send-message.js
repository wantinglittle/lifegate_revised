import {
  getCurrentSession,
  invokeDashboardMessage,
  PORTAL_LOGIN_PAGE,
  redirectTo,
  supabase
} from './portal-auth.js';

const statusMessage = document.getElementById("send-message-status");
const errorSummary = document.getElementById("send-message-error-summary");
const form = document.getElementById("send-message-form");
const recipientCount = document.getElementById("send-message-recipient-count");
const subjectInput = document.getElementById("send-message-subject");
const subjectError = document.getElementById("send-message-subject-error");
const editor = document.getElementById("send-message-editor");
const bodyError = document.getElementById("send-message-body-error");
const previewButton = document.getElementById("send-message-preview-btn");
const testButton = document.getElementById("send-message-test-btn");
const sendButton = document.getElementById("send-message-send-btn");
const previewPanel = document.getElementById("send-message-preview");
const previewSubject = document.getElementById("send-message-preview-subject");
const previewFrom = document.getElementById("send-message-preview-from");
const previewReplyTo = document.getElementById("send-message-preview-reply-to");
const previewBody = document.getElementById("send-message-preview-body");
const confirmModal = document.getElementById("send-message-confirm-modal");
const confirmSubject = document.getElementById("send-message-confirm-subject");
const confirmCount = document.getElementById("send-message-confirm-count");
const confirmFrom = document.getElementById("send-message-confirm-from");
const confirmReplyTo = document.getElementById("send-message-confirm-reply-to");
const confirmSendButton = document.getElementById("send-message-confirm-send");
const confirmCancelButton = document.getElementById("send-message-confirm-cancel");
const toolbarButtons = Array.from(document.querySelectorAll(".portal-message-toolbar-btn"));

let authSubscription;
let summary = null;
let isBusy = false;
let lastPreview = null;

function setStatus(message, tone = "info") {
  statusMessage.textContent = message;
  statusMessage.dataset.tone = tone;
}

function clearStatus() {
  statusMessage.textContent = "";
  delete statusMessage.dataset.tone;
}

function showError(message) {
  errorSummary.textContent = message;
  errorSummary.hidden = false;
  errorSummary.focus();
}

function clearError() {
  errorSummary.textContent = "";
  errorSummary.hidden = true;
}

function normalizeSubject() {
  return subjectInput.value.trim().replace(/\s+/g, " ");
}

function messageHtml() {
  return editor.innerHTML.trim();
}

function messageText() {
  return editor.textContent.trim();
}

function setBusy(busy, label = "") {
  isBusy = busy;
  [previewButton, testButton, sendButton, confirmSendButton, confirmCancelButton].forEach((button) => {
    button.disabled = busy;
  });

  if (busy && label) {
    setStatus(label, "info");
  }
}

function validateDraft() {
  const subject = normalizeSubject();
  const html = messageHtml();
  const text = messageText();
  let ok = true;

  subjectInput.value = subject;
  subjectError.textContent = "";
  bodyError.textContent = "";
  subjectInput.removeAttribute("aria-invalid");
  editor.removeAttribute("aria-invalid");

  if (!subject || subject.length > 140) {
    subjectError.textContent = "Subject is required and must be 140 characters or fewer.";
    subjectInput.setAttribute("aria-invalid", "true");
    ok = false;
  }

  if (!text) {
    bodyError.textContent = "Message is required.";
    editor.setAttribute("aria-invalid", "true");
    ok = false;
  }

  return ok ? { subject, html } : null;
}

function showPreview(preview) {
  lastPreview = preview;
  previewSubject.textContent = preview.subject || "";
  previewFrom.textContent = preview.from || "";
  previewReplyTo.textContent = preview.replyTo || "";
  previewBody.innerHTML = preview.html || "";
  previewPanel.hidden = false;
}

function recipientLabel(count) {
  return `${count} Dashboard ${count === 1 ? "User" : "Users"}`;
}

function setSummary(nextSummary) {
  summary = nextSummary;
  recipientCount.textContent = recipientLabel(summary.eligibleRecipientCount || 0);
}

function openConfirmModal() {
  if (!summary || !lastPreview) return;
  const count = summary.eligibleRecipientCount || 0;
  confirmSubject.textContent = lastPreview.subject || normalizeSubject();
  confirmCount.textContent = recipientLabel(count);
  confirmFrom.textContent = summary.from || lastPreview.from || "";
  confirmReplyTo.textContent = summary.replyTo || lastPreview.replyTo || "";
  confirmSendButton.textContent = `Send to ${recipientLabel(count)}`;
  confirmModal.hidden = false;
  confirmCancelButton.focus();
}

function closeConfirmModal() {
  confirmModal.hidden = true;
}

async function loadSummary() {
  const session = await getCurrentSession();
  if (!session) {
    redirectTo(PORTAL_LOGIN_PAGE);
    return;
  }

  try {
    const result = await invokeDashboardMessage("summary");
    setSummary(result);
    form.hidden = false;
    clearStatus();
  } catch (error) {
    console.error("Send Message admin summary failed:", error);
    form.hidden = true;
    setStatus("This page is only available to Dashboard administrators.", "error");
  }
}

async function buildPreview() {
  if (isBusy) return null;
  clearError();
  const draft = validateDraft();
  if (!draft) {
    showError("Please fix the highlighted fields.");
    return null;
  }

  setBusy(true, "Preparing preview...");
  try {
    const preview = await invokeDashboardMessage("preview", draft);
    showPreview(preview);
    setStatus("Preview ready.", "success");
    return preview;
  } catch (error) {
    console.error("Send Message preview failed:", error);
    showError("Preview could not be prepared. Please try again.");
    return null;
  } finally {
    setBusy(false);
  }
}

async function sendTest() {
  if (isBusy) return;
  clearError();
  const draft = validateDraft();
  if (!draft) {
    showError("Please fix the highlighted fields.");
    return;
  }

  setBusy(true, "Sending test message...");
  try {
    const result = await invokeDashboardMessage("test", {
      ...draft,
      messageId: crypto.randomUUID()
    });
    if (result.preview) {
      showPreview(result.preview);
    }
    setStatus("Test message sent only to your email address.", "success");
  } catch (error) {
    console.error("Send Message test failed:", error);
    showError("Test message could not be sent. Please try again.");
  } finally {
    setBusy(false);
  }
}

async function confirmProductionSend() {
  const preview = await buildPreview();
  if (!preview) return;

  try {
    const currentSummary = await invokeDashboardMessage("summary");
    setSummary(currentSummary);
    openConfirmModal();
  } catch (error) {
    console.error("Send Message count refresh failed:", error);
    showError("Recipient count could not be refreshed. Please try again.");
  }
}

async function sendProduction() {
  if (isBusy) return;
  clearError();
  const draft = validateDraft();
  if (!draft) {
    closeConfirmModal();
    showError("Please fix the highlighted fields.");
    return;
  }

  setBusy(true, "Sending message...");
  try {
    const result = await invokeDashboardMessage("send", {
      ...draft,
      messageId: crypto.randomUUID()
    });
    closeConfirmModal();
    const count = Number(result.successfulCount || 0);
    if (Number(result.failedCount || 0) > 0) {
      setStatus(`Message sent to ${recipientLabel(count)} with ${result.failedCount} failure${result.failedCount === 1 ? "" : "s"}.`, "error");
    } else {
      setStatus(`Message sent to ${recipientLabel(count)}.`, "success");
    }
  } catch (error) {
    console.error("Send Message production send failed:", error);
    showError("Message could not be sent. No automatic retry was attempted.");
  } finally {
    setBusy(false);
  }
}

toolbarButtons.forEach((button) => {
  button.addEventListener("click", () => {
    editor.focus();
    const command = button.dataset.command || "";
    if (command === "createLink") {
      const url = window.prompt("Enter a link URL");
      if (!url) return;
      document.execCommand(command, false, url);
      return;
    }
    document.execCommand(command, false, null);
  });
});

previewButton.addEventListener("click", buildPreview);
testButton.addEventListener("click", sendTest);
sendButton.addEventListener("click", confirmProductionSend);
confirmSendButton.addEventListener("click", sendProduction);
confirmCancelButton.addEventListener("click", closeConfirmModal);
confirmModal.addEventListener("click", (event) => {
  if (event.target === confirmModal && !isBusy) {
    closeConfirmModal();
  }
});

authSubscription = supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) {
    redirectTo(PORTAL_LOGIN_PAGE);
  }
}).data.subscription;

window.addEventListener("pagehide", () => {
  authSubscription.unsubscribe();
});

loadSummary();

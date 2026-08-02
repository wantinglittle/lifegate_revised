import { getCurrentSession } from './portal-auth.js';
import { SUPABASE_URL } from './supabase-config.js';

const FUNCTION_URL = `${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/submit-collective`;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUDIENCE_OPTIONS = ["Everyone Welcome", "Men", "Women", "Couples"];
const CHILDCARE_OPTIONS = [
  "Childcare Available | Sitter Provided",
  "Children Welcome | No Sitter Provided",
  "Childcare Not Provided"
];
const MIN_MAX_SIZE = 1;
const MAX_MAX_SIZE = 25;

const form = document.getElementById("collective-host-form");
const submitButton = document.getElementById("collective-submit");
const submitStatus = document.getElementById("collective-submit-status");

const fields = {
  primaryFirstName: document.getElementById("primary-first-name"),
  primaryLastName: document.getElementById("primary-last-name"),
  primaryEmail: document.getElementById("primary-email"),
  primaryPhone: document.getElementById("primary-phone"),
  secondaryEmail: document.getElementById("secondary-email"),
  city: document.getElementById("collective-city"),
  zipCode: document.getElementById("collective-zip"),
  crossStreets: document.getElementById("collective-cross-streets"),
  audience: document.getElementById("collective-audience"),
  childcareOption: document.getElementById("collective-childcare"),
  maxSize: document.getElementById("collective-max-size")
};

function setFieldError(input, message) {
  const error = document.getElementById(`${input.id}-error`);
  input.toggleAttribute("aria-invalid", Boolean(message));
  if (error) error.textContent = message || "";
}

function normalizeText(value) {
  return String(value || "").trim();
}

function readValues() {
  return {
    primaryFirstName: normalizeText(fields.primaryFirstName.value),
    primaryLastName: normalizeText(fields.primaryLastName.value),
    primaryEmail: normalizeText(fields.primaryEmail.value).toLowerCase(),
    primaryPhone: normalizeText(fields.primaryPhone.value),
    secondaryEmail: normalizeText(fields.secondaryEmail.value).toLowerCase(),
    city: normalizeText(fields.city.value),
    zipCode: normalizeText(fields.zipCode.value),
    crossStreets: normalizeText(fields.crossStreets.value),
    audience: fields.audience.value,
    childcareOption: fields.childcareOption.value,
    maxSize: Number(fields.maxSize.value)
  };
}

function validate(values) {
  Object.values(fields).forEach((input) => setFieldError(input, ""));
  const errors = new Map();
  if (!values.primaryFirstName) errors.set(fields.primaryFirstName, "First name is required.");
  if (!values.primaryLastName) errors.set(fields.primaryLastName, "Last name is required.");
  if (!EMAIL_PATTERN.test(values.primaryEmail)) errors.set(fields.primaryEmail, "Enter a valid email.");
  if (!/^\([0-9]{3}\) [0-9]{3}-[0-9]{4}$/.test(values.primaryPhone)) {
    errors.set(fields.primaryPhone, "Enter a 10-digit phone number.");
  }
  if (values.secondaryEmail && !EMAIL_PATTERN.test(values.secondaryEmail)) {
    errors.set(fields.secondaryEmail, "Enter a valid second host email.");
  }
  if (values.secondaryEmail && values.secondaryEmail === values.primaryEmail) {
    errors.set(fields.secondaryEmail, "Second host email must be different.");
  }
  if (!values.city) errors.set(fields.city, "City is required.");
  if (!/^[0-9]{5}$/.test(values.zipCode)) errors.set(fields.zipCode, "ZIP code must be exactly 5 digits.");
  if (!values.crossStreets) {
    errors.set(fields.crossStreets, "Cross streets are required.");
  } else if (/\d{2,}\s+\S+/.test(values.crossStreets)) {
    errors.set(fields.crossStreets, "Enter nearby cross streets only, not an exact home address.");
  }
  if (!AUDIENCE_OPTIONS.includes(values.audience)) errors.set(fields.audience, "Select an audience.");
  if (!CHILDCARE_OPTIONS.includes(values.childcareOption)) {
    errors.set(fields.childcareOption, "Select a childcare option.");
  }
  if (!Number.isInteger(values.maxSize) || values.maxSize < MIN_MAX_SIZE || values.maxSize > MAX_MAX_SIZE) {
    errors.set(fields.maxSize, "Select a max size from 1 to 25.");
  }

  errors.forEach((message, input) => setFieldError(input, message));
  return errors.size === 0;
}

function formatPhoneNumber(rawDigits) {
  let digits = rawDigits.replace(/\D/g, "");
  if (digits.length > 10) digits = digits.slice(0, 10);
  if (digits.length > 6) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length > 3) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  if (digits.length > 0) return `(${digits}`;
  return "";
}

async function prefillLoggedInEmail() {
  try {
    const session = await getCurrentSession();
    const email = session?.user?.email || "";
    if (email && !fields.primaryEmail.value) {
      fields.primaryEmail.value = email;
    }
  } catch {
    // Public submissions do not require login.
  }
}

fields.primaryPhone.addEventListener("input", (event) => {
  event.target.value = formatPhoneNumber(event.target.value);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = readValues();
  if (!validate(values)) {
    submitStatus.textContent = "Please fix the highlighted fields.";
    return;
  }
  if (!window.grecaptcha) {
    submitStatus.textContent = "reCAPTCHA is still loading. Please wait a moment and try again.";
    return;
  }
  const recaptchaToken = window.grecaptcha.getResponse();
  if (!recaptchaToken) {
    submitStatus.textContent = "Please complete the reCAPTCHA check before submitting.";
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";
  submitStatus.textContent = "Submitting your Collective and placing the approximate map pin...";

  try {
    const session = await getCurrentSession().catch(() => null);
    const headers = { "Content-Type": "application/json" };
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...values, recaptchaToken })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Submission failed.");
    window.grecaptcha.reset();
    window.location.href = "confirmation.html";
  } catch (error) {
    console.error("Collective submission failed:", error);
    window.grecaptcha.reset();
    submitStatus.textContent = error.message || "Your submission did not go through. Please review the form and try again.";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit Collective";
  }
});

prefillLoggedInEmail();

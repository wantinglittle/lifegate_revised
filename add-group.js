const form = document.getElementById('groupForm');
const firstNameInput = document.getElementById("first-name");
const lastNameInput = document.getElementById("last-name");
const phoneInput = document.getElementById("contact-phone");
const submitButton = form.querySelector('button[type="submit"]');
const submitLabel = submitButton.querySelector('.submit-label');
const submitStatus = document.getElementById("submit-status");
const FUNCTION_URL = "https://dsrilmjpgpgdxzvzwyqw.supabase.co/functions/v1/submit-group";
const NAME_MAX_LENGTH = 80;

function formatPhoneNumber(rawDigits) {
  if (rawDigits.length > 10) rawDigits = rawDigits.slice(0, 10);

  if (rawDigits.length > 6) {
    return `(${rawDigits.slice(0, 3)}) ${rawDigits.slice(3, 6)}-${rawDigits.slice(6)}`;
  }
  if (rawDigits.length > 3) {
    return `(${rawDigits.slice(0, 3)}) ${rawDigits.slice(3)}`;
  }
  if (rawDigits.length > 0) {
    return `(${rawDigits}`;
  }

  return "";
}

function setFieldError(input, message) {
  const errorElement = document.getElementById(`${input.id}-error`);
  input.setAttribute("aria-invalid", message ? "true" : "false");
  if (errorElement) {
    errorElement.textContent = message;
  }
}

function validateNameField(input, label) {
  const value = input.value.trim();
  if (!value) {
    setFieldError(input, `${label} is required.`);
    return null;
  }
  if (value.length > NAME_MAX_LENGTH) {
    setFieldError(input, `${label} must be ${NAME_MAX_LENGTH} characters or fewer.`);
    return null;
  }

  setFieldError(input, "");
  return value;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const firstName = validateNameField(firstNameInput, "First name");
  const lastName = validateNameField(lastNameInput, "Last name");
  if (!firstName || !lastName) {
    submitStatus.textContent = "Please complete the required name fields.";
    return;
  }

  const rawPhone = phoneInput.value.replace(/\D/g, "");
  if (rawPhone.length !== 10) {
    alert("Phone number must be exactly 10 digits.");
    return;
  }

  if (!window.grecaptcha) {
    alert("reCAPTCHA is still loading. Please wait a moment and try again.");
    return;
  }

  const recaptchaToken = window.grecaptcha.getResponse();
  if (!recaptchaToken) {
    alert("Please complete the reCAPTCHA check before submitting.");
    return;
  }

  const formData = new FormData(form);
  const data = Object.fromEntries(formData);
  const contactName = `${firstName} ${lastName}`.trim();
  const payload = {
    title: (data.title || "").trim(),
    description: (data.description || "").trim(),
    first_name: firstName,
    last_name: lastName,
    contactName,
    contactEmail: (data.contactEmail || "").trim(),
    contactPhone: `(${rawPhone.slice(0, 3)}) ${rawPhone.slice(3, 6)}-${rawPhone.slice(6)}`,
    day: data.day || "",
    hour: data.hour || "",
    minute: data.minute || "",
    ampm: data.ampm || "",
    audience: data.audience || "",
    ageGroup: data.ageGroup || "",
    city: (data.city || "").trim(),
    zipCode: (data.zipCode || "").trim(),
    crossStreets: (data.crossStreets || "").trim(),
    additionalInfo: (data.additionalInfo || "").trim(),
    recaptchaToken
  };

  submitButton.disabled = true;
  submitButton.classList.add("is-loading");
  submitLabel.textContent = "Submitting Group";
  submitStatus.textContent = "Submitting your community and verifying reCAPTCHA. Please wait...";

  try {
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || "Submission failed.");
    }

    window.grecaptcha.reset();
    window.location.href = "confirmation.html";
  } catch (err) {
    console.error("Group submission failed:", err);
    alert(err.message || "Something went wrong. Please try again.");
    window.grecaptcha.reset();
    submitStatus.textContent = "Your submission did not go through. Please review the form and try again.";
  } finally {
    submitButton.disabled = false;
    submitButton.classList.remove("is-loading");
    submitLabel.textContent = "Submit Group";
  }
});

phoneInput.addEventListener("input", (e) => {
  const digits = e.target.value.replace(/\D/g, "");
  e.target.value = formatPhoneNumber(digits);
});

[firstNameInput, lastNameInput].forEach((input) => {
  input.addEventListener("input", () => {
    if (input.getAttribute("aria-invalid") === "true") {
      validateNameField(input, input === firstNameInput ? "First name" : "Last name");
    }
  });
});

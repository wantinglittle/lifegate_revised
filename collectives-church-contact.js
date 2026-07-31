const openChurchModalButton = document.getElementById("open-church-modal");
const churchModal = document.getElementById("contact-church");
const churchForm = document.getElementById("contact-church-form");
const churchPhoneInput = document.getElementById("contact-church-phone");
const churchConfirmationModal = document.getElementById("church-confirmation-modal");

function closeModal(modal) {
  if (modal) modal.style.display = "none";
}

function formatPhone(value) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length > 6) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length > 3) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  if (digits.length > 0) return `(${digits}`;
  return "";
}

openChurchModalButton?.addEventListener("click", () => {
  if (!churchModal || !churchForm) return;
  churchForm.reset();
  churchModal.style.display = "block";
  document.getElementById("contact-church-name")?.focus();
});

churchPhoneInput?.addEventListener("input", (event) => {
  event.target.value = formatPhone(event.target.value);
});

document.querySelector(".close-church-confirmation")?.addEventListener("click", () => {
  closeModal(churchConfirmationModal);
});

churchForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = document.getElementById("contact-church-name").value.trim();
  const email = document.getElementById("contact-church-email").value.trim();
  const phone = churchPhoneInput.value.trim();
  const message = document.getElementById("contact-church-message").value.trim();

  if (!name || !email || !message) {
    alert("Please fill out all required fields.");
    return;
  }

  if (!window.emailjs) {
    alert("Messaging is still loading. Please wait a moment and try again.");
    return;
  }

  try {
    await emailjs.send("service_fmkha6h", "template_9hiiteh", {
      name,
      email,
      phone,
      message,
      group_title: "Message to Church",
      to_email: "lifegatecommunitywebsite@gmail.com"
    });

    closeModal(churchModal);
    if (churchConfirmationModal) churchConfirmationModal.style.display = "block";
    churchForm.reset();
  } catch (error) {
    console.error("EmailJS error:", error);
    alert("There was an error sending your message. Please try again later.");
  }
});

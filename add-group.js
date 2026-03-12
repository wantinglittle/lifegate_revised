import { db } from './firebase.js';
import { collection, addDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const form = document.getElementById('groupForm');
const phoneInput = document.getElementById("contact-phone");

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Validate phone number
  const rawPhone = phoneInput.value.replace(/\D/g, "");
  if (rawPhone.length !== 10) {
    alert("Phone number must be exactly 10 digits.");
    return;
  }

  // Collect and format form data
  const formData = new FormData(form);
  const data = Object.fromEntries(formData);
  data.contactPhone = `(${rawPhone.slice(0, 3)}) ${rawPhone.slice(3, 6)}-${rawPhone.slice(6)}`;

  try {
    // Add to Firebase
    await addDoc(collection(db, 'groups'), data);

    // Send Email via EmailJS
    await emailjs.send("service_o23istn", "template_u76tvma", {
      title: data.title,
      description: data.description,
      contactName: data.contactName,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      meetingDay: data.day,
      meetingTime: `${data.hour}:${data.minute} ${data.ampm}`,
      audience: data.audience,
      ageGroup: data.ageGroup,
      zipCode: data.zipCode,
      crossStreets: data.crossStreets,
      additionalInfo: data.additionalInfo || ""
    });

    window.location.href = "confirmation.html";
  } catch (err) {
    console.error("Error adding document or sending email:", err);
    alert("Something went wrong. Please try again.");
  }
});

// Auto-format phone number while typing
phoneInput.addEventListener("input", (e) => {
  let digits = e.target.value.replace(/\D/g, "");
  if (digits.length > 10) digits = digits.slice(0, 10);

  let formatted = digits;
  if (digits.length > 6) {
    formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length > 3) {
    formatted = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  } else if (digits.length > 0) {
    formatted = `(${digits}`;
  }

  e.target.value = formatted;
});

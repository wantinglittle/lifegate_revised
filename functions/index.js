import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

initializeApp();

const db = getFirestore();

const recaptchaSecret = defineSecret("RECAPTCHA_SECRET_KEY");
const emailJsPublicKey = defineSecret("EMAILJS_PUBLIC_KEY");
const emailJsPrivateKey = defineSecret("EMAILJS_PRIVATE_KEY");

const ALLOWED_ORIGINS = new Set([
  "https://www.lifegatecommunity.com",
  "https://lifegatecommunity.com",
  "http://127.0.0.1:5500",
  "http://localhost:5500"
]);

const VALID_DAYS = new Set(["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
const VALID_HOURS = new Set(["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
const VALID_MINUTES = new Set(["", "00", "15", "30", "45"]);
const VALID_AMPM = new Set(["", "AM", "PM"]);
const VALID_AUDIENCES = new Set(["All", "Men", "Women"]);
const VALID_AGE_GROUPS = new Set(["All-ages", "Kids", "Teens", "Adult"]);

function setCorsHeaders(req, res) {
  const origin = req.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }

  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
}

function sendError(res, status, message) {
  res.status(status).json({ error: message });
}

function normalizeString(value, maxLength) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.slice(0, maxLength);
}

function buildSubmission(body) {
  const title = normalizeString(body.title, 120);
  const description = normalizeString(body.description, 500);
  const contactName = normalizeString(body.contactName, 120);
  const contactEmail = normalizeString(body.contactEmail, 254);
  const contactPhone = normalizeString(body.contactPhone, 14);
  const day = normalizeString(body.day, 20);
  const hour = normalizeString(body.hour, 2);
  const minute = normalizeString(body.minute, 2);
  const ampm = normalizeString(body.ampm, 2);
  const audience = normalizeString(body.audience, 10);
  const ageGroup = normalizeString(body.ageGroup, 20);
  const city = normalizeString(body.city, 120);
  const zipCode = normalizeString(body.zipCode, 5);
  const crossStreets = normalizeString(body.crossStreets, 200);
  const additionalInfo = normalizeString(body.additionalInfo, 500);

  if (!title) return { error: "Community name is required." };
  if (!description) return { error: "Description is required." };
  if (!contactName) return { error: "Contact name is required." };
  if (!contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return { error: "A valid contact email is required." };
  if (!/^\([0-9]{3}\) [0-9]{3}-[0-9]{4}$/.test(contactPhone)) return { error: "Phone number format is invalid." };
  if (!VALID_DAYS.has(day)) return { error: "Meeting day is invalid." };
  if (!VALID_HOURS.has(hour)) return { error: "Meeting hour is invalid." };
  if (!VALID_MINUTES.has(minute)) return { error: "Meeting minute is invalid." };
  if (!VALID_AMPM.has(ampm)) return { error: "Meeting AM/PM value is invalid." };
  if (!VALID_AUDIENCES.has(audience)) return { error: "Audience is invalid." };
  if (!VALID_AGE_GROUPS.has(ageGroup)) return { error: "Age group is invalid." };
  if (!city) return { error: "City is required." };
  if (!/^[0-9]{5}$/.test(zipCode)) return { error: "ZIP code must be exactly 5 digits." };
  if (!crossStreets) return { error: "Closest cross streets are required." };

  return {
    submission: {
      title,
      description,
      contactName,
      contactEmail,
      contactPhone,
      day,
      hour,
      minute,
      ampm,
      audience,
      ageGroup,
      city,
      zipCode,
      crossStreets,
      additionalInfo,
      hidden: "yes",
      status: "pending",
      submittedAt: FieldValue.serverTimestamp()
    }
  };
}

async function verifyRecaptcha(token, req) {
  const body = new URLSearchParams({
    secret: recaptchaSecret.value(),
    response: token,
    remoteip: req.ip || ""
  });

  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    throw new Error("Failed to verify reCAPTCHA.");
  }

  const result = await response.json();
  if (!result.success) {
    return { ok: false };
  }

  return { ok: true };
}

async function sendNotificationEmail(submission) {
  const publicKey = emailJsPublicKey.value();
  const privateKey = emailJsPrivateKey.value();

  if (!publicKey || !privateKey) {
    console.warn("EmailJS secrets are not configured; skipping notification email.");
    return;
  }

  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      service_id: "service_o23istn",
      template_id: "template_u76tvma",
      user_id: publicKey,
      accessToken: privateKey,
      template_params: {
        title: submission.title,
        description: submission.description,
        contactName: submission.contactName,
        contactEmail: submission.contactEmail,
        contactPhone: submission.contactPhone,
        meetingDay: submission.day,
        meetingTime: `${submission.hour}:${submission.minute} ${submission.ampm}`.trim(),
        audience: submission.audience,
        ageGroup: submission.ageGroup,
        zipCode: submission.zipCode,
        crossStreets: submission.crossStreets,
        additionalInfo: submission.additionalInfo
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`EmailJS request failed: ${errorText}`);
  }
}

export const submitGroup = onRequest(
  {
    region: "us-central1",
    secrets: [recaptchaSecret, emailJsPublicKey, emailJsPrivateKey]
  },
  async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      sendError(res, 405, "Method not allowed.");
      return;
    }

    const origin = req.get("origin");
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      sendError(res, 403, "Origin not allowed.");
      return;
    }

    const recaptchaToken = typeof req.body?.recaptchaToken === "string" ? req.body.recaptchaToken : "";
    if (!recaptchaToken) {
      sendError(res, 400, "Missing reCAPTCHA token.");
      return;
    }

    const { submission, error } = buildSubmission(req.body || {});
    if (error) {
      sendError(res, 400, error);
      return;
    }

    try {
      const verification = await verifyRecaptcha(recaptchaToken, req);
      if (!verification.ok) {
        sendError(res, 400, "reCAPTCHA verification failed.");
        return;
      }

      await db.collection("groups").add(submission);
      await sendNotificationEmail(submission);

      res.status(200).json({ ok: true });
    } catch (err) {
      console.error("submitGroup failed", err);
      sendError(res, 500, "Unable to submit group right now.");
    }
  }
);

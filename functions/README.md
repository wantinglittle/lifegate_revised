# Legacy Firebase Functions Setup

This legacy backend verifies reCAPTCHA server-side before writing a new group to Firestore. It is retained as rollback/reference material while the shadow site uses Supabase for public reads and new submissions.

## What This Does

- Accepts form submissions from `add-group.html`
- Verifies the reCAPTCHA token with Google using your secret key
- Writes the group to Firestore as `hidden: "yes"` and `status: "pending"`
- Optionally sends the notification email through EmailJS from the backend

## One-Time Setup

1. Install the Firebase CLI:
   `npm install -g firebase-tools`
2. Log in:
   `firebase login`
3. In the project root, initialize functions if needed:
   `firebase init functions`
   Choose:
   - Existing project: `socialgroupsapp-a8fed`
   - JavaScript or TypeScript: keep the repo files you already have
4. In the `functions` folder, install dependencies:
   `npm install`

## Set Secrets

Set your reCAPTCHA secret key:

`firebase functions:secrets:set RECAPTCHA_SECRET_KEY`

Set your EmailJS public key:

`firebase functions:secrets:set EMAILJS_PUBLIC_KEY`

Set your EmailJS private key:

`firebase functions:secrets:set EMAILJS_PRIVATE_KEY`

## Deploy

From the project root:

`firebase deploy --only functions:submitGroup,firestore:rules`

## After Deploy

The production rollback/reference frontend previously called:

`https://us-central1-socialgroupsapp-a8fed.cloudfunctions.net/submitGroup`

The shadow `add-group.js` now calls the Supabase `submit-group` Edge Function. Do not re-point it to Firebase unless intentionally rolling back.

## Firestore Rules

After this backend is live, public browsers should not write directly to `groups`.
The included `firestore.rules` file now only allows reads of published groups and admin writes.

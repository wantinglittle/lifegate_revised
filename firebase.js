// Import Firebase SDK
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyAuYODcjC2wO4q5KrO4HqBzvFEmu3rWjWM",
  authDomain: "socialgroupsapp-a8fed.firebaseapp.com",
  projectId: "socialgroupsapp-a8fed",
  storageBucket: "socialgroupsapp-a8fed.firebasestorage.app",
  messagingSenderId: "1071260804262",
  appId: "1:1071260804262:web:fa5925809d05135eef0067"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);


export const db = getFirestore(app);

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env["VITE_FIREBASE_API_KEY"] || "AIzaSyD_v_bheueYqW2191WdFOFO3woixQG8WtU",
  authDomain: import.meta.env["VITE_FIREBASE_AUTH_DOMAIN"] || "inkwell-52cb5.firebaseapp.com",
  projectId: import.meta.env["VITE_FIREBASE_PROJECT_ID"] || "inkwell-52cb5",
  storageBucket: import.meta.env["VITE_FIREBASE_STORAGE_BUCKET"] || "inkwell-52cb5.firebasestorage.app",
  messagingSenderId: import.meta.env["VITE_FIREBASE_MESSAGING_SENDER_ID"] || "97849941325",
  appId: import.meta.env["VITE_FIREBASE_APP_ID"] || "1:97849941325:web:d50bcc197b9159a8522b04",
  measurementId: import.meta.env["VITE_FIREBASE_MEASUREMENT_ID"] || "G-6CXHBZTKP1",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

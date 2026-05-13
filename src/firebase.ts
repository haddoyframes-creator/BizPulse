import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Configuration from environment variables (Render/Production)
// These must be prefixed with VITE_ to be available in the client-side code
const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY || "").trim().replace(/['"]/g, ""),
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "").trim().replace(/['"]/g, ""),
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID || "").trim().replace(/['"]/g, ""),
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "").trim().replace(/['"]/g, ""),
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "").trim().replace(/['"]/g, ""),
  appId: (import.meta.env.VITE_FIREBASE_APP_ID || "").trim().replace(/['"]/g, ""),
  firestoreDatabaseId: (import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || "(default)").trim().replace(/['"]/g, ""),
};

let app: any = null;
let db: any = null;
let auth: any = null;
const googleProvider = new GoogleAuthProvider();

// Check if configuration looks valid
export const isConfigured = !!(
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey.length > 20 &&
  !firebaseConfig.apiKey.includes("PLACEHOLDER") &&
  !firebaseConfig.apiKey.includes("undefined") &&
  firebaseConfig.apiKey.startsWith("AIza") // Firebase Web API keys always start with AIza
);

if (import.meta.env.PROD) {
  if (isConfigured) {
    console.log("Firebase API Key detected (starts with " + firebaseConfig.apiKey.substring(0, 4) + ").");
  } else {
    console.warn("Firebase configuration check failed:", {
      hasKey: !!firebaseConfig.apiKey,
      length: firebaseConfig.apiKey?.length,
      startsWithAIza: firebaseConfig.apiKey?.startsWith("AIza"),
      isPlaceholder: firebaseConfig.apiKey?.includes("PLACEHOLDER")
    });
  }
}

// Safe initialization
try {
  if (isConfigured) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    auth = getAuth(app);
    console.log("Firebase initialized successfully.");
  } else {
    console.warn("Firebase configuration is missing or invalid. Check your environment variables.");
    // Initialize with dummy to prevent null errors in components, 
    // but isConfigured=false will trigger the error UI
    const dummyConfig = { ...firebaseConfig, apiKey: "AI_STUDIO_PLACEHOLDER" };
    if (getApps().length === 0) {
      app = initializeApp(dummyConfig);
    } else {
      app = getApp();
    }
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    auth = getAuth(app);
  }
} catch (error) {
  console.error("CRITICAL: Failed to initialize Firebase:", error);
}

export { db, auth, googleProvider };

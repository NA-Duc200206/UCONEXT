import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

function getFirebaseAuthInstance() {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

  if (!apiKey || !authDomain || !projectId) {
    throw new Error(
      'Google Sign-In is temporarily unavailable. Please sign in with your email and password.'
    );
  }

  const firebaseConfig = {
    apiKey,
    authDomain,
    projectId,
    appId: import.meta.env.VITE_FIREBASE_APP_ID || undefined,
  };

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return getAuth(app);
}

/**
 * Open Google Sign-In popup via Firebase Auth and return the Firebase ID token.
 * Future providers (Facebook, GitHub, Apple, Phone OTP) can reuse getFirebaseAuthInstance().
 */
export async function signInWithGooglePopup() {
  const auth = getFirebaseAuthInstance();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    const result = await signInWithPopup(auth, provider);
    return result.user.getIdToken();
  } catch (error) {
    const code = error?.code || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('Google Sign-In was cancelled. Please try again.');
    }
    if (code === 'auth/unauthorized-domain') {
      throw new Error(
        'Google Sign-In is not enabled for this domain yet. Please sign in with email and password.'
      );
    }
    throw new Error('Google Sign-In failed. Please try again or use email and password.');
  }
}


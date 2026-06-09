import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: 'AIzaSyDQSz_td7B6ih4N9Qql1krBv0OnSY_t5TU',
  authDomain: 'artisansmarket-5f2b6.firebaseapp.com',
  projectId: 'artisansmarket-5f2b6',
  storageBucket: 'artisansmarket-5f2b6.firebasestorage.app',
  messagingSenderId: '89551898663',
  appId: '1:89551898663:android:50c996fe5199184f1e2602',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

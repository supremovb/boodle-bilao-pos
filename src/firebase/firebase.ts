import { initializeApp } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";


const firebaseConfig = {
apiKey: "AIzaSyDAFgF6aKA6HqznuPMrMEYAH5rcD10aK4g",
  authDomain: "boodle-bilao.firebaseapp.com",
  projectId: "boodle-bilao",
  storageBucket: "boodle-bilao.firebasestorage.app",
  messagingSenderId: "728554078910",
  appId: "1:728554078910:web:f7866a8c751fe13b4c94ef"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Enable Firestore offline persistence
enableIndexedDbPersistence(db).catch(() => {});

// Helper for online status
export const isOnline = () => window.navigator.onLine;  
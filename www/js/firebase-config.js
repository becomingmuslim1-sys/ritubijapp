// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyA78cU_-fel3Wk_KBPURwFIL1clPaVHvSw",
  authDomain: "ritubij-13e90.firebaseapp.com",
  projectId: "ritubij-13e90",
  storageBucket: "ritubij-13e90.firebasestorage.app",
  messagingSenderId: "668075804350",
  appId: "1:668075804350:web:1d3744b8e269a0aaef40ef",
  measurementId: "G-WCVW3V06VW"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// অপ্রয়োজনীয় স্টোরেজ বাদ দিয়ে শুধু প্রয়োজনীয় মডিউলগুলো এক্সপোর্ট করা হলো
export { db, collection, addDoc, serverTimestamp, auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, updatePassword };
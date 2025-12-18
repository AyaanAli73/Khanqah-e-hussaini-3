// Shared Firebase Configuration and Export
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAGNYH3nRauLIqKDt2EGDMWuy3m-a_xwrY",
    authDomain: "khankah-demo.firebaseapp.com",
    projectId: "khankah-demo",
    storageBucket: "khankah-demo.firebasestorage.app",
    messagingSenderId: "288018958610",
    appId: "1:288018958610:web:b486f8e13848c67cc08bcb",
    measurementId: "G-WFH11S2XN4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Collection Names
const COLLECTIONS = {
    BOOKINGS: 'khanqah_bookings',
    COUNTERS: 'khanqah_counters',
    SETTINGS: 'khanqah_settings'
};

export { app, auth, db, COLLECTIONS };


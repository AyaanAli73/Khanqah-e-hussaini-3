// =========================================
// KHANQAH WEBSITE LOGIC (FULL)
// =========================================


import { signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, doc, runTransaction, serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { auth, db, COLLECTIONS } from './config/firebase-config.js';

// --- Global Variables ---
let currentUser = null;
let blockedDates = [];
let dayLimits = {};
let dayCounts = {};
const submitBtn = document.getElementById('submitBtn');
const btnText = document.getElementById('btnText');

// --- Toast Notification ---
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if(!container) return; // Safety check
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = type === 'error' ? '<i class="fas fa-exclamation-circle text-red-500 text-xl"></i>' : '<i class="fas fa-check-circle text-emerald text-xl"></i>';
    toast.innerHTML += `<span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 5000);
}
window.showToast = showToast;

// --- Initialization Listeners (Firebase) ---
function initListeners() {
    // 1. Calendar Settings
    onSnapshot(doc(db, COLLECTIONS.SETTINGS, 'calendar_config'), (doc) => {
        if(doc.exists()) {
            blockedDates = doc.data().blocked || [];
            dayLimits = doc.data().limits || {};
        }
        populateDates();
    }, (e) => console.log("Settings sync error", e));

    // 2. Daily Counts
    onSnapshot(doc(db, COLLECTIONS.COUNTERS, 'daily_counts'), (doc) => {
        if(doc.exists()) {
            dayCounts = doc.data();
        } else {
            dayCounts = {};
        }
        populateDates();
    });

    // 3. Site Config (Maintenance & Popup)
    onSnapshot(doc(db, COLLECTIONS.SETTINGS, 'site_config'), (docSnap) => {
        if(docSnap.exists()) {
            const data = docSnap.data();
            
            // Maintenance Mode
            const maintenanceDiv = document.getElementById('bookingMaintenance');
            if (maintenanceDiv) {
                if (data.maintenanceMode) maintenanceDiv.classList.remove('hidden');
                else maintenanceDiv.classList.add('hidden');
            }

            // Popup Logic
            const popupModal = document.getElementById('globalPopupModal');
            if (popupModal && data.showPopup && (data.popupMessage || data.popupImageUrl)) {
                document.getElementById('globalPopupText').textContent = data.popupMessage || '';
                const popupImg = document.getElementById('popupImage');
                const popupImgContainer = document.getElementById('popupImageContainer');
                
                if (data.popupImageUrl) {
                    popupImg.src = data.popupImageUrl;
                    popupImgContainer.classList.remove('hidden');
                } else {
                    popupImgContainer.classList.add('hidden');
                }
                popupModal.classList.remove('hidden');
                setTimeout(() => popupModal.classList.remove('opacity-0'), 100);
            }
        }
    });
}

// Close Popup Global
window.closeGlobalPopup = function() {
    const popupModal = document.getElementById('globalPopupModal');
    if(popupModal) {
        popupModal.classList.add('opacity-0');
        setTimeout(() => popupModal.classList.add('hidden'), 500);
    }
}

// --- Booking Date Logic ---
function populateDates() {
    const select = document.getElementById('day');
    if(!select) return;
    
    select.innerHTML = '<option value="" class="bg-royal text-gray-500">Select Day</option>';
    
    const today = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        
        const dayName = days[d.getDay()];
        const dateNum = d.getDate();
        const isoDate = d.toISOString().split('T')[0];
        
        const nth = (n) => { if(n>3 && n<21) return 'th'; switch (n % 10) { case 1: return "st"; case 2: return "nd"; case 3: return "rd"; default: return "th"; } };
        const dateString = `${dayName}, ${dateNum}${nth(dateNum)}`;

        if (blockedDates.includes(isoDate)) continue;
        if (dayName === 'Friday') continue; 

        const limit = dayLimits[isoDate] || 0;
        const count = dayCounts[isoDate] || 0;
        const isFull = limit > 0 && count >= limit;

        const option = document.createElement('option');
        option.value = `${isoDate}|${dateString}`;
        
        if (isFull) {
            option.textContent = `${dateString} (FULL)`;
            option.disabled = true;
        } else {
            option.textContent = dateString;
        }
        option.className = "bg-royal text-white";
        select.appendChild(option);
    }
}

// --- Auth & Initial Load ---
signInAnonymously(auth).then((userCredential) => {
    currentUser = userCredential.user;
    if(submitBtn) submitBtn.disabled = false;
    if(btnText) btnText.textContent = "Generate Token";
    console.log("Database Connected");
    initListeners();
}).catch((error) => {
    console.error("Auth Error:", error);
    currentUser = { uid: "guest_" + Math.random().toString(36).substr(2, 9) };
    if(submitBtn) submitBtn.disabled = false;
    if(btnText) btnText.textContent = "Generate Token (Guest)";
    initListeners();
});

// --- Form Submission ---
const tokenForm = document.getElementById('tokenForm');
if(tokenForm) {
    tokenForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        if (!currentUser) currentUser = { uid: "guest_" + Math.random().toString(36).substr(2, 9) };

        submitBtn.classList.add('btn-loading'); 
        btnText.textContent = "Processing...";

        const name = document.getElementById('name').value;
        const city = document.getElementById('city').value;
        const mobile = document.getElementById('mobile').value;
        const dayValue = document.getElementById('day').value;

        if (!dayValue) {
            showToast("Please select a valid date", "error");
            submitBtn.classList.remove('btn-loading');
            btnText.textContent = "Generate Token";
            return;
        }

        const [dateCode, dayLabel] = dayValue.split('|');

        try {
            const counterRef = doc(db, COLLECTIONS.COUNTERS, dateCode); 
            const dailyRef = doc(db, COLLECTIONS.COUNTERS, 'daily_counts');
            const bookingsCol = collection(db, COLLECTIONS.BOOKINGS);

            const newTokenNum = await runTransaction(db, async (transaction) => {
                const counterDoc = await transaction.get(counterRef);
                const dailyDoc = await transaction.get(dailyRef);

                let nextToken = 1;
                if (counterDoc.exists()) {
                    nextToken = (counterDoc.data().current || 0) + 1;
                }

                const currentDailyCount = dailyDoc.exists() ? (dailyDoc.data()[dateCode] || 0) : 0;
                const limit = dayLimits[dateCode] || 0;
                
                if (limit > 0 && currentDailyCount >= limit) {
                    throw new Error("Sorry, bookings for this day are full.");
                }

                transaction.set(counterRef, { current: nextToken }, { merge: true });
                transaction.set(dailyRef, { [dateCode]: currentDailyCount + 1 }, { merge: true });

                const newBookingRef = doc(bookingsCol); 
                transaction.set(newBookingRef, {
                    tokenNumber: nextToken,
                    name: name,
                    city: city,
                    mobile: mobile,
                    day: dayLabel,
                    dateCode: dateCode,
                    userId: currentUser.uid,
                    timestamp: serverTimestamp()
                });

                return nextToken;
            });

            document.getElementById('modalName').textContent = name;
            document.getElementById('modalCity').textContent = city;
            document.getElementById('modalDay').textContent = dayLabel;
            document.getElementById('modalMobile').textContent = mobile;
            document.getElementById('modalTokenNum').textContent = "#" + String(newTokenNum).padStart(2, '0');
            
            document.getElementById('tokenModal').classList.remove('hidden');
            setTimeout(() => document.getElementById('modalContent').classList.remove('scale-95'), 10);
            localStorage.setItem('kToken', newTokenNum);
            tokenForm.reset();

        } catch (e) {
            console.error("Booking Error: ", e);
            if(e.message.includes("full")) showToast(e.message, "error");
            else showToast("Error: " + e.message, "error");
        } finally {
            submitBtn.classList.remove('btn-loading');
            btnText.textContent = "Generate Token";
        }
    });
}

window.closeModal = function() {
    document.getElementById('modalContent').classList.add('scale-95');
    setTimeout(() => document.getElementById('tokenModal').classList.add('hidden'), 200);
}

// --- UI Animations & Preloader ---
function removePreloader() {
    const p = document.getElementById('preloader');
    if(p) { p.style.opacity = '0'; p.style.visibility = 'hidden'; }
    const mainBody = document.getElementById('main-body');
    if(mainBody) mainBody.style.opacity = '1';
}

window.addEventListener('load', function() { 
    window.scrollTo(0, 0); 
    const mainBody = document.getElementById('main-body');
    if(mainBody) mainBody.classList.add('fade-in-active'); 
    setTimeout(removePreloader, 1500);
});
setTimeout(removePreloader, 1000); // Fallback

// AOS Init
if(typeof AOS !== 'undefined') {
    AOS.init({ once: true, mirror: false, duration: 1200, offset: 120, easing: 'ease-out-cubic' });
}

// Scroll Progress & Navbar
window.addEventListener('scroll', () => {
    const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrolled = (winScroll / height) * 100;
    
    const pBar = document.getElementById("progress-bar");
    if(pBar) pBar.style.width = scrolled + "%";
    
    const navbar = document.getElementById('navbar');
    if(navbar) {
        if (window.scrollY > 50) navbar.classList.add('nav-scrolled'); 
        else navbar.classList.remove('nav-scrolled');
    }
});

// --- Animated Counters ---
const counters = document.querySelectorAll('.counter');
const observerOptions = { threshold: 0.5 }; 
const counterObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const counter = entry.target;
            const target = +counter.getAttribute('data-target');
            const duration = 2000; 
            const increment = target / (duration / 16); 
            let current = 0;
            const updateCounter = () => {
                current += increment;
                if (current < target) {
                    counter.innerText = Math.ceil(current);
                    requestAnimationFrame(updateCounter);
                } else {
                    counter.innerText = target;
                }
            };
            updateCounter();
            observer.unobserve(counter);
        }
    });
}, observerOptions);
counters.forEach(counter => counterObserver.observe(counter));


// =========================================
// CLOCK, DATE & PRAYER TIMES (Fixed Logic)
// =========================================

function updatePrayerTimes() {
    const now = new Date();
    
    // 1. Update Clock
    const clockEl = document.getElementById('live-clock');
    if (clockEl) {
        clockEl.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    }
    
    // 2. Update Date (With Safety Check)
    const dateEl = document.querySelector('.date-display');
    if (dateEl) {
        dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    // 3. Next Prayer Calculation
    const prayers = [
        { name: "Fajr", time: "05:15" },
        { name: "Zohar", time: "13:30" },
        { name: "Asr", time: "16:45" },
        { name: "Maghrib", time: "18:10" },
        { name: "Isha", time: "20:00" }
    ];

    let nextPrayer = null;
    let nextPrayerTimeObj = null;

    for (let p of prayers) {
        const [h, m] = p.time.split(':');
        const pTime = new Date();
        pTime.setHours(h, m, 0, 0);

        if (pTime > now) {
            nextPrayer = p.name;
            nextPrayerTimeObj = pTime;
            break;
        }
    }

    // If no next prayer (After Isha), then Fajr tomorrow
    if (!nextPrayer) {
        nextPrayer = "Fajr";
        const [h, m] = prayers[0].time.split(':');
        nextPrayerTimeObj = new Date();
        nextPrayerTimeObj.setDate(now.getDate() + 1);
        nextPrayerTimeObj.setHours(h, m, 0, 0);
    }

    // Update Text
    const nameEl = document.getElementById('next-prayer-name');
    const countEl = document.getElementById('countdown-timer');
    if (nameEl) nameEl.textContent = nextPrayer;

    // Update Countdown
    if (nextPrayerTimeObj && countEl) {
        const diff = nextPrayerTimeObj - now;
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        countEl.textContent = `-${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    // Active Card Highlight
    document.querySelectorAll('.prayer-card').forEach(card => {
        card.classList.remove('border-gold', 'bg-gold/10', 'shadow-[0_0_15px_rgba(212,175,55,0.3)]');
        card.classList.add('bg-white/5', 'border-white/10');
        const dot = card.querySelector('.active-indicator');
        if(dot) dot.classList.add('hidden');
    });

    const activeCard = document.getElementById(`card-${nextPrayer.toLowerCase()}`);
    if (activeCard) {
        activeCard.classList.remove('bg-white/5', 'border-white/10');
        activeCard.classList.add('border-gold', 'bg-gold/10', 'shadow-[0_0_15px_rgba(212,175,55,0.3)]');
    }
}
// Run every second
setInterval(updatePrayerTimes, 1000);
updatePrayerTimes();


// =========================================
// MOBILE MENU (Fixed Logic)
// =========================================
const menuBtn = document.getElementById('menu-btn');
const mobileMenu = document.getElementById('mobile-menu');

if(menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('active');
        
        if (mobileMenu.classList.contains('active')) {
            document.documentElement.classList.add('menu-open');
            document.body.classList.add('menu-open');
            document.querySelectorAll('.menu-link').forEach((link, index) => { 
                setTimeout(() => link.classList.remove('opacity-0', 'translate-y-10'), 100 + (index * 100)); 
            });
        } else {
            document.documentElement.classList.remove('menu-open');
            document.body.classList.remove('menu-open');
            document.querySelectorAll('.menu-link').forEach(link => link.classList.add('opacity-0', 'translate-y-10'));
        }
    });
    
    // Close on Link Click
    document.querySelectorAll('.menu-link').forEach(link => {
        link.addEventListener('click', () => {
            mobileMenu.classList.remove('active');
            document.documentElement.classList.remove('menu-open');
            document.body.classList.remove('menu-open');
        });
    });
}

// =========================================
// SUFI WISDOM AUTO-CHANGER
// =========================================
const sufiQuotes = [
    { text: "\"What you seek is seeking you.\"", author: "Maulana Rumi (RA)" },
    { text: "\"The wound is the place where the Light enters you.\"", author: "Maulana Rumi (RA)" },
    { text: "\"Patience is not sitting and waiting, it is foreseeing.\"", author: "Hazrat Shams Tabrizi (RA)" },
    { text: "\"Do not look at my exterior form, but take what is in my hand.\"", author: "Sheikh Abdul Qadir Jilani (RA)" },
    { text: "\"A hopeless man sees difficulties in every chance, but a hopeful man sees chances in every difficulty.\"", author: "Hazrat Ali (RA)" }
];

let currentQuoteIndex = 0;
const quoteTextEl = document.getElementById('quote-text');
const quoteAuthorEl = document.getElementById('quote-author');
const quoteWrapper = document.getElementById('quote-wrapper');

function changeQuote() {
    if(!quoteWrapper) return;
    
    quoteWrapper.classList.add('fade-out'); // Use CSS class instead of inline style for cleaner separation
    setTimeout(() => {
        currentQuoteIndex = (currentQuoteIndex + 1) % sufiQuotes.length;
        if(quoteTextEl) quoteTextEl.innerText = sufiQuotes[currentQuoteIndex].text;
        if(quoteAuthorEl) quoteAuthorEl.innerText = sufiQuotes[currentQuoteIndex].author;
        
        quoteWrapper.classList.remove('fade-out');
    }, 1000);
}
setInterval(changeQuote, 6000);


/* --- Smooth Scroll to Booking Card (Fix) --- */
document.addEventListener('DOMContentLoaded', () => {
    // Jahan bhi '#booking' link hai, usko pakdo
    const bookingLinks = document.querySelectorAll('a[href="#booking"]');

    bookingLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault(); // Default jump roko

            // Hum seedha Form (#tokenForm) ko dhundhenge
            const targetForm = document.getElementById('tokenForm');

            if (targetForm) {
                // Card ka container dhundo (form ka parent) taaki pura card dikhe
                const targetCard = targetForm.closest('.relative.group'); 

                if(targetCard) {
                    // Navbar ki height (approx 100px) minus karke scroll position set karo
                    const headerOffset = 140; 
                    const elementPosition = targetCard.getBoundingClientRect().top;
                    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                    window.scrollTo({
                        top: offsetPosition,
                        behavior: "smooth"
                    });
                }
            }
        });
    });
});

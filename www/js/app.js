import { db, collection, addDoc, serverTimestamp, auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, updatePassword } from "./firebase-config.js";
import { getDocs, doc, getDoc, setDoc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let WHATSAPP_NUMBER = "8801700000000"; 
let DELIVERY_FEE = 0; // এডমিন সেটিংস থেকে ডাইনামিক লোড হবে
let currentProduct = '';
let currentPrice = 0;
let currentProductImage = ''; 
let allProducts = [];

// কোনো বাইরের ডেমো ছবি থাকবে না, শুধুমাত্র আপনার আপলোড করা ব্যানার দেখাবে
const DEFAULT_BANNERS = [];

// কোনো বাইরের ডেমো লিংক থাকবে না, শুধুমাত্র আপনার ফায়ারবেস ডেটাবেজ ও স্টোরেজের আসল পণ্যই দেখাবে
const DEFAULT_PRODUCTS = [];

let currentSlide = 0;
let slideTimer = null;
let sliderImages = [];

function initHeroSlider(images) {
    if (images && images.length > 0) sliderImages = images;
    
    const box = document.getElementById("heroSliderBox");
    const track = document.getElementById("sliderTrack");
    const dotsContainer = document.getElementById("sliderDots");
    if (!track || !dotsContainer || !box) return;

    box.style.display = "block";

    track.innerHTML = sliderImages.map((img, idx) => `
        <div class="slide-item">
            <img src="${img}" alt="ব্যানার" ${idx === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}>
        </div>
    `).join('');

    dotsContainer.innerHTML = sliderImages.map((_, i) => `
        <div class="dot ${i === 0 ? 'active' : ''}" onclick="window.goToSlide(${i})"></div>
    `).join('');

    let touchStartX = 0;
    let touchEndX = 0;
    track.ontouchstart = (e) => { touchStartX = e.changedTouches[0].screenX; };
    track.ontouchend = (e) => {
        touchEndX = e.changedTouches[0].screenX;
        if (touchStartX - touchEndX > 50) {
            window.nextSlide();
        } else if (touchEndX - touchStartX > 50) {
            window.prevSlide();
        }
    };

    startSliderTimer();
}

window.goToSlide = function(index) {
    if (sliderImages.length === 0) return;
    currentSlide = index;
    const track = document.getElementById("sliderTrack");
    if(track) track.style.transform = `translateX(-${currentSlide * 100}%)`;

    document.querySelectorAll(".slider-dots .dot").forEach((d, i) => {
        d.classList.toggle("active", i === currentSlide);
    });

    clearInterval(slideTimer);
    startSliderTimer();
};

window.nextSlide = function() {
    if (sliderImages.length <= 1) return;
    currentSlide = (currentSlide + 1) % sliderImages.length;
    window.goToSlide(currentSlide);
};

window.prevSlide = function() {
    if (sliderImages.length <= 1) return;
    currentSlide = (currentSlide - 1 + sliderImages.length) % sliderImages.length;
    window.goToSlide(currentSlide);
};

function startSliderTimer() {
    clearInterval(slideTimer);
    if (sliderImages.length <= 1) return;
    slideTimer = setInterval(() => {
        window.nextSlide();
    }, 4000);
}

// পেজ ওপেন হওয়ার ০.০১ সেকেন্ডে লোগো দেখানোর ইনস্ট্যান্ট ফাংশন
function applyLogoInstantly(logoUrl) {
    if (!logoUrl) return;
    document.querySelectorAll('.brand-icon-box').forEach(box => {
        box.innerHTML = `<img src="${logoUrl}" alt="লোগো" style="width:100%; height:100%; border-radius:inherit; object-fit:contain; display:block;">`;
    });
    document.querySelectorAll('.footer-brand .leaf').forEach(span => {
        span.innerHTML = `<img src="${logoUrl}" alt="লোগো" style="width:26px; height:26px; border-radius:6px; object-fit:contain; display:block;">`;
    });
}

// সাইটে ক্লিক করার সাথে সাথে ক্যাশ থেকে তাত্ক্ষণিক লোগো বসানো (জিরো ডিলে)
const cachedSiteLogo = localStorage.getItem('cachedSiteLogo');
if (cachedSiteLogo) {
    applyLogoInstantly(cachedSiteLogo);
}

// ১. এডমিন সেটিংস থেকে ডাটা এনে সাইটে বসানো
async function loadSiteSettings() {
    startCounterAnimation();

    try {
        const docSnap = await getDoc(doc(db, "settings", "general"));
        if(docSnap.exists()) {
            const s = docSnap.data();
            WHATSAPP_NUMBER = s.whatsapp || "8801700000000";
            DELIVERY_FEE = (s.deliveryFee !== undefined && s.deliveryFee !== null) ? Number(s.deliveryFee) : 0;
            localStorage.setItem('cachedDeliveryFee', DELIVERY_FEE);

            // ডেটাবেজের লোগো ক্যাশে আপডেট ও স্ক্রিনে সেট করা
            if(s.logoUrl) {
                localStorage.setItem('cachedSiteLogo', s.logoUrl);
                applyLogoInstantly(s.logoUrl);
            }

            if(s.announcement && document.getElementById("announcementText")) {
                document.getElementById("announcementText").innerText = s.announcement;
            }
            if(s.phone && document.getElementById("footerPhone")) {
                document.getElementById("footerPhone").innerHTML = `<span>📞 ফোন: ${s.phone}</span>`;
            }
            if(s.email && document.getElementById("footerEmail")) {
                document.getElementById("footerEmail").innerHTML = `<span>✉️ ইমেইল: ${s.email}</span>`;
            }
            if(s.address && document.getElementById("footerAddress")) {
                document.getElementById("footerAddress").innerHTML = `<span>📍 ঠিকানা: ${s.address}</span>`;
            }

            fetchBanners(s);
            if(WHATSAPP_NUMBER && document.getElementById("floatingWaBtn")) {
                document.getElementById("floatingWaBtn").href = `https://wa.me/${WHATSAPP_NUMBER}`;
            }

            if(s.statMango) document.getElementById("counterMango")?.setAttribute("data-target", s.statMango);
            if(s.statGur) document.getElementById("counterGur")?.setAttribute("data-target", s.statGur);
            if(s.statAachar) document.getElementById("counterAachar")?.setAttribute("data-target", s.statAachar);
            if(s.statFamily) document.getElementById("counterFamily")?.setAttribute("data-target", s.statFamily);
            startCounterAnimation();
        }
    } catch(e) {
        console.warn("Using local settings fallback:", e);
    }
}

// সাইটে ঢোকার সঙ্গে সঙ্গে (০.০১ সেকেন্ডে) ক্যাশ থেকে ব্যানার সরাসরি দেখানো
try {
    const cachedBanners = JSON.parse(localStorage.getItem('cachedSiteBanners') || '[]');
    if (cachedBanners && cachedBanners.length > 0) {
        initHeroSlider(cachedBanners);
    }
} catch(e) {}

async function fetchBanners(s = {}) {
    try {
        const snap = await getDocs(collection(db, "banners"));
        let banners = [];
        snap.forEach(docSnap => {
            const data = docSnap.data();
            if (data.image) banners.push(data.image);
        });

        if (banners.length > 0) {
            localStorage.setItem('cachedSiteBanners', JSON.stringify(banners));
            initHeroSlider(banners);
        } else {
            const fallback = [s.banner1, s.banner2, s.banner3].filter(Boolean);
            if (fallback.length > 0) {
                localStorage.setItem('cachedSiteBanners', JSON.stringify(fallback));
                initHeroSlider(fallback);
            }
        }
    } catch(e) {
        console.warn("ব্যানার লোড এরর:", e);
    }
}

const productGrid = document.getElementById('productGrid');

// সাইটে ঢোকার সঙ্গে সঙ্গে (০.০১ সেকেন্ডে) ক্যাশ থেকে পণ্য সরাসরি দেখানো (জিরো লোডিং)
try {
    const cachedProducts = JSON.parse(localStorage.getItem('cachedSiteProducts') || '[]');
    if (cachedProducts && cachedProducts.length > 0) {
        allProducts = cachedProducts;
        renderProducts(allProducts);
    }
} catch(e) {}

async function fetchProducts() {
    try {
        const snapshot = await getDocs(collection(db, "products"));
        if(!snapshot.empty) {
            const liveProducts = [];
            snapshot.forEach(docSnap => {
                liveProducts.push({ id: docSnap.id, ...docSnap.data() });
            });
            allProducts = liveProducts;
            // ক্যাশ আপডেট করা যাতে পরের বার ঢোকার সাথে সাথে ইনস্ট্যান্ট দেখায়
            localStorage.setItem('cachedSiteProducts', JSON.stringify(liveProducts));
            applyAllFilters();
        }
    } catch (e) {
        console.warn("Using instant products fallback:", e);
    }
}

let currentSelectedCategory = 'all';
let currentSearchTerm = '';
let currentSortType = 'popular';

// স্ক্রল এনিমেশন চালু করার হাই-পারফরম্যান্স ফাংশন
function triggerScrollRevealAnimations() {
    const targets = document.querySelectorAll('.prod-card-v2, .trust-pill-box, .metric-trust-card, .section-title-wrap, .footer-col');
    
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                obs.unobserve(entry.target);
            }
        });
    }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });

    targets.forEach((el, idx) => {
        if (!el.classList.contains('is-visible')) {
            el.classList.add('reveal-on-scroll');
            // কার্ডগুলো যাতে একটার পর একটা তরঙ্গের মতো মসৃণভাবে ভাসে (Stagger effect)
            if (el.classList.contains('prod-card-v2') || el.classList.contains('trust-pill-box')) {
                el.style.transitionDelay = `${(idx % 4) * 0.06}s`;
            }
            observer.observe(el);
        }
    });
}

function renderProducts(products) {
    if(!productGrid) return;

    if(products.length === 0) {
        productGrid.innerHTML = `
            <div style="text-align:center; grid-column:1/-1; padding:40px 16px; background:#FFF; border:1px dashed #D5C7B8; border-radius:18px;">
                <span style="display:inline-flex; align-items:center; justify-content:center; color:#9CA3AF; margin-bottom:8px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>
                </span>
                <h4 style="font-size:15px; color:#123C27; margin-bottom:4px;">কোনো পণ্য পাওয়া যায়নি</h4>
                <p style="font-size:12px; color:#6B7280;">অন্য ক্যাটাগরি বা ফিল্টার নির্বাচন করে চেষ্টা করুন।</p>
            </div>
        `;
        return;
    }

    const favs = JSON.parse(localStorage.getItem('userFavorites') || '[]');

    productGrid.innerHTML = products.map(prod => {
        const inStock = prod.inStock !== false;
        const isFav = favs.includes(prod.name);

        return `
            <div class="prod-card-v2" onclick="window.openProductDetailModal('${prod.id}')" style="cursor: pointer;">
                <!-- কোনো ব্যাজ বা হার্ট বাটন ছাড়া একদম পরিষ্কার পণ্যের ছবি -->
                <div class="prod-img-box">
                    <img src="${prod.image}" alt="${prod.name}" loading="lazy">
                </div>

                <div class="prod-card-content">
                    <h4 class="prod-card-title">${prod.name}</h4>

                    <div class="prod-price-block" style="display: flex; align-items: baseline; gap: 5px; margin-bottom: 5px;">
                        <span class="price-val" style="color: #E63946; font-size: 15.5px; font-weight: 800; line-height: 1;">৳ ${Number(prod.price).toLocaleString('bn-BD')}</span>
                        ${prod.regularPrice && Number(prod.regularPrice) > Number(prod.price) 
                            ? `<span class="price-old-val" style="font-size: 12px; color: #9CA3AF; text-decoration: line-through; line-height: 1;">৳ ${Number(prod.regularPrice).toLocaleString('bn-BD')}</span>` 
                            : `<span class="price-unit" style="font-size: 11px; color: #6B7280; line-height: 1;">/${prod.unit || 'কেজি'}</span>`
                        }
                    </div>

                    ${inStock 
                        ? `<div style="display: flex; gap: 5px; margin-top: 0; align-items: center;">
                             <button type="button" class="btn-card-order-full" onclick="event.stopPropagation(); window.triggerOrderModal('${prod.id || prod.name}')" style="flex: 1; padding: 6px 4px; font-size: 12px; border-radius: 16px; cursor: pointer;" title="সরাসরি অর্ডার">
                               <span>অর্ডার</span>
                             </button>
                             <button type="button" onclick="event.stopPropagation(); window.addToCart('${prod.id || prod.name}')" style="background: #E8F3ED; color: var(--primary); border: 1px solid #C2DED1; border-radius: 16px; padding: 6px 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; height: 30px; width: 32px;" title="কার্টে যোগ করুন">
                               <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
                             </button>
                           </div>`
                        : `<button class="btn-card-order-full disabled" disabled style="padding: 6px; font-size: 11.5px; border-radius: 16px;">স্টক শেষ</button>`
                    }
                </div>
            </div>
        `;
    }).join('');

    // পণ্য রেন্ডার হওয়ার সাথে সাথে স্মুথ স্ক্রল এনিমেশন চালু
    setTimeout(triggerScrollRevealAnimations, 40);
}

// সাইট লোড হওয়ার সাথে সাথে পেজের অন্যান্য অংশের স্ক্রল এনিমেশন সক্রিয়
setTimeout(triggerScrollRevealAnimations, 100);

// ফিল্টার ও সাজানোর কেন্দ্রীয় লজিক
function applyAllFilters() {
    let result = [...allProducts];

    if(currentSelectedCategory !== 'all') {
        result = result.filter(p => p.category === currentSelectedCategory);
    }

    if(currentSearchTerm) {
        const query = currentSearchTerm.toLowerCase();
        result = result.filter(p => 
            (p.name && p.name.toLowerCase().includes(query)) ||
            (p.origin && p.origin.toLowerCase().includes(query))
        );
    }

    if(currentSortType === 'lowToHigh') {
        result.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    } else if(currentSortType === 'highToLow') {
        result.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    }

    renderProducts(result);
}

window.toggleHeaderSearch = function() {
    const dropdown = document.getElementById('headerSearchDropdown');
    const input = document.getElementById('headerSearchInput');
    const headerContainer = document.querySelector('.header-container');
    if (!dropdown) return;

    if (dropdown.style.display === 'none' || dropdown.style.display === '') {
        dropdown.style.display = 'flex';
        if (headerContainer) headerContainer.classList.add('search-open-mobile');
        if (input) {
            setTimeout(() => input.focus(), 60);
        }
    } else {
        window.clearAndCloseHeaderSearch();
    }
};

window.handleHeaderLiveSearch = function(text) {
    currentSearchTerm = text.trim();
    applyAllFilters();
};

window.executeHeaderSearch = function() {
    window.navigateToScreen('home');
    setTimeout(() => {
        const pSec = document.getElementById('products');
        if (pSec) pSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
};

// সার্চ বন্ধ করার সময় ১০০% নিশ্চিতভাবে সাইটের নাম ফিরিয়ে আনা
window.clearAndCloseHeaderSearch = function() {
    const dropdown = document.getElementById('headerSearchDropdown');
    const input = document.getElementById('headerSearchInput');
    const headerContainer = document.querySelector('.header-container');
    
    if (input) input.value = '';
    currentSearchTerm = '';
    applyAllFilters();

    if (dropdown) dropdown.style.display = 'none';
    
    // সাথে সাথে মোবাইল ক্লাস রিমুভ করে সাইটের নাম ফিরিয়ে আনা
    if (headerContainer) {
        headerContainer.classList.remove('search-open-mobile');
    }
    
    // বাড়তি সুরক্ষা: যদি কোনো ব্রাউজারে নাম আটকে থাকে, তাকে সাথে সাথে ভিজিবল করা
    const brandBlock = document.querySelector('#headerBrandArea .brand-text-block');
    if (brandBlock) {
        brandBlock.style.display = '';
    }
};

window.handleClientSearch = window.handleHeaderLiveSearch;

window.handleProductSort = function(type) {
    currentSortType = type;
    applyAllFilters();
};



document.querySelectorAll('.tab-btn-pill, .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn-pill, .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSelectedCategory = btn.getAttribute('data-cat') || 'all';
        applyAllFilters();
    });
});

function startCounterAnimation() {
    let animated = false;
    const metricsSection = document.getElementById('metrics');
    if (!metricsSection) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !animated) {
                animated = true;
                document.querySelectorAll('.counter').forEach(counter => {
                    const target = +counter.getAttribute('data-target') || 0;
                    if(target === 0) { counter.innerText = "০"; return; }
                    let count = 0;
                    const inc = target / 30;
                    const update = () => {
                        count += inc;
                        if (count < target) {
                            counter.innerText = Math.ceil(count).toLocaleString('bn-BD');
                            setTimeout(update, 20);
                        } else {
                            counter.innerText = target.toLocaleString('bn-BD');
                        }
                    };
                    update();
                });
            }
        });
    }, { threshold: 0.3 });
    observer.observe(metricsSection);
}

// অর্ডার ফর্ম মডাল লজিক
const orderModal = document.getElementById('orderModal');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const orderForm = document.getElementById('orderForm');
const submitBtn = document.getElementById('submitBtn');

let currentOrderQuantity = 1;
let currentProductUnit = 'কেজি';
let currentProductOrigin = 'রাজশাহী';
let orderModalMode = 'single'; // 'single' অথবা 'cart'
let currentCartCheckoutItems = [];


window.triggerOrderModal = function(idOrName, price, image) {
    orderModalMode = 'single';
    
    // আইডি অথবা নাম মিলিয়ে নিখুঁতভাবে প্রোডাক্ট অবজেক্ট খুঁজে নেওয়া
    const prod = allProducts.find(p => String(p.id) === String(idOrName) || p.name === idOrName) || {};
    currentProduct = prod.name || idOrName || "পণ্য";
    currentPrice = Number(prod.price) || Number(price) || 0;
    currentProductImage = prod.image || image || '';
    currentProductUnit = prod.unit || 'কেজি';
    currentProductOrigin = prod.origin || 'রাজশাহী';

    const modal = document.getElementById('orderModal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }

    const mImg = document.getElementById('mProdImg');
    if(mImg) mImg.src = currentProductImage;
    
    if(document.getElementById('mProdName')) document.getElementById('mProdName').innerText = currentProduct;
    if(document.getElementById('mProdOrigin')) document.getElementById('mProdOrigin').innerText = `📍 ${currentProductOrigin}`;
    
    const inStock = prod.inStock !== false;
    const stockTag = document.getElementById('mProdStockTag');
    if(stockTag) {
        stockTag.innerText = inStock ? 'সিজনাল' : 'স্টক শেষ';
        stockTag.style.background = inStock ? '#123C27' : '#6B7280';
    }

    if(document.getElementById('mProdRate')) document.getElementById('mProdRate').innerText = `৳ ${currentPrice.toLocaleString('bn-BD')} /${currentProductUnit}`;
    if(document.getElementById('qtyRateHint')) document.getElementById('qtyRateHint').innerText = `(১ ${currentProductUnit} = ৳ ${currentPrice.toLocaleString('bn-BD')})`;

    // কোয়ান্টিটি বক্স ফিরিয়ে আনা এবং কার্ট প্রিভিউ বক্স থাকলে লুকিয়ে ফেলা
    const qtyBox = document.querySelector('.m-qty-select-box');
    if(qtyBox) qtyBox.style.display = 'block';

    const cartBox = document.getElementById('cartItemsPreviewBox');
    if(cartBox) cartBox.style.display = 'none';

    const loggedIn = JSON.parse(localStorage.getItem('loggedInCustomer') || 'null');
    const autoBadge = document.getElementById('autoFillBadge');

    if(loggedIn && loggedIn.name) {
        if(document.getElementById('orderName')) document.getElementById('orderName').value = loggedIn.name || '';
        if(document.getElementById('orderPhone')) document.getElementById('orderPhone').value = loggedIn.phone || '';
        if(document.getElementById('orderAddress')) document.getElementById('orderAddress').value = loggedIn.address || '';
        if(autoBadge) autoBadge.style.display = 'inline-block';
    } else {
        const savedPhone = localStorage.getItem('lastCustomerPhone');
        if(savedPhone && document.getElementById('orderPhone')) document.getElementById('orderPhone').value = savedPhone;
        if(autoBadge) autoBadge.style.display = 'none';
    }

    currentOrderQuantity = 1;
    resetQuickPillsUI(1);
    updateModalPriceDetails();

    orderModal.classList.add('active');
};

window.setQuickQty = function(qty, btnElem) {
    currentOrderQuantity = qty;
    document.querySelectorAll('.q-pill').forEach(b => b.classList.remove('active'));
    if(btnElem) btnElem.classList.add('active');
    updateModalPriceDetails();
};

window.changeOrderQty = function(delta) {
    currentOrderQuantity = Math.max(1, currentOrderQuantity + delta);
    resetQuickPillsUI(currentOrderQuantity);
    updateModalPriceDetails();
};

function resetQuickPillsUI(qty) {
    const pills = document.querySelectorAll('.q-pill');
    pills.forEach(b => b.classList.remove('active'));
    if(qty === 1 && pills[0]) pills[0].classList.add('active');
    else if(qty === 2 && pills[1]) pills[1].classList.add('active');
    else if(qty >= 3 && pills[2]) pills[2].classList.add('active');
}

// ইউনিটকে ১০০% বাংলায় রূপান্তর ও ডাবল সংখ্যা দূর করার ফিল্টার
function formatUnitBn(unit) {
    if (!unit) return 'কেজি';
    let u = unit.toString().trim();
    // যদি শুধু সংখ্যা লেখা থাকে (যেমন: '2' বা '1'), তবে স্বয়ংক্রিয়ভাবে 'কেজি' ধরে নেবে
    if (/^\d+$/.test(u)) return 'কেজি';
    // ইংরেজি সংখ্যা থাকলে বাংলায় রূপান্তর করবে
    const enToBnMap = {'0':'০','1':'১','2':'২','3':'৩','4':'৪','5':'৫','6':'৬','7':'৭','8':'৮','9':'৯'};
    return u.replace(/[0-9]/g, match => enToBnMap[match]);
}

function updateModalPriceDetails() {
    const safeUnit = formatUnitBn(currentProductUnit);
    const qtyBn = Number(currentOrderQuantity).toLocaleString('bn-BD');

    if(document.getElementById('orderQuantity')) document.getElementById('orderQuantity').value = currentOrderQuantity;
    if(document.getElementById('qtyDisplay')) document.getElementById('qtyDisplay').innerText = `${qtyBn} ${safeUnit}`;

    const subTotal = currentPrice * currentOrderQuantity;
    const finalTotal = subTotal + DELIVERY_FEE;

    if(document.getElementById('sumProdQtyLabel')) document.getElementById('sumProdQtyLabel').innerText = `পণ্য মূল্য (${qtyBn} ${safeUnit})`;
    if(document.getElementById('sumProdPrice')) document.getElementById('sumProdPrice').innerText = `৳ ${subTotal.toLocaleString('bn-BD')}`;
    
    // ডেলিভারি চার্জ ডিসপ্লে হ্যান্ডলিং
    const delBadge = document.getElementById('checkoutDeliveryBadge');
    if (delBadge) {
        if (DELIVERY_FEE === 0) {
            delBadge.innerText = 'ফ্রি ডেলিভারি';
            delBadge.style.background = '#E8F5EE';
            delBadge.style.color = '#15803D';
        } else {
            delBadge.innerText = `৳ ${DELIVERY_FEE.toLocaleString('bn-BD')}`;
            delBadge.style.background = '#F3F4F6';
            delBadge.style.color = '#111827';
        }
    }

    if(document.getElementById('sumTotalPrice')) document.getElementById('sumTotalPrice').innerText = `৳ ${finalTotal.toLocaleString('bn-BD')}`;
}

// চেকআউট মডাল সঠিকভাবে বন্ধ করার ফাংশন
window.closeOrderModal = function() {
    const modal = document.getElementById('orderModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
};

if(modalCloseBtn) modalCloseBtn.addEventListener('click', window.closeOrderModal);
window.addEventListener('click', (e) => { 
    if (e.target === orderModal) window.closeOrderModal(); 
});

if(orderForm) {
    // আগের কোনো অন-সাবমিট থাকলে তা পরিষ্কার করা
    orderForm.onsubmit = null;

    orderForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('orderName').value.trim();
        const phone = document.getElementById('orderPhone').value.trim();
        const address = document.getElementById('orderAddress').value.trim();

        if(!name || !phone || !address) {
            window.showAppToast("দয়া করে নাম, ফোন এবং ঠিকানা সঠিকভাবে পূরণ করুন।", "error");
            return;
        }

        const submitBtnElem = document.getElementById('submitBtn');
        if(submitBtnElem) {
            submitBtnElem.disabled = true;
            submitBtnElem.innerText = "অর্ডার প্রসেস হচ্ছে...";
        }

        const randomSerial = Math.floor(10000 + Math.random() * 90000);
        const generatedOrderId = `RR-2026-${randomSerial}`;

        try {
            let finalOrderData = {};

            if(orderModalMode === 'cart') {
                // কার্ট থেকে সম্মিলিত অর্ডার
                finalOrderData = {
                    orderNumber: generatedOrderId,
                    productName: "একাধিক পণ্য (" + currentCartCheckoutItems.map(i => i.name).join(', ') + ")",
                    cartItems: currentCartCheckoutItems,
                    totalPrice: Number(currentPrice) || 0,
                    customerName: name,
                    customerPhone: phone,
                    deliveryAddress: address,
                    productImage: currentProductImage || (currentCartCheckoutItems[0] ? currentCartCheckoutItems[0].image : ''),
                    status: "Pending",
                    orderDate: serverTimestamp()
                };
            } else {
                // সিঙ্গেল প্রোডাক্ট অর্ডার
                const singleTotal = currentPrice * currentOrderQuantity;
                finalOrderData = {
                    orderNumber: generatedOrderId,
                    productName: currentProduct || "পণ্য",
                    unitPrice: Number(currentPrice) || 0,
                    quantity: currentOrderQuantity,
                    unit: currentProductUnit,
                    totalPrice: singleTotal,
                    customerName: name,
                    customerPhone: phone,
                    deliveryAddress: address,
                    productImage: currentProductImage,
                    status: "Pending",
                    orderDate: serverTimestamp()
                };
            }

            // ফায়ারবেসে মাত্র একটি অর্ডার সেভ হবে
            await addDoc(collection(db, "orders"), finalOrderData);

            localStorage.setItem('lastOrderNumber', generatedOrderId);
            localStorage.setItem('lastCustomerPhone', phone);

            // কার্ট অর্ডার সফল হলে লোকাল স্টোরেজ কার্ট খালি করা
            if(orderModalMode === 'cart') {
                localStorage.removeItem('userCart');
                updateCartBadgeCount();
            }

            // সাকসেস স্ক্রিনে আসল ডেটা ডাইনামিক বসানো
            if(document.getElementById('succOrderId')) document.getElementById('succOrderId').innerText = generatedOrderId;

            // কার্ট কম্বো হলে একাধিক পণ্যের থাম্বনেইল প্রদর্শন, সিঙ্গেল হলে একটি ছবি
            const thumbContainer = document.getElementById('succProdThumbContainer');
            if (thumbContainer) {
                if (orderModalMode === 'cart' && currentCartCheckoutItems.length > 0) {
                    thumbContainer.innerHTML = currentCartCheckoutItems.slice(0, 2).map(item => `
                        <img src="${item.image || 'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=150&q=80'}" style="width: 52px; height: 52px; border-radius: 12px; object-fit: cover; background: #F4F6F4; border: 1px solid #E5E7EB;">
                    `).join('');
                } else {
                    thumbContainer.innerHTML = `
                        <img src="${finalOrderData.productImage || 'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=150&q=80'}" style="width: 54px; height: 54px; border-radius: 12px; object-fit: cover; background: #F4F6F4; border: 1px solid #E5E7EB;">
                    `;
                }
            }

            if(document.getElementById('succProdName')) {
                document.getElementById('succProdName').innerText = orderModalMode === 'cart' 
                    ? `সম্মিলিত অর্ডার (${currentCartCheckoutItems.length.toLocaleString('bn-BD')}টি পণ্য)` 
                    : currentProduct;
            }
            if(document.getElementById('succProdQtyUnit')) {
                document.getElementById('succProdQtyUnit').innerText = orderModalMode === 'cart' 
                    ? "কার্ট কম্বো" 
                    : `${currentOrderQuantity.toLocaleString('bn-BD')} ${currentProductUnit}`;
            }
            if(document.getElementById('succProdRate')) {
                document.getElementById('succProdRate').innerText = orderModalMode === 'cart' 
                    ? `মোট আইটেম: ${currentCartCheckoutItems.length.toLocaleString('bn-BD')}টি` 
                    : `৳ ${currentPrice.toLocaleString('bn-BD')} / ${currentProductUnit}`;
            }
            if(document.getElementById('succTotalPrice')) {
                document.getElementById('succTotalPrice').innerText = `৳ ${(finalOrderData.totalPrice).toLocaleString('bn-BD')}`;
            }

            // হোয়াটসঅ্যাপ বাটনে অর্ডার নম্বরসহ সরাসরি চ্যাট লিংক সেট করা
            const succWaBtn = document.getElementById('succWaBtn');
            if(succWaBtn && WHATSAPP_NUMBER) {
                const cleanWaNum = WHATSAPP_NUMBER.replace(/[^0-9]/g, '');
                const waMessage = encodeURIComponent(`আসসালামু আলাইকুম, আমি ঋতুবীজ থেকে একটি অর্ডার করেছি।\nআমার অর্ডার নম্বর: #${generatedOrderId}\nঅর্ডার সম্পর্কিত তথ্য জানতে চাই।`);
                succWaBtn.href = `https://wa.me/${cleanWaNum}?text=${waMessage}`;
            }

            orderForm.reset();
            orderModal.classList.remove('active');
            orderModal.style.display = 'none';
            
            const successModal = document.getElementById('orderSuccessModal');
            if(successModal) {
                successModal.classList.add('active');
                successModal.style.display = 'flex';
                successModal.scrollTop = 0;
            }

        } catch (error) {
            console.error("Order Save Error:", error);
            window.showAppToast("অর্ডার সেভ হতে সমস্যা হয়েছে: " + error.message, "error");
        } finally {
            if(submitBtnElem) {
                submitBtnElem.disabled = false;
                submitBtnElem.innerText = "🛒 অর্ডার কনফার্ম করুন";
            }
        }
    });
}

window.copySuccessOrderId = function() {
    const idText = document.getElementById('succOrderId')?.innerText || '';
    if(idText) {
        navigator.clipboard.writeText(idText).then(() => {
            window.showAppToast("অর্ডার নম্বর কপি করা হয়েছে! 📋");
        }).catch(() => {
            window.showAppToast("অর্ডার কোড: " + idText);
        });
    }
};

window.closeSuccessAndGo = function(target) {
    const successModal = document.getElementById('orderSuccessModal');
    if(successModal) {
        successModal.classList.remove('active');
        successModal.style.display = 'none';
    }
    if(target === '#products') {
        window.navigateToScreen('home');
        setTimeout(() => {
            const pSec = document.getElementById('products');
            if(pSec) pSec.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    } else {
        window.navigateToScreen('home');
    }
};

let myMasterOrdersList = [];
let currentMyOrderFilter = 'all';

function formatBengaliDateTime(dateObj) {
    if (!dateObj) return "তারিখ নেই";
    const d = dateObj.toDate ? dateObj.toDate() : new Date(dateObj);
    const months = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
    const day = d.getDate().toLocaleString('bn-BD');
    const month = months[d.getMonth()];
    const year = d.getFullYear().toLocaleString('bn-BD');
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0').toLocaleString('bn-BD');
    const ampm = hours >= 12 ? 'অপরাহ্ন' : 'পূর্বাহ্ন';
    hours = hours % 12 || 12;
    return `${day} ${month} ${year}, ${hours.toLocaleString('bn-BD')}:${minutes} ${ampm}`;
}

window.navigateToScreen = function(screenName) {
    if (typeof window.clearAndCloseHeaderSearch === 'function') {
        window.clearAndCloseHeaderSearch();
    }

    const homeView = document.querySelector('main.container');
    const metricsView = document.getElementById('metrics');
    const footerContact = document.getElementById('contact');
    const ordersView = document.getElementById('ordersPageView');
    const favsView = document.getElementById('favoritesPageView');
    const profileView = document.getElementById('profilePageView');
    const cartPageView = document.getElementById('cartPageView');
    const detailPageView = document.getElementById('productDetailPageView');

    // ৬০ FPS স্মুথ ফ্রেম ট্রানজিশন
    requestAnimationFrame(() => {
        if (homeView) homeView.style.display = 'none';
        if (metricsView) metricsView.style.display = 'none';
        if (footerContact) footerContact.style.display = 'none';
        if (ordersView) ordersView.style.display = 'none';
        if (favsView) favsView.style.display = 'none';
        if (profileView) profileView.style.display = 'none';
        if (cartPageView) cartPageView.style.display = 'none';
        if (detailPageView) detailPageView.style.display = 'none';

        document.querySelectorAll('.b-nav-item').forEach(b => b.classList.remove('active'));

        if (screenName === 'orders') {
            if (ordersView) ordersView.style.display = 'block';
            const ordNav = document.querySelectorAll('.b-nav-item')[1];
            if (ordNav) ordNav.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            loadMyLiveOrders();
        } 
        else if (screenName === 'cart') {
            if (cartPageView) cartPageView.style.display = 'block';
            const cartNav = document.querySelectorAll('.b-nav-item')[2];
            if (cartNav) cartNav.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            renderCartItems();
        }
        else if (screenName === 'favorites') {
            if (favsView) favsView.style.display = 'block';
            window.scrollTo({ top: 0, behavior: 'smooth' });
            renderFavoritesScreen();
        } 
        else if (screenName === 'profile') {
            if (profileView) profileView.style.display = 'block';
            const profNav = document.querySelectorAll('.b-nav-item')[3];
            if (profNav) profNav.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            initProfileScreen();
        } 
        else {
            if (homeView) homeView.style.display = 'block';
            if (metricsView) metricsView.style.display = 'block';
            if (footerContact) footerContact.style.display = 'block';

            const homeNav = document.querySelectorAll('.b-nav-item')[0];
            if (homeNav) homeNav.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
};

// কোনো পেজের ভেতরে স্ক্রিন বা ডকুমেন্টে বাইরে ক্লিক করলেও সার্চ বার অটোমেটিক বন্ধ হওয়ার সেফটি গার্ড
document.addEventListener('click', function(e) {
    const searchDropdown = document.getElementById('headerSearchDropdown');
    const toggleBtn = document.getElementById('btnToggleSearch');
    if (!searchDropdown || searchDropdown.style.display === 'none') return;

    // ক্লিক যদি সার্চ বক্স বা সার্চ বাটনের বাইরে হয়, তবে সার্চ বারটি বন্ধ করে দেবে
    if (!searchDropdown.contains(e.target) && (!toggleBtn || !toggleBtn.contains(e.target))) {
        window.clearAndCloseHeaderSearch();
    }
});

window.openTrackModal = function() {
    window.navigateToScreen('orders');
};

window.openProfileModal = function() {
    window.navigateToScreen('profile');
};

function renderMyOrdersView(orders) {
    const resultArea = document.getElementById('trackResultArea');
    if(!resultArea) return;

    if(orders.length === 0) {
        resultArea.innerHTML = `
            <div class="orders-empty-loading" style="padding: 40px 16px; background:#FFF; border:1px dashed var(--card-border); border-radius:18px;">
                <span style="display:inline-flex; align-items:center; justify-content:center; color:#9CA3AF; margin-bottom:8px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 8 9 5 9-5"/><path d="M3 8v9l9 5 9-5V8"/><path d="M12 13v9"/></svg>
                </span>
                <h4 style="font-size:15px; color:var(--text-main); margin-bottom:4px;">কোনো অর্ডার নেই</h4>
                <p style="font-size:12px; color:var(--text-muted); margin-bottom:14px;">আমাদের খাঁটি সম্ভার থেকে পছন্দের পণ্য অর্ডার করুন।</p>
                <button type="button" class="btn-card-order" style="margin:0 auto; padding:8px 18px; display:inline-flex; align-items:center; gap:6px;" onclick="navigateToScreen('home')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l2 14H4L6 7Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>
                    <span>পণ্য দেখুন</span>
                </button>
            </div>
        `;
        return;
    }

    resultArea.innerHTML = orders.map(ord => {
        const orderNum = ord.orderNumber || 'RR-2026-00125';
        const dateStr = formatBengaliDateTime(ord.orderDate);
        const status = ord.status || 'Pending';

        let badgeHtml = '';
        let actionBtnHtml = '';

        if(status === 'Pending') {
            badgeHtml = `
                <span class="card-status-badge badge-pending">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                    <span>পেন্ডিং</span>
                </span>
            `;
            const waMsg = encodeURIComponent(`হ্যালো, আমি আমার অর্ডার #${orderNum} (${ord.productName})-এর তথ্য পরিবর্তন/বাতিল করতে চাই।`);
            const waLink = WHATSAPP_NUMBER ? `https://wa.me/${WHATSAPP_NUMBER}?text=${waMsg}` : '#';
            actionBtnHtml = `
                <a href="${waLink}" target="_blank" onclick="event.stopPropagation();" class="card-action-btn act-whatsapp" style="padding: 5px 10px; border-radius: 14px; gap: 5px;" title="WhatsApp এ যোগাযোগ করুন">
                    <span class="act-wa-ico-box" style="width: 18px; height: 18px; font-size: 10px;">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
                    </span>
                    <span style="font-size: 11px; font-weight: 700; color: #166534; line-height: 1;">সহায়তা</span>
                </a>
            `;
        } else if(status === 'Confirmed') {
            badgeHtml = `
                <span class="card-status-badge badge-confirmed">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></svg>
                    <span>কনফার্মড</span>
                </span>
            `;
            actionBtnHtml = `
                <button type="button" class="card-action-btn act-detail" onclick="event.stopPropagation(); showCustomerOrderDetail('${ord.id}')">
                    <span>অর্ডার বিস্তারিত</span>
                    <span class="act-arrow">›</span>
                </button>
            `;
        } else {
            badgeHtml = `
                <span class="card-status-badge badge-delivered">
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 17h4V5H2v12h3"/><path d="M14 9h5l3 4v4h-3"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/></svg>
                    <span>ডেলিভার্ড</span>
                </span>
            `;
            actionBtnHtml = `
                <button type="button" class="card-action-btn act-reorder" onclick="event.stopPropagation(); reorderThisItem('${ord.productName}', ${ord.unitPrice || 0}, '${ord.productImage || ''}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.5-2L20 12"/><path d="M4 12l2.9 5a7 7 0 0 0 11.5-2"/></svg>
                    <span>পুনরায় অর্ডার</span>
                    <span class="act-arrow">›</span>
                </button>
            `;
        }

        // একাধিক পণ্য থাকলে কয়টি পণ্য তা সুন্দরভাবে দেখানো
        const isCartCombo = ord.cartItems && ord.cartItems.length > 0;
        const qtyText = isCartCombo 
            ? `${ord.cartItems.length}টি পণ্য (কম্বো)` 
            : `${ord.quantity || 1} ${ord.unit || 'কেজি'}`;

        return `
            <!-- কার্ডের যেকোনো জায়গায় চাপ দিলেই বিস্তারিত খুলবে -->
            <div class="order-item-card-photo" onclick="showCustomerOrderDetail('${ord.id}')" style="cursor: pointer;" title="বিস্তারিত দেখতে ক্লিক করুন">
                <img class="o-thumb-img" src="${ord.productImage || 'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=150&q=80'}" alt="${ord.productName}">
                
                <div class="o-info-block">
                    <div class="o-id-row">
                        <span class="o-id-text">${orderNum}</span>
                        <button type="button" class="btn-copy-mini" onclick="event.stopPropagation(); copySpecificOrderId('${orderNum}')" title="কপি করুন">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                        </button>
                    </div>
                    <div class="o-date-row">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                        <span>${dateStr}</span>
                    </div>
                    <h4 class="o-product-title">${ord.productName}</h4>
                    <div class="o-qty-price-row">
                        <span style="color: var(--primary); font-weight: 700;">${qtyText}</span>
                        <span class="o-divider">|</span>
                        <span class="o-price-bold">৳ ${(ord.totalPrice || 0).toLocaleString('bn-BD')}</span>
                    </div>
                </div>

                <div class="o-status-actions-block">
                    ${badgeHtml}
                    ${actionBtnHtml}
                </div>
            </div>
        `;
    }).join('');
}

// শুধুমাত্র বর্তমান গ্রাহকের নিজস্ব অর্ডার নিরাপদভাবে ফিল্টার করে লোড করা
async function loadMyLiveOrders() {
    const resultArea = document.getElementById('trackResultArea');
    if(!resultArea) return;

    resultArea.innerHTML = `
        <div class="orders-empty-loading">
            <span style="display:inline-flex; align-items:center; justify-content:center; color:var(--primary); margin-bottom:6px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/></svg>
            </span>
            <p>আপনার অর্ডারের তথ্য লোড হচ্ছে...</p>
        </div>
    `;

    const loggedIn = JSON.parse(localStorage.getItem('loggedInCustomer') || 'null');
    const targetPhone = loggedIn?.phone || localStorage.getItem('lastCustomerPhone') || '';
    const targetOrderNum = localStorage.getItem('lastOrderNumber') || '';

    // যদি কোনো ফোন নম্বর বা অর্ডার কোড না থাকে, ফাঁকা তালিকা দেখাবে
    if(!targetPhone && !targetOrderNum) {
        updateOrderPillCounts(0, 0, 0, 0);
        renderMyOrdersView([]);
        return;
    }

    try {
        const ordersRef = collection(db, "orders");
        const fetchedDocsMap = new Map();

        // ১. শুধুমাত্র নির্দিষ্ট গ্রাহকের ফোন নম্বর দিয়ে ফায়ারবেস কুয়েরি
        if(targetPhone) {
            const qPhone = query(ordersRef, where("customerPhone", "==", targetPhone.trim()));
            const snapPhone = await getDocs(qPhone);
            snapPhone.forEach(d => fetchedDocsMap.set(d.id, { id: d.id, ...d.data() }));

            // ফরম্যাটিং ভিন্নতা (যেমন শুধু ডিজিট) থাকলে তারও সেফটি চেক
            const cleanDigits = targetPhone.replace(/[^0-9]/g, '');
            if(cleanDigits && cleanDigits !== targetPhone.trim()) {
                const qClean = query(ordersRef, where("customerPhone", "==", cleanDigits));
                const snapClean = await getDocs(qClean);
                snapClean.forEach(d => fetchedDocsMap.set(d.id, { id: d.id, ...d.data() }));
            }
        }

        // ২. নির্দিষ্ট অর্ডার নম্বর থাকলে শুধু সেই অর্ডারটি আনা
        if(targetOrderNum) {
            const qOrder = query(ordersRef, where("orderNumber", "==", targetOrderNum.trim()));
            const snapOrder = await getDocs(qOrder);
            snapOrder.forEach(d => fetchedDocsMap.set(d.id, { id: d.id, ...d.data() }));
        }

        myMasterOrdersList = Array.from(fetchedDocsMap.values());

        // তারিখ অনুযায়ী নতুনগুলো উপরে সাজানো
        myMasterOrdersList.sort((a, b) => {
            const timeA = a.orderDate?.seconds ? a.orderDate.seconds * 1000 : (new Date(a.orderDate || 0)).getTime();
            const timeB = b.orderDate?.seconds ? b.orderDate.seconds * 1000 : (new Date(b.orderDate || 0)).getTime();
            return timeB - timeA;
        });

        let cAll = 0, cPending = 0, cConfirmed = 0, cDelivered = 0;
        let liveTotalItems = 0;
        let liveTotalSpent = 0;

        myMasterOrdersList.forEach(ord => {
            cAll++;
            const status = ord.status || 'Pending';
            if(status === 'Pending') cPending++;
            if(status === 'Confirmed') cConfirmed++;
            if(status === 'Delivered') cDelivered++;

            if(status !== 'Cancelled') {
                liveTotalItems += Number(ord.quantity) || (ord.cartItems ? ord.cartItems.reduce((acc, ci) => acc + (Number(ci.quantity)||1), 0) : 1);
                liveTotalSpent += Number(ord.totalPrice) || 0;
            }
        });

        updateOrderPillCounts(cAll, cPending, cConfirmed, cDelivered);

        const livePoints = Math.floor(liveTotalSpent / 10);
        if(document.getElementById('uStatTotalItems')) document.getElementById('uStatTotalItems').innerText = liveTotalItems.toLocaleString('bn-BD');
        if(document.getElementById('uStatRewardPoints')) document.getElementById('uStatRewardPoints').innerText = livePoints.toLocaleString('bn-BD');
        if(document.getElementById('uStatTotalOrders')) document.getElementById('uStatTotalOrders').innerText = myMasterOrdersList.length.toLocaleString('bn-BD');
        
        if(currentMyOrderFilter === 'all') {
            renderMyOrdersView(myMasterOrdersList);
        } else {
            renderMyOrdersView(myMasterOrdersList.filter(o => o.status === currentMyOrderFilter));
        }

    } catch (err) {
        console.error("Live Orders Query Error:", err);
        resultArea.innerHTML = `<p style="text-align:center; color:#DC2626; padding:20px; font-size:13px;">অর্ডারের তথ্য লোড হতে সমস্যা হয়েছে। ইন্টারনেট কানেকশন চেক করুন।</p>`;
    }
}

function updateOrderPillCounts(all, pending, confirmed, delivered) {
    if(document.getElementById('ordCountAll')) document.getElementById('ordCountAll').innerText = all.toLocaleString('bn-BD');
    if(document.getElementById('ordCountPending')) document.getElementById('ordCountPending').innerText = pending.toLocaleString('bn-BD');
    if(document.getElementById('ordCountConfirmed')) document.getElementById('ordCountConfirmed').innerText = confirmed.toLocaleString('bn-BD');
    if(document.getElementById('ordCountDelivered')) document.getElementById('ordCountDelivered').innerText = delivered.toLocaleString('bn-BD');
}

window.filterMyOrders = function(status, btn) {
    document.querySelectorAll('.op-pill-btn').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    currentMyOrderFilter = status;

    if(status === 'all') {
        renderMyOrdersView(myMasterOrdersList);
    } else {
        const filtered = myMasterOrdersList.filter(o => o.status === status);
        renderMyOrdersView(filtered);
    }
};

window.copySpecificOrderId = function(id) {
    navigator.clipboard.writeText(id).then(() => {
        window.showAppToast("অর্ডার নম্বর কপি করা হয়েছে! 📋");
    }).catch(() => {
        window.showAppToast("অর্ডার কোড: " + id);
    });
};

window.showCustomerOrderDetail = function(orderDocId) {
    const ord = myMasterOrdersList.find(o => o.id === orderDocId);
    if(!ord) return;

    const modal = document.getElementById('orderDetailModal');
    const content = document.getElementById('orderDetailContent');
    if(!modal || !content) return;

    const defaultImg = 'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=150&q=80';
    const status = ord.status || 'Pending';

    // ১. ছবির হুবহু স্ট্যাটাস ব্যাজ
    let statusBadgeHtml = '';
    if (status === 'Confirmed') {
        statusBadgeHtml = `<span style="display:inline-flex; align-items:center; gap:5px; background:#DBEAFE; color:#1D4ED8; padding:5px 12px; border-radius:20px; font-size:12px; font-weight:800;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="9 12 12 15 17 9"/></svg> কনফার্মড</span>`;
    } else if (status === 'Delivered') {
        statusBadgeHtml = `<span style="display:inline-flex; align-items:center; gap:5px; background:#DCFCE7; color:#15803D; padding:5px 12px; border-radius:20px; font-size:12px; font-weight:800;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#15803D" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="9 12 12 15 17 9"/></svg> ডেলিভার্ড</span>`;
    } else {
        statusBadgeHtml = `<span style="display:inline-flex; align-items:center; gap:5px; background:#FDF3E3; color:#B45309; padding:5px 12px; border-radius:20px; font-size:12px; font-weight:800;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#B45309" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> পেন্ডিং</span>`;
    }

    // ২. লাইভ ৪-ধাপ ডেলিভারি টাইমলাইন হিসাব
    const isStep2Done = status === 'Confirmed' || status === 'Delivered';
    const isStep3Done = status === 'Delivered';
    const isStep4Done = status === 'Delivered';

    const orderTimeShort = ord.orderDate ? formatBengaliDateTime(ord.orderDate).split(',')[0] : 'অর্ডার গ্রহণ';

    // ৩. পণ্য তালিকা তৈরি (পরিষ্কার বাংলা সংখ্যা ও স্পষ্ট ফন্ট)
    let productsListHtml = '';
    if (ord.cartItems && ord.cartItems.length > 0) {
        productsListHtml = ord.cartItems.map(item => {
            // যদি ইউনিটে শুধু সংখ্যা দেওয়া থাকে তবে স্বয়ংক্রিয়ভাবে 'কেজি' বসিয়ে দেবে
            let unitText = (item.unit || '').trim();
            if (!unitText || /^\d+$/.test(unitText)) unitText = 'কেজি';

            const qtyBn = Number(item.quantity || 1).toLocaleString('bn-BD');
            const priceBn = Number(item.price || 0).toLocaleString('bn-BD');
            const totalBn = (Number(item.price || 0) * Number(item.quantity || 1)).toLocaleString('bn-BD');

            return `
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 0; border-bottom:1px dashed #EBF0EC;">
                    <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                        <img src="${item.image || defaultImg}" style="width:52px; height:52px; border-radius:12px; object-fit:cover; background:#F3F4F6; flex-shrink:0; border:1px solid #E5E7EB;">
                        <div style="min-width:0;">
                            <h5 style="font-size:14.5px; font-weight:800; color:#111827; margin-bottom:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</h5>
                            <p style="font-size:13px; font-weight:700; color:#334155; margin:0;">
                                <span style="color:#0F3826; font-weight:800;">${qtyBn} ${unitText}</span> &nbsp;×&nbsp; ৳ ${priceBn}
                            </p>
                        </div>
                    </div>
                    <span style="font-size:15px; font-weight:800; color:#0F3826; white-space:nowrap;">৳ ${totalBn}</span>
                </div>
            `;
        }).join('');
    } else {
        let unitText = (ord.unit || '').trim();
        if (!unitText || /^\d+$/.test(unitText)) unitText = 'কেজি';

        const qtyBn = Number(ord.quantity || 1).toLocaleString('bn-BD');
        const unitPrice = Number(ord.unitPrice) || (Number(ord.totalPrice) / (Number(ord.quantity) || 1)) || 0;
        const priceBn = unitPrice.toLocaleString('bn-BD');
        const totalBn = Number(ord.totalPrice || 0).toLocaleString('bn-BD');

        productsListHtml = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 0;">
                <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                    <img src="${ord.productImage || defaultImg}" style="width:52px; height:52px; border-radius:12px; object-fit:cover; background:#F3F4F6; flex-shrink:0; border:1px solid #E5E7EB;">
                    <div style="min-width:0;">
                        <h5 style="font-size:14.5px; font-weight:800; color:#111827; margin-bottom:3px;">${ord.productName}</h5>
                        <p style="font-size:13px; font-weight:700; color:#334155; margin:0;">
                            <span style="color:#0F3826; font-weight:800;">${qtyBn} ${unitText}</span> &nbsp;×&nbsp; ৳ ${priceBn}
                        </p>
                    </div>
                </div>
                <span style="font-size:15px; font-weight:800; color:#0F3826; white-space:nowrap;">৳ ${totalBn}</span>
            </div>
        `;
    }

    // মোবাইল ও হোয়াটসঅ্যাপ নম্বর ফরম্যাটিং
    const rawPhone = ord.customerPhone || '';
    const cleanDigits = rawPhone.replace(/[^0-9]/g, '');
    const cleanWaNum = cleanDigits.startsWith('880') ? cleanDigits : ('88' + (cleanDigits.startsWith('0') ? cleanDigits.slice(1) : cleanDigits));

    content.innerHTML = `
        <!-- কার্ড ১: অর্ডার নম্বর ও স্ট্যাটাস -->
        <div style="background:#F3F8F5; border:1.5px solid #DFEBE3; border-radius:18px; padding:14px 16px; margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
                <div>
                    <div style="font-size:11px; font-weight:600; color:#64748B; margin-bottom:2px;">অর্ডার নম্বর</div>
                    <div style="font-size:18px; font-weight:800; color:#0F3826; letter-spacing:-0.2px;">#${ord.orderNumber || ''}</div>
                </div>
                ${statusBadgeHtml}
            </div>
            <div style="display:flex; align-items:center; gap:6px; font-size:11.5px; color:#64748B; padding-top:2px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                <span>${formatBengaliDateTime(ord.orderDate)}</span>
            </div>
        </div>

        <!-- কার্ড ২: ৪-ধাপ ডেলিভারি টাইমলাইন ট্র্যাকার -->
        <div style="background:#FFFFFF; border:1.5px solid #EBF0EC; border-radius:18px; padding:14px 10px; margin-bottom:12px;">
            <div style="display:flex; align-items:center; justify-content:space-between; position:relative; text-align:center;">
                <!-- কানেক্টিং লাইনসমূহ -->
                <div style="position:absolute; top:15px; left:12%; right:12%; height:2px; background:#CBD5E1; z-index:1;"></div>
                <div style="position:absolute; top:15px; left:12%; width:${isStep4Done ? '76%' : isStep2Done ? '40%' : '15%'}; height:2px; background:#15803D; z-index:1; transition:width 0.4s ease;"></div>

                <!-- ধাপ ১ -->
                <div style="flex:1; z-index:2; display:flex; flex-direction:column; align-items:center;">
                    <div style="width:30px; height:30px; border-radius:50%; background:#15803D; color:#FFF; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 6px rgba(21,128,61,0.25);">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFF" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <span style="font-size:11px; font-weight:800; color:#111827; margin-top:5px;">অর্ডার গ্রহণ</span>
                    <small style="font-size:9.5px; color:#64748B;">${orderTimeShort}</small>
                </div>

                <!-- ধাপ ২ -->
                <div style="flex:1; z-index:2; display:flex; flex-direction:column; align-items:center;">
                    <div style="width:30px; height:30px; border-radius:50%; background:${isStep2Done ? '#15803D' : '#15803D'}; color:#FFF; display:flex; align-items:center; justify-content:center;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFF" stroke-width="2.2"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 8 9 5 9-5"/><path d="M3 8v9l9 5 9-5V8"/><path d="M12 13v9"/></svg>
                    </div>
                    <span style="font-size:11px; font-weight:800; color:#111827; margin-top:5px;">প্রসেসিং</span>
                    <small style="font-size:9.5px; color:#64748B;">${isStep2Done ? 'সম্পন্ন' : 'অপেক্ষমাণ'}</small>
                </div>

                <!-- ধাপ ৩ -->
                <div style="flex:1; z-index:2; display:flex; flex-direction:column; align-items:center;">
                    <div style="width:30px; height:30px; border-radius:50%; background:${isStep3Done ? '#15803D' : '#94A3B8'}; color:#FFF; display:flex; align-items:center; justify-content:center;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFF" stroke-width="2.2"><path d="M10 17h4V5H2v12h3"/><path d="M14 9h5l3 4v4h-3"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/></svg>
                    </div>
                    <span style="font-size:11px; font-weight:800; color:#111827; margin-top:5px;">ডেলিভারি</span>
                    <small style="font-size:9.5px; color:#64748B;">${isStep3Done ? 'সম্পন্ন' : 'অপেক্ষমাণ'}</small>
                </div>

                <!-- ধাপ ৪ -->
                <div style="flex:1; z-index:2; display:flex; flex-direction:column; align-items:center;">
                    <div style="width:30px; height:30px; border-radius:50%; background:${isStep4Done ? '#15803D' : '#94A3B8'}; color:#FFF; display:flex; align-items:center; justify-content:center;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFF" stroke-width="2.8"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <span style="font-size:11px; font-weight:800; color:#111827; margin-top:5px;">সম্পন্ন</span>
                    <small style="font-size:9.5px; color:#64748B;">${isStep4Done ? 'ডেলিভার্ড' : 'অপেক্ষমাণ'}</small>
                </div>
            </div>
        </div>

        <!-- কার্ড ৩: অর্ডারকৃত পণ্যসমূহ -->
        <div style="background:#FFFFFF; border:1.5px solid #EBF0EC; border-radius:18px; padding:14px; margin-bottom:12px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; font-size:14.5px; font-weight:800; color:#0F3826;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F3826" stroke-width="2.2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                <span>অর্ডারকৃত পণ্যসমূহ:</span>
            </div>
            
            ${productsListHtml}

            <!-- সর্বমোট প্রদেয় বিল -->
            <div style="background:#F3F8F5; border-radius:12px; padding:12px 14px; margin-top:12px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:14.5px; font-weight:800; color:#0F3826;">সর্বমোট প্রদেয় বিল:</span>
                <span style="font-size:17px; font-weight:800; color:#E63946;">৳ ${(Number(ord.totalPrice) || 0).toLocaleString('bn-BD')}</span>
            </div>
        </div>

        <!-- কার্ড ৪: কাস্টমার তথ্য ও কল/WhatsApp বাটন -->
        <div style="background:#F9FBFA; border:1.5px solid #EBF0EC; border-radius:18px; padding:14px 16px;">
            <!-- কাস্টমার নাম -->
            <div style="display:flex; align-items:center; justify-content:space-between; padding-bottom:10px; border-bottom:1px solid #EEF2F0;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <div style="width:26px; height:26px; border-radius:50%; background:#E8F3ED; display:flex; align-items:center; justify-content:center; color:#15803D;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </div>
                    <span style="font-size:12px; color:#64748B; font-weight:600;">কাস্টমার:</span>
                </div>
                <span style="font-size:13px; font-weight:700; color:#111827;">${ord.customerName || 'তথ্য নেই'}</span>
            </div>

<!-- মোবাইল নম্বর (আইকন দুটি সম্পূর্ণ মুছে পরিচ্ছন্ন করা হয়েছে) -->
            <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid #EEF2F0;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <div style="width:26px; height:26px; border-radius:50%; background:#E8F3ED; display:flex; align-items:center; justify-content:center; color:#15803D;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.2-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.8 2.1Z"/></svg>
                    </div>
                    <span style="font-size:12px; color:#64748B; font-weight:600;">মোবাইল:</span>
                </div>
                <span style="font-size:13px; font-weight:700; color:#111827;">${rawPhone || 'তথ্য নেই'}</span>
            </div>

            <!-- ঠিকানা -->
            <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid #EEF2F0;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <div style="width:26px; height:26px; border-radius:50%; background:#E8F3ED; display:flex; align-items:center; justify-content:center; color:#15803D;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    </div>
                    <span style="font-size:12px; color:#64748B; font-weight:600;">ঠিকানা:</span>
                </div>
                <span style="font-size:13px; font-weight:700; color:#111827; text-align:right; max-width:60%;">${ord.deliveryAddress || 'তথ্য নেই'}</span>
            </div>

            <!-- পেমেন্ট পদ্ধতি -->
            <div style="display:flex; align-items:center; justify-content:space-between; padding-top:10px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <div style="width:26px; height:26px; border-radius:50%; background:#E8F3ED; display:flex; align-items:center; justify-content:center; color:#15803D;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/></svg>
                    </div>
                    <span style="font-size:12px; color:#64748B; font-weight:600;">পেমেন্ট পদ্ধতি:</span>
                </div>
                <span style="font-size:12px; font-weight:700; color:#111827;">ক্যাশ অন ডেলিভারি (পণ্য হাতে পেয়ে পরিশোধ)</span>
            </div>
        </div>
    `;

    modal.classList.add('active');
    modal.style.display = 'flex';
};

// নিশ্চিতভাবে অর্ডার ডিটেইলস মডাল বন্ধ করার ফাংশন
window.closeOrderDetailModal = function() {
    const modal = document.getElementById('orderDetailModal');
    if(modal) {
        modal.classList.remove('active');
        modal.style.display = 'none'; // মডালটি সাথে সাথে বন্ধ হবে
    }
};

window.reorderThisItem = function(name, price, img) {
    window.triggerOrderModal(name, price, img);
};

// পছন্দের পণ্য (Favorites) লজিক
function renderFavoritesScreen() {
    const container = document.getElementById('favoritesGridContainer');
    const subtitle = document.getElementById('favSubtitleCount');
    if (!container) return;

    const favs = JSON.parse(localStorage.getItem('userFavorites') || '[]');
    if (subtitle) {
        subtitle.innerText = `আপনার পছন্দের তালিকায় ${favs.length.toLocaleString('bn-BD')}টি পণ্য রয়েছে`;
    }

    if (favs.length === 0) {
        container.innerHTML = `
            <div class="fav-empty-box" style="grid-column: 1 / -1; text-align:center; padding:50px 20px; background:#FFF; border:1px dashed #E5E7EB; border-radius:20px; margin:20px auto; max-width:420px;">
                <div class="fav-empty-icon" style="font-size:40px; color:#DC2626; margin-bottom:10px;">♡</div>
                <h4 style="font-size:16px; font-weight:800; color:var(--text-main); margin-bottom:6px;">পছন্দ তালিকায় কোনো পণ্য নেই</h4>
                <p style="font-size:12.5px; color:var(--text-muted); margin-bottom:18px;">পণ্যগুলোর ওপরের হার্ট আইকনে চাপ দিয়ে আপনার পছন্দের তালিকা তৈরি করুন।</p>
                <button type="button" class="btn-card-order-full" style="max-width:200px; margin:0 auto;" onclick="navigateToScreen('home')">🛍️ পণ্যসমূহ দেখুন</button>
            </div>
        `;
        return;
    }

    const favProducts = allProducts.filter(p => favs.includes(p.name));
    container.innerHTML = favProducts.map(prod => {
        const inStock = prod.inStock !== false;
        return `
            <div class="prod-card-v2" onclick="window.openProductDetailModal('${prod.name.replace(/'/g, "\\'")}')" style="cursor: pointer;">
                <div class="prod-img-box">
                    <img src="${prod.image}" alt="${prod.name}" loading="lazy">
                    
                    <button type="button" class="btn-fav-heart active" onclick="event.stopPropagation(); window.toggleWishlist(this, '${prod.name.replace(/'/g, "\\'")}')" title="পছন্দ তালিকা থেকে মুছুন">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="#DC2626" stroke="#DC2626" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                        </svg>
                    </button>
                </div>

                <div class="prod-card-content">
                    <h4 class="prod-card-title">${prod.name}</h4>

                    <div class="prod-price-block" style="display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;">
                        <span class="price-val" style="color: #E63946; font-size: 17px;">৳ ${Number(prod.price).toLocaleString('bn-BD')}</span>
                        ${prod.regularPrice && Number(prod.regularPrice) > Number(prod.price) 
                            ? `<span class="price-old-val">৳ ${Number(prod.regularPrice).toLocaleString('bn-BD')}</span>
                               <span class="save-badge-pill">Save ৳${(Number(prod.regularPrice) - Number(prod.price)).toLocaleString('bn-BD')}</span>` 
                            : `<span class="price-unit" style="font-size: 12px; color: #6B7280;">/${prod.unit || 'কেজি'}</span>`
                        }
                    </div>

                    ${inStock 
                        ? `<div style="display: flex; gap: 6px; margin-top: auto;">
                             <button class="btn-card-order-full" onclick="event.stopPropagation(); window.triggerOrderModal('${prod.name.replace(/'/g, "\\'")}', ${prod.price}, '${prod.image}')" style="flex: 1; padding: 8px 4px; font-size: 11.5px;" title="অর্ডার করুন">
                               <span>অর্ডার</span>
                             </button>
                             <button onclick="event.stopPropagation(); window.addToCart('${prod.name.replace(/'/g, "\\'")}', ${prod.price}, '${prod.image}', '${prod.unit || 'কেজি'}')" style="background: #E8F3ED; color: var(--primary); border: 1px solid #C2DED1; border-radius: 20px; padding: 8px 10px; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="কার্টে যোগ করুন">
                               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/><line x1="12" x2="12" y1="11" y2="17"/><line x1="9" x2="15" y1="14" y2="14"/></svg>
                             </button>
                           </div>`
                        : `<button class="btn-card-order-full disabled" disabled>স্টক শেষ</button>`
                    }
                </div>
            </div>
        `;
    }).join('');
}

window.toggleWishlist = function(btn, prodName) {
    let favs = JSON.parse(localStorage.getItem('userFavorites') || '[]');
    const idx = favs.indexOf(prodName);

    if(idx > -1) {
        favs.splice(idx, 1);
        btn.classList.remove('active');
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;
        window.showAppToast("পছন্দের তালিকা থেকে সরানো হয়েছে");
    } else {
        favs.push(prodName);
        btn.classList.add('active');
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="#DC2626" stroke="#DC2626" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;
        window.showAppToast("পছন্দের তালিকায় যুক্ত হয়েছে! ❤️");
    }
    localStorage.setItem('userFavorites', JSON.stringify(favs));

    const favCountElem = document.getElementById('uStatFavCount');
    if(favCountElem) favCountElem.innerText = favs.length.toLocaleString('bn-BD');

    const favsView = document.getElementById('favoritesPageView');
    if (favsView && favsView.style.display === 'block') {
        renderFavoritesScreen();
    }
};

function initProfileScreen() {
    const user = JSON.parse(localStorage.getItem('loggedInCustomer') || 'null');
    const authArea = document.getElementById('authScreenArea');
    const dashArea = document.getElementById('profileDashboardArea');

    if (user && user.name) {
        if (authArea) authArea.style.display = 'none';
        if (dashArea) dashArea.style.display = 'block';

        if(document.getElementById('uProfileName')) document.getElementById('uProfileName').innerText = user.name;
        if(document.getElementById('uProfilePhone')) document.getElementById('uProfilePhone').innerText = `📞 ${user.phone || ''}`;
        if(document.getElementById('uProfileAddress')) document.getElementById('uProfileAddress').innerText = `📍 ${user.address || 'বাংলাদেশ'}`;

        const favs = JSON.parse(localStorage.getItem('userFavorites') || '[]');
        if(document.getElementById('uStatFavCount')) document.getElementById('uStatFavCount').innerText = favs.length.toLocaleString('bn-BD');
        if(document.getElementById('uStatTotalOrders')) document.getElementById('uStatTotalOrders').innerText = (myMasterOrdersList.length || 0).toLocaleString('bn-BD');

        let totalItemsCount = 0;
        let totalSpentAmount = 0;

        myMasterOrdersList.forEach(ord => {
            if (ord.status !== 'Cancelled') {
                totalItemsCount += Number(ord.quantity) || 1;
                totalSpentAmount += Number(ord.totalPrice) || 0;
            }
        });

        const rewardPoints = Math.floor(totalSpentAmount / 10);

        if(document.getElementById('uStatTotalItems')) document.getElementById('uStatTotalItems').innerText = totalItemsCount.toLocaleString('bn-BD');
        if(document.getElementById('uStatRewardPoints')) document.getElementById('uStatRewardPoints').innerText = rewardPoints.toLocaleString('bn-BD');

        if(myMasterOrdersList.length === 0) loadMyLiveOrders();
    } else {
        if (authArea) authArea.style.display = 'block';
        if (dashArea) dashArea.style.display = 'none';
        if (typeof window.toggleAuthScreens === 'function') window.toggleAuthScreens('login');
    }
}

window.toggleAuthScreens = function(type) {
    const loginV = document.getElementById('authLoginView');
    const regV = document.getElementById('authRegisterView');
    if(type === 'register') {
        if(loginV) loginV.style.display = 'none';
        if(regV) regV.style.display = 'block';
    } else {
        if(loginV) loginV.style.display = 'block';
        if(regV) regV.style.display = 'none';
    }
};

window.togglePassVisibility = function(fieldId, iconElem) {
    const inp = document.getElementById(fieldId);
    if(inp) {
        inp.type = inp.type === 'password' ? 'text' : 'password';
    }
};

window.showAppToast = function(msg, type = 'success') {
    const toast = document.getElementById('toastNotification');
    if(!toast) return;
    toast.className = `custom-toast-box active ${type === 'error' ? 'error' : ''}`;
    toast.innerHTML = `<span>${msg}</span>`;
    
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => {
        toast.classList.remove('active');
    }, 3500);
};

window.handleUpdatePassword = async function(e) {
    e.preventDefault();
    const currentPass = document.getElementById('currCustPass')?.value?.trim();
    const newPass = document.getElementById('newCustPass')?.value?.trim();
    const confirmPass = document.getElementById('confirmCustPass')?.value?.trim();

    const userObj = JSON.parse(localStorage.getItem('loggedInCustomer') || '{}');
    if(!userObj.email) {
        window.showAppToast("লগইন সেশন পাওয়া যায়নি! দয়া করে আবার লগইন করুন।", "error");
        return;
    }

    if(!currentPass || newPass.length < 6 || newPass !== confirmPass) {
        window.showAppToast("সঠিক তথ্য প্রদান করুন (নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষর এবং উভয় ঘরে মিল থাকতে হবে)।", "error");
        return;
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, userObj.email, currentPass);
        await updatePassword(userCredential.user, newPass);
        
        // মডাল বন্ধ করা এবং ইনপুট ফিল্ডগুলো পরিষ্কার করা
        if(typeof window.closePasswordModal === 'function') window.closePasswordModal();
        document.getElementById('changePasswordForm')?.reset();
        
        window.showAppToast("পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে! ✅");
    } catch(err) {
        window.showAppToast("পাসওয়ার্ড পরিবর্তন ব্যর্থ: " + (err.message.includes('auth/wrong-password') ? 'বর্তমান পাসওয়ার্ড ভুল হয়েছে!' : err.message), "error");
    }
};

window.sendResetEmailLink = async function() {
    const user = JSON.parse(localStorage.getItem('loggedInCustomer') || '{}');
    if(!user.email) return window.showAppToast("ইমেইল পাওয়া যায়নি।", "error");

    try {
        await sendPasswordResetEmail(auth, user.email);
        closePasswordModal();
        window.showAppToast(`আপনার ইমেইলে রিসেট লিংক পাঠানো হয়েছে!`);
    } catch(err) {
        window.showAppToast("ইমেইল পাঠানো যায়নি: " + err.message, "error");
    }
};

window.openContactWhatsApp = function() {
    if(WHATSAPP_NUMBER) window.open(`https://wa.me/${WHATSAPP_NUMBER}`, '_blank');
    else window.showAppToast("হেল্পলাইন নম্বর পাওয়া যায়নি।", "error");
};

window.handleBottomNav = function(action, btnElem) {
    if(action === 'home') window.navigateToScreen('home');
    else if(action === 'orders') window.navigateToScreen('orders');
    else if(action === 'cart') window.navigateToScreen('cart'); // সরাসরি আপনার ডিজাইন করা কার্ট পেজে যাবে
    else if(action === 'contact') window.navigateToScreen('profile');
};

// সরাসরি পূর্ণাঙ্গ কার্ট পেজে যাওয়ার টগল
window.toggleCartDrawer = function() {
    window.navigateToScreen('cart');
};

// কার্টে পণ্য যোগ করা (সাথে সাথে স্ক্রিন রিফ্রেশ নিশ্চিতকরণ)
window.addToCart = function(idOrName, price, image, unit) {
    const prod = allProducts.find(p => p.id === idOrName || p.name === idOrName);
    const prodName = prod ? prod.name : idOrName;
    const prodPrice = prod ? Number(prod.price) : (Number(price) || 0);
    const prodImg = prod ? prod.image : (image || '');
    const prodUnit = prod ? (prod.unit || 'কেজি') : (unit || 'কেজি');

    let cart = JSON.parse(localStorage.getItem('userCart') || '[]');
    const existing = cart.find(item => item.name === prodName);

    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ name: prodName, price: prodPrice, image: prodImg, unit: prodUnit, quantity: 1 });
    }

    localStorage.setItem('userCart', JSON.stringify(cart));
    updateCartBadgeCount();
    renderCartItems(); // কার্ট পেজ খোলা থাকলে তৎক্ষণাৎ পণ্যগুলো ফুটে উঠবে
    window.showAppToast(`${prodName} কার্টে যোগ করা হয়েছে! 🛒`);
};

// মোবাইল বটম ন্যাভের কার্ট কাউন্ট আপডেট করা (হালকা ও অপ্টিমাইজড)
function updateCartBadgeCount() {
    let cart = JSON.parse(localStorage.getItem('userCart') || '[]');
    
    // কার্টে মোট কতটি পণ্য বা পরিমাণ আছে তা হিসাব করা
    const totalItems = cart.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
    const displayCount = totalItems.toLocaleString('bn-BD');

    // মোবাইলের বটম ন্যাভ কার্ট ব্যাজ আপডেট
    const mobileBadge = document.getElementById('mobileCartBadgeCount');
    if (mobileBadge) {
        mobileBadge.innerText = displayCount;
        mobileBadge.style.display = totalItems > 0 ? 'flex' : 'none';
    }
}

// সাইট ওপেন হওয়ার সাথে সাথেই কার্ট কাউন্ট লোড হবে
updateCartBadgeCount();

// ছবির হুবহু প্রিমিয়াম কার্ট রেন্ডার
function renderCartItems() {
    const container = document.getElementById('cartItemsContainer');
    const totalElem = document.getElementById('cartTotalPrice');
    const totalItemsCountElem = document.getElementById('cartTotalItemsCount');
    const summaryCard = document.getElementById('cartSummaryCard');
    const subHeaderRow = document.getElementById('cartSubHeaderRow');
    const headerCountElem = document.getElementById('cartPageHeaderCount');
    if (!container) return;

    let cart = JSON.parse(localStorage.getItem('userCart') || '[]');
    updateCartBadgeCount();

    if (cart.length === 0) {
        if (subHeaderRow) subHeaderRow.style.display = 'none';
        if (summaryCard) summaryCard.style.display = 'none';

        // আসল পণ্য সম্ভার থেকে পণ্য নেওয়া (ফায়ারবেস লোড না হলেও ডিফল্ট পণ্য নিশ্চিত দেখাবে)
        const showcaseProducts = (typeof allProducts !== 'undefined' && allProducts.length > 0) 
            ? allProducts.slice(0, 6) 
            : DEFAULT_PRODUCTS.slice(0, 6);

        container.innerHTML = `
            <!-- স্লিম ও কমপ্যাক্ট খালি কার্ট কার্ড -->
            <div style="background: #FFFFFF; border: 1px solid var(--card-border); border-radius: 20px; padding: 20px 16px 18px; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.02); margin-bottom: 16px;">
                <!-- খাঁটি শপিং কার্ট আইকন -->
                <div style="width: 70px; height: 70px; border-radius: 50%; background: #EDF6EE; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 10px; color: var(--primary);">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="8" cy="21" r="1"/>
                        <circle cx="19" cy="21" r="1"/>
                        <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>
                    </svg>
                </div>

                <!-- কমপ্যাক্ট শিরোনাম ও সাবটেক্সট -->
                <h3 style="font-size: 17px; font-weight: 800; color: #0F3826; margin-bottom: 3px; line-height: 1.2;">আপনার কার্ট খালি রয়েছে</h3>
                <p style="font-size: 12px; color: #64748B; margin-bottom: 14px; line-height: 1.4;">খাঁটি ঐতিহ্যবাহী সম্ভার থেকে পছন্দের পণ্য যুক্ত করুন</p>

                <!-- পণ্যসমূহ দেখুন বাটন -->
                <button type="button" onclick="navigateToScreen('home')" style="background: #0E3E28; color: #FFF; border: none; padding: 9px 20px; border-radius: 20px; font-size: 13px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 3px 10px rgba(14,62,40,0.2);">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFF" stroke-width="2.2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                    <span>পণ্যসমূহ দেখুন</span>
                    <span>→</span>
                </button>
            </div>

            <!-- আমাদের পণ্য সম্ভার হেডার (আইকন ছাড়া পরিচ্ছন্ন) -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding: 0 2px;">
                <h3 style="font-size: 15px; font-weight: 800; color: #0F3826; margin: 0;">আমাদের পণ্য সম্ভার</h3>
                <a href="javascript:void(0)" onclick="navigateToScreen('home')" style="font-size: 12px; font-weight: 700; color: #0F3826; text-decoration: none; display: flex; align-items: center; gap: 3px;">
                    <span>সব দেখুন</span>
                    <span>→</span>
                </a>
            </div>

            <!-- হোমপেজের হুবহু স্টাইলের পাশাপাশি স্ক্রলযোগ্য পণ্য কার্ড গ্রিড -->
            <div style="display: flex; gap: 10px; overflow-x: auto; padding-bottom: 8px; scrollbar-width: none; -webkit-overflow-scrolling: touch;">
                ${showcaseProducts.map(prod => `
                    <div class="prod-card-v2" onclick="openProductDetailModal('${prod.id || prod.name}')" style="min-width: 152px; max-width: 152px; flex-shrink: 0; cursor: pointer;">
                        <!-- ইমেজ বক্স -->
                        <div class="prod-img-box" style="aspect-ratio: 1.05 / 1;">
                            <img src="${prod.image || 'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=300&q=80'}" alt="${prod.name}" loading="lazy">
                        </div>

                        <!-- কমপ্যাক্ট কন্টেন্ট বক্স -->
                        <div class="prod-card-content" style="padding: 8px 8px 10px;">
                            <h4 class="prod-card-title" style="font-size: 13.5px;">${prod.name}</h4>

                            <!-- মূল্য ও কাটা মূল্য -->
                            <div class="prod-price-block" style="display: flex; align-items: baseline; gap: 5px; margin-bottom: 6px;">
                                <span class="price-val" style="color: #E63946; font-size: 15px; font-weight: 800; line-height: 1;">৳ ${Number(prod.price).toLocaleString('bn-BD')}</span>
                                ${prod.regularPrice && Number(prod.regularPrice) > Number(prod.price) 
                                    ? `<span class="price-old-val" style="font-size: 11.5px; color: #9CA3AF; text-decoration: line-through; line-height: 1;">৳ ${Number(prod.regularPrice).toLocaleString('bn-BD')}</span>` 
                                    : `<span class="price-unit" style="font-size: 10.5px; color: #6B7280; line-height: 1;">/${prod.unit || 'কেজি'}</span>`
                                }
                            </div>

                            <!-- পাশাপাশি অর্ডার ও ক্লিন কার্ট বাটন -->
                            <div style="display: flex; gap: 5px; margin-top: auto; align-items: center;">
                                <button type="button" class="btn-card-order-full" onclick="event.stopPropagation(); triggerOrderModal('${prod.id || prod.name}')" style="flex: 1; padding: 6px 3px; font-size: 11.5px; border-radius: 16px; cursor: pointer;" title="সরাসরি অর্ডার">
                                    <span>অর্ডার</span>
                                </button>
                                <button type="button" onclick="event.stopPropagation(); addToCart('${prod.id || prod.name}')" style="background: #E8F3ED; color: var(--primary); border: 1px solid #C2DED1; border-radius: 16px; padding: 5px; cursor: pointer; display: flex; align-items: center; justify-content: center; height: 28px; width: 30px; flex-shrink: 0;" title="কার্টে যোগ করুন">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        return;
    }

    if (subHeaderRow) subHeaderRow.style.display = 'flex';
    if (summaryCard) summaryCard.style.display = 'block';

    let grandTotal = 0;
    let totalItems = 0;

    container.innerHTML = cart.map((item, index) => {
        const itemTotal = item.price * item.quantity;
        grandTotal += itemTotal;
        totalItems += item.quantity;

        const defaultUnit = item.unit || 'কেজি';

        return `
            <div style="display: flex; align-items: center; gap: 10px; background: #FFFFFF; border: 1px solid #EBF0EC; border-radius: 14px; padding: 8px 10px; margin-bottom: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.02); position: relative;">
                <!-- স্লিম পণ্যের ছবি -->
                <img src="${item.image || 'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=150&q=80'}" style="width: 50px; height: 50px; border-radius: 10px; object-fit: cover; background: #F4F6F4; flex-shrink: 0; border: 1px solid #E5E7EB;">
                
                <!-- পণ্যের বিবরণ ও স্লিম স্টেপার -->
                <div style="flex: 1; min-width: 0; padding-right: 2px;">
                    <h4 style="font-size: 13.5px; font-weight: 800; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px;">${item.name}</h4>
                    <p style="font-size: 11.5px; color: #0F3826; font-weight: 700; margin-bottom: 4px;">৳ ${Number(item.price).toLocaleString('bn-BD')} <small style="color: #64748B;">/${formatUnitBn(defaultUnit)}</small></p>
                    
                    <!-- স্লিম ক্যাপসুল স্টেপার -->
                    <div style="display: inline-flex; align-items: center; border-radius: 14px; background: #EEF4F0; padding: 1px 6px; gap: 6px;">
                        <button onclick="changeCartItemQty(${index}, -1)" style="border: none; background: transparent; color: #334155; font-size: 14px; font-weight: 800; cursor: pointer; padding: 0 3px; line-height: 1;">−</button>
                        <span style="font-size: 11.5px; font-weight: 800; color: #111827;">${item.quantity.toLocaleString('bn-BD')}</span>
                        <button onclick="changeCartItemQty(${index}, 1)" style="border: none; background: transparent; color: #0F3826; font-size: 14px; font-weight: 800; cursor: pointer; padding: 0 3px; line-height: 1;">+</button>
                    </div>
                </div>

                <!-- ডানপাশে ট্র্যাশ বাটন ও মোট আইটেম মূল্য -->
                <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between; height: 48px;">
                    <button onclick="removeCartItem(${index})" style="background: none; border: none; color: #EF4444; cursor: pointer; padding: 0;" title="কার্ট থেকে মুছুন">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                    </button>
                    <span style="font-size: 14px; font-weight: 800; color: #0F3826;">৳ ${itemTotal.toLocaleString('bn-BD')}</span>
                </div>
            </div>
        `;
    }).join('');

    // সামারি কার্ডের সংখ্যা ও মোট টাকা আপডেট (ডেলিভারি চার্জ সহ)
    if (headerCountElem) headerCountElem.innerText = `${totalItems.toLocaleString('bn-BD')} টি পণ্য`;
    if (totalItemsCountElem) totalItemsCountElem.innerText = `${totalItems.toLocaleString('bn-BD')} টি`;

    const cartDelBadge = document.getElementById('cartPageDeliveryBadge');
    if (cartDelBadge) {
        if (DELIVERY_FEE === 0) {
            cartDelBadge.innerText = 'ফ্রি ডেলিভারি';
            cartDelBadge.style.background = '#E8F5EE';
            cartDelBadge.style.color = '#15803D';
        } else {
            cartDelBadge.innerText = `৳ ${DELIVERY_FEE.toLocaleString('bn-BD')}`;
            cartDelBadge.style.background = '#F3F4F6';
            cartDelBadge.style.color = '#111827';
        }
    }

    const finalGrandTotal = grandTotal + DELIVERY_FEE;
    if (totalElem) totalElem.innerText = `৳ ${finalGrandTotal.toLocaleString('bn-BD')}`;
}

// হেডারের গোল কার্ট বাটনে চাপ দিলে সরাসরি কার্ট পেজে নিয়ে যাবে
window.toggleCartDrawer = function() {
    window.navigateToScreen('cart');
};

window.changeCartItemQty = function(index, delta) {
    let cart = JSON.parse(localStorage.getItem('userCart') || '[]');
    if (cart[index]) {
        cart[index].quantity += delta;
        if (cart[index].quantity <= 0) cart.splice(index, 1);
        localStorage.setItem('userCart', JSON.stringify(cart));
        renderCartItems();
    }
};

window.removeCartItem = function(index) {
    let cart = JSON.parse(localStorage.getItem('userCart') || '[]');
    cart.splice(index, 1);
    localStorage.setItem('userCart', JSON.stringify(cart));
    renderCartItems();
};

// ছবির হুবহু কার্ট চেকআউট মডাল ওপেন
window.openCartCheckoutModal = function() {
    let cart = JSON.parse(localStorage.getItem('userCart') || '[]');
    if (cart.length === 0) return;

    const orderModal = document.getElementById('orderModal');
    if (!orderModal) return;

    currentProduct = "সম্মিলিত অর্ডার (" + cart.length + "টি পণ্য)";
    currentPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    currentProductImage = cart[0].image || 'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=150&q=80';

    if(document.getElementById('mProdName')) document.getElementById('mProdName').innerText = "সম্মিলিত অর্ডার (" + cart.length.toLocaleString('bn-BD') + "টি পণ্য)";
    if(document.getElementById('mProdRate')) document.getElementById('mProdRate').innerText = `মোট বিল: ৳ ${currentPrice.toLocaleString('bn-BD')}`;
    
    const mImg = document.getElementById('mProdImg');
    if(mImg) mImg.src = currentProductImage;

    // সিঙ্গেল কোয়ান্টিটি বক্স লুকিয়ে ফেলা
    const qtyBox = document.querySelector('.m-qty-select-box');
    if(qtyBox) qtyBox.style.display = 'none';

    // কার্ট পণ্যের তালিকা কার্ড রেন্ডার করা
    let cartPreview = document.getElementById('cartItemsPreviewBox');
    if(!cartPreview) {
        cartPreview = document.createElement('div');
        cartPreview.id = 'cartItemsPreviewBox';
        if(qtyBox && qtyBox.parentNode) {
            qtyBox.parentNode.insertBefore(cartPreview, qtyBox.nextSibling);
        }
    }
    
    cartPreview.style.display = 'block';
    cartPreview.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; font-size: 14.5px; font-weight: 800; color: #0F3826; margin-bottom: 12px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F3826" stroke-width="2.2"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
            <span>কার্টে থাকা পণ্যসমূহ (${cart.length.toLocaleString('bn-BD')}টি):</span>
        </div>

        ${cart.map((i, idx) => `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 0; ${idx !== cart.length - 1 ? 'border-bottom: 1px dashed #E5EBE7;' : ''}">
                <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
                    <img src="${i.image || 'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=150&q=80'}" style="width: 52px; height: 52px; border-radius: 12px; object-fit: cover; background: #F3F4F6; flex-shrink: 0; border: 1px solid #E5E7EB;">
                    <div style="min-width: 0;">
                        <h5 style="font-size: 14px; font-weight: 800; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px;">${i.name}</h5>
                        <p style="font-size: 11.5px; color: #64748B;">${i.quantity.toLocaleString('bn-BD')} × ৳ ${Number(i.price).toLocaleString('bn-BD')} (${formatUnitBn(i.unit)})</p>
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 12px; flex-shrink: 0;">
                    <!-- ক্যাপসুল স্টেপার -->
                    <div style="display: inline-flex; align-items: center; border-radius: 20px; background: #EEF4F0; padding: 2px 6px; gap: 8px;">
                        <button type="button" onclick="changeCartModalQty(${idx}, -1)" style="border: none; background: transparent; color: #334155; font-size: 15px; font-weight: 800; cursor: pointer; padding: 2px 4px; line-height: 1;">−</button>
                        <span style="font-size: 12px; font-weight: 800; color: #111827;">${i.quantity.toLocaleString('bn-BD')}</span>
                        <button type="button" onclick="changeCartModalQty(${idx}, 1)" style="border: none; background: transparent; color: #0F3826; font-size: 15px; font-weight: 800; cursor: pointer; padding: 2px 4px; line-height: 1;">+</button>
                    </div>

                    <!-- ট্র্যাশ বাটন ও মোট দর -->
                    <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between; height: 50px;">
                        <button type="button" onclick="removeCartModalItem(${idx})" style="background: none; border: none; color: #EF4444; cursor: pointer; padding: 0;" title="মুছে ফেলুন">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                        <span style="font-size: 14.5px; font-weight: 800; color: #0F3826;">৳ ${(i.price * i.quantity).toLocaleString('bn-BD')}</span>
                    </div>
                </div>
            </div>
        `).join('')}
    `;

    // সামারি কার্ড আপডেট (ডেলিভারি চার্জ সহ)
    const cartItemsSubtotal = currentPrice;
    const cartOrderFinalTotal = cartItemsSubtotal + DELIVERY_FEE;

    if(document.getElementById('sumProdQtyLabel')) document.getElementById('sumProdQtyLabel').innerText = `মোট ${cart.length.toLocaleString('bn-BD')} আইটেম`;
    if(document.getElementById('sumProdPrice')) document.getElementById('sumProdPrice').innerText = `৳ ${cartItemsSubtotal.toLocaleString('bn-BD')}`;
    
    const checkoutDelBadge = document.getElementById('checkoutDeliveryBadge');
    if (checkoutDelBadge) {
        if (DELIVERY_FEE === 0) {
            checkoutDelBadge.innerText = 'ফ্রি ডেলিভারি';
            checkoutDelBadge.style.background = '#E8F5EE';
            checkoutDelBadge.style.color = '#15803D';
        } else {
            checkoutDelBadge.innerText = `৳ ${DELIVERY_FEE.toLocaleString('bn-BD')}`;
            checkoutDelBadge.style.background = '#F3F4F6';
            checkoutDelBadge.style.color = '#111827';
        }
    }

    if(document.getElementById('sumTotalPrice')) document.getElementById('sumTotalPrice').innerText = `৳ ${cartOrderFinalTotal.toLocaleString('bn-BD')}`;

    // অটো-ফিল কাস্টমার তথ্য
    const loggedIn = JSON.parse(localStorage.getItem('loggedInCustomer') || 'null');
    if(loggedIn && loggedIn.name) {
        if(document.getElementById('orderName')) document.getElementById('orderName').value = loggedIn.name || '';
        if(document.getElementById('orderPhone')) document.getElementById('orderPhone').value = loggedIn.phone || '';
        if(document.getElementById('orderAddress')) document.getElementById('orderAddress').value = loggedIn.address || '';
    }

    orderModalMode = 'cart';
    currentCartCheckoutItems = [...cart];

    orderModal.classList.add('active');
    orderModal.style.display = 'flex';
};

// মডালের ভেতর থেকে কোয়ান্টিটি কমানো বা বাড়ানো
window.changeCartModalQty = function(index, delta) {
    let cart = JSON.parse(localStorage.getItem('userCart') || '[]');
    if (cart[index]) {
        cart[index].quantity += delta;
        if (cart[index].quantity <= 0) cart.splice(index, 1);
        localStorage.setItem('userCart', JSON.stringify(cart));
        updateCartBadgeCount();
        renderCartItems();
        if (cart.length === 0) {
            document.getElementById('orderModal')?.classList.remove('active');
        } else {
            openCartCheckoutModal();
        }
    }
};

// মডালের ভেতর থেকে কোনো পণ্য মুছে ফেলা
window.removeCartModalItem = function(index) {
    let cart = JSON.parse(localStorage.getItem('userCart') || '[]');
    cart.splice(index, 1);
    localStorage.setItem('userCart', JSON.stringify(cart));
    updateCartBadgeCount();
    renderCartItems();
    if (cart.length === 0) {
        document.getElementById('orderModal')?.classList.remove('active');
    } else {
        openCartCheckoutModal();
    }
};

setTimeout(() => { updateCartBadgeCount(); }, 500);

// আমাদের গল্প ও প্রাইভেসি পলিসি পপআপ হ্যান্ডলার
window.openSiteInfoModal = function(type) {
    const modal = document.getElementById('siteInfoModal');
    const title = document.getElementById('infoModalTitle');
    const content = document.getElementById('infoModalContent');
    if (!modal || !title || !content) return;

    if (type === 'about') {
        title.innerHTML = `🌿 <span>আমাদের গল্প</span>`;
        content.innerHTML = `
            <p style="margin-bottom: 10px;"><strong>ঋতুবীজ</strong>—বাংলার মাটির খাঁটি সুবাস আর প্রকৃতির শ্রেষ্ঠ উপহারকে সরাসরি আপনার ঘরে পৌঁছে দেওয়ার এক আন্তরিক প্রয়াস।</p>
            <p style="margin-bottom: 10px;">রাজশাহীর সুমিষ্ট আম, খেজুরের ঐতিহ্যবাহী পাটালি গুড় কিংবা রোদে শুকানো ঘরোয়া আচার—আমরা কোনো ধরনের কেমিক্যাল বা ক্ষতিকর প্রিজারভেটিভ ছাড়াই শতভাগ বিশুদ্ধ খাদ্য সরবরাহ নিশ্চিত করি।</p>
            <p style="margin: 0;">আমাদের লক্ষ্য শুধু পণ্য বিক্রি নয়, বরং দেশি স্বাদ ও ভালোবাসার মাধ্যমে প্রতিটি পরিবারের সুস্বাস্থ্য রক্ষা করা।</p>
        `;
    } else if (type === 'privacy') {
        title.innerHTML = `🔒 <span>প্রাইভেসি পলিসি</span>`;
        content.innerHTML = `
            <p style="margin-bottom: 10px;"><strong>ঋতুবীজ</strong>-এ আপনার ব্যক্তিগত তথ্যের গোপনীয়তা ও সুরক্ষা আমাদের সর্বোচ্চ অগ্রাধিকার।</p>
            <p style="margin-bottom: 10px;"><strong>তথ্য সংগ্রহ:</strong> অর্ডার সফলভাবে ডেলিভারি করার জন্য আমরা শুধুমাত্র আপনার নাম, মোবাইল নম্বর এবং সম্পূর্ণ ঠিকানা সংগ্রহ করি।</p>
            <p style="margin-bottom: 10px;"><strong>তথ্যের নিরাপত্তা:</strong> আপনার কোনো ব্যক্তিগত তথ্য কোনো তৃতীয় পক্ষের কাছে বিক্রি বা শেয়ার করা হয় না।</p>
            <p style="margin: 0;"><strong>ক্যাশ অন ডেলিভারি:</strong> আমাদের প্রতিটি অর্ডারে গ্রাহক পণ্য হাতে পেয়ে মূল্য পরিশোধ করতে পারেন, তাই কোনো পেমেন্ট সংক্রান্ত তথ্য আমরা সংরক্ষণ করি না।</p>
        `;
    }

    modal.classList.add('active');
    modal.style.display = 'flex';
};

window.closeSiteInfoModal = function() {
    const modal = document.getElementById('siteInfoModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
};

// রিওয়ার্ড পয়েন্ট মডাল ওপেন ও ক্লোজ ফাংশন
window.openRewardPointsModal = function() {
    const modal = document.getElementById('rewardPointsModal');
    const valElem = document.getElementById('modalRewardPointsVal');
    const pointsText = document.getElementById('uStatRewardPoints')?.innerText || '০';

    if (valElem) valElem.innerText = pointsText;
    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
    }
};

window.closeRewardPointsModal = function() {
    const modal = document.getElementById('rewardPointsModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
};

loadSiteSettings();
fetchProducts();
// --- পূর্ণাঙ্গ ফুল-স্ক্রিন প্রোডাক্ট ডিটেইলস পেজ লজিক ---

let activeDetProduct = null;
let activeDetQuantity = 1;

// ১. প্রোডাক্ট ডিটেইলস ফুল-স্ক্রিন পেজ ওপেন করা
window.openProductDetailModal = function(idOrName) {
    const prod = allProducts.find(p => p.id === idOrName || p.name === idOrName);
    if (!prod) return;

    activeDetProduct = prod;
    activeDetQuantity = 1;

    const homeView = document.querySelector('main.container');
    const metricsView = document.getElementById('metrics');
    const reviewsView = document.getElementById('reviewsSection');
    const footerContact = document.getElementById('contact');
    const ordersView = document.getElementById('ordersPageView');
    const favsView = document.getElementById('favoritesPageView');
    const profileView = document.getElementById('profilePageView');
    const cartPageView = document.getElementById('cartPageView');

    // শুধুমাত্র হোমপেইজের উপরের ব্যানার ও প্রধান গ্রিড লুকানো হবে
    if (homeView) homeView.style.display = 'none';
    if (ordersView) ordersView.style.display = 'none';
    if (favsView) favsView.style.display = 'none';
    if (profileView) profileView.style.display = 'none';
    if (cartPageView) cartPageView.style.display = 'none';

    // কাউন্টার মেট্রিক্স এবং ফুটার দৃশ্যমান থাকবে
    if (metricsView) metricsView.style.display = 'block';
    if (footerContact) footerContact.style.display = 'block';

    // বিবরণী পেজ সচল করা
    const detailPageView = document.getElementById('productDetailPageView');
    if (detailPageView) {
        detailPageView.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // বিবরণীর নিচে হোমপেজের মতো ২-কলামের অন্যান্য প্রোডাক্ট কার্ড রেন্ডার করা
    renderDetailRelatedProducts(prod.id);

    // তথ্য বাইন্ড করা
    const imgElem = document.getElementById('detProdImg');
    if (imgElem) imgElem.src = prod.image || '';

    const nameElem = document.getElementById('detProdName');
    if (nameElem) nameElem.innerText = prod.name;

    const priceElem = document.getElementById('detProdPrice');
    const regPriceElem = document.getElementById('detProdRegularPrice');
    const saveBadgeElem = document.getElementById('detSaveBadge');

    if (priceElem) priceElem.innerText = `৳ ${Number(prod.price).toLocaleString('bn-BD')}`;

    if (prod.regularPrice && Number(prod.regularPrice) > Number(prod.price)) {
        if (regPriceElem) {
            regPriceElem.innerText = `৳ ${Number(prod.regularPrice).toLocaleString('bn-BD')}`;
            regPriceElem.style.display = 'inline';
        }
        if (saveBadgeElem) {
            const saveAmount = Number(prod.regularPrice) - Number(prod.price);
            saveBadgeElem.innerText = `Save ৳${saveAmount.toLocaleString('bn-BD')}`;
            saveBadgeElem.style.display = 'inline-block';
        }
    } else {
        if (regPriceElem) regPriceElem.style.display = 'none';
        if (saveBadgeElem) saveBadgeElem.style.display = 'none';
    }

    const descElem = document.getElementById('detProdDesc');
    if (descElem) {
        descElem.innerText = prod.description || 'এই পণ্যের জন্য কোনো বিবরণ এখনো যুক্ত করা হয়নি।';
    }

    updateDetQtyDisplay();
};

// ২. ডিটেইলস পেজ থেকে হোমে ফিরে যাওয়া
window.closeProductDetailPage = function() {
    const detailPageView = document.getElementById('productDetailPageView');
    if (detailPageView) detailPageView.style.display = 'none';

    // হোমভিউ আবার ফিরিয়ে আনা
    window.navigateToScreen('home');
};

// ৩. পরিমাণ বাড়ানো বা কমানো (+ / -)
window.changeDetQty = function(delta) {
    activeDetQuantity = Math.max(1, activeDetQuantity + delta);
    updateDetQtyDisplay();
};

function updateDetQtyDisplay() {
    // পরিমাপ ১০০% বাংলায় এবং পরিষ্কার শব্দে আনবে
    const safeUnit = formatUnitBn(activeDetProduct?.unit);
    const qtyBn = Number(activeDetQuantity).toLocaleString('bn-BD');
    const disp = document.getElementById('detQtyDisplay');
    if (disp) disp.innerText = `${qtyBn} ${safeUnit}`;
}

// ৪. ফুল-স্ক্রিন পেজ থেকে কার্টে যোগ করা
window.addCurrentDetToCart = function() {
    if (!activeDetProduct) return;
    for(let i = 0; i < activeDetQuantity; i++) {
        window.addToCart(activeDetProduct.name, activeDetProduct.price, activeDetProduct.image, activeDetProduct.unit || 'কেজি');
    }
    window.showAppToast(`${activeDetProduct.name} কার্টে যোগ করা হয়েছে! 🛒`);
};

// ৫. ফুল-স্ক্রিন পেজ থেকে সরাসরি অর্ডার করা
window.buyNowFromDet = function() {
    if (!activeDetProduct) return;
    window.closeProductDetailPage();
    window.triggerOrderModal(activeDetProduct.name, activeDetProduct.price, activeDetProduct.image);
};
// কাস্টমার রেজিস্ট্রেশন
window.handleCustomerRegister = async function(e) {
    e.preventDefault();
    const name = document.getElementById('regName')?.value.trim();
    const email = document.getElementById('regEmail')?.value.trim();
    const phone = document.getElementById('regPhone')?.value.trim();
    const pass = document.getElementById('regPass')?.value.trim();
    const confirmPass = document.getElementById('regConfirmPass')?.value.trim();
    const address = document.getElementById('regAddress')?.value.trim();

    if(pass !== confirmPass) {
        return window.showAppToast("দুই ঘরের পাসওয়ার্ড মেলেনি!", "error");
    }

    try {
        const userCred = await createUserWithEmailAndPassword(auth, email, pass);
        const userData = { uid: userCred.user.uid, name, email, phone, address };
        await setDoc(doc(db, "customers", userCred.user.uid), userData);
        localStorage.setItem('loggedInCustomer', JSON.stringify(userData));
        window.showAppToast("রেজিস্ট্রেশন সফল হয়েছে! স্বাগতম 🎉");
        initProfileScreen();
    } catch(err) {
        window.showAppToast("রেজিস্ট্রেশন ব্যর্থ: " + err.message, "error");
    }
};

// কাস্টমার লগইন
window.handleCustomerLogin = async function(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail')?.value.trim();
    const pass = document.getElementById('loginPass')?.value.trim();

    try {
        const userCred = await signInWithEmailAndPassword(auth, email, pass);
        const cSnap = await getDoc(doc(db, "customers", userCred.user.uid));
        const userData = cSnap.exists() ? cSnap.data() : { name: email.split('@')[0], email, phone: '', address: '' };
        localStorage.setItem('loggedInCustomer', JSON.stringify(userData));
        window.showAppToast("সফলভাবে লগইন হয়েছে! ✅");
        initProfileScreen();
    } catch(err) {
        window.showAppToast("লগইন ভুল হয়েছে: " + err.message, "error");
    }
};

// কাস্টমার লগআউট
window.handleCustomerLogout = function() {
    signOut(auth);
    localStorage.removeItem('loggedInCustomer');
    window.showAppToast("লগআউট সফল হয়েছে।");
    initProfileScreen();
};

// প্রোফাইল এডিট ও পাসওয়ার্ড মডাল ওপেন/ক্লোজ
window.openEditProfileModal = function() {
    const user = JSON.parse(localStorage.getItem('loggedInCustomer') || '{}');
    if(document.getElementById('editCustName')) document.getElementById('editCustName').value = user.name || '';
    if(document.getElementById('editCustPhone')) document.getElementById('editCustPhone').value = user.phone || '';
    if(document.getElementById('editCustAddress')) document.getElementById('editCustAddress').value = user.address || '';
    document.getElementById('editProfileModal')?.classList.add('active');
};
window.closeEditProfileModal = function() {
    document.getElementById('editProfileModal')?.classList.remove('active');
};
window.openPasswordModal = function() {
    document.getElementById('passwordModal')?.classList.add('active');
};
window.closePasswordModal = function() {
    document.getElementById('passwordModal')?.classList.remove('active');
};
window.promptShowFullProfile = function() {
    window.openEditProfileModal();
};

// প্রোফাইল ডাটা আপডেট
window.handleUpdateProfile = async function(e) {
    e.preventDefault();
    const name = document.getElementById('editCustName').value.trim();
    const phone = document.getElementById('editCustPhone').value.trim();
    const address = document.getElementById('editCustAddress').value.trim();
    let user = JSON.parse(localStorage.getItem('loggedInCustomer') || '{}');

    user.name = name;
    user.phone = phone;
    user.address = address;
    localStorage.setItem('loggedInCustomer', JSON.stringify(user));

    if(user.uid) {
        try { await updateDoc(doc(db, "customers", user.uid), { name, phone, address }); } catch(err){}
    }
    window.showAppToast("তথ্য আপডেট হয়েছে! ✅");
    window.closeEditProfileModal();
    initProfileScreen();
};
// পাসওয়ার্ড ভুলে যাওয়ার রিকোয়েস্ট
window.handleForgotPassword = async function() {
    const email = prompt("আপনার একাউন্টের ইমেইল এড্রেস লিখুন:");
    if (!email) return;
    try {
        await sendPasswordResetEmail(auth, email.trim());
        window.showAppToast("আপনার ইমেইলে পাসওয়ার্ড রিসেট লিংক পাঠানো হয়েছে! ✉️");
    } catch(err) {
        window.showAppToast("ইমেইল পাঠানো যায়নি: " + err.message, "error");
    }
};// বিবরণী পেজের নিচে হোমপেজের মতো হুবহু ২-কলামের প্রোডাক্ট কার্ড লোড করার ফাংশন
function renderDetailRelatedProducts(currentProdId) {
    const container = document.getElementById('detailRelatedGrid');
    if (!container) return;

    const favs = JSON.parse(localStorage.getItem('userFavorites') || '[]');
    // বর্তমান দেখা পণ্যটি ছাড়া বাকি অন্যান্য পণ্যগুলো নেওয়া
    let otherProducts = allProducts.filter(p => p.id !== currentProdId);
    if(otherProducts.length === 0) otherProducts = allProducts;

    container.innerHTML = otherProducts.map(prod => {
        const inStock = prod.inStock !== false;
        const isFav = favs.includes(prod.name);

        return `
            <div class="prod-card-v2" onclick="window.openProductDetailModal('${prod.id}')" style="cursor: pointer;">
                <!-- কোনো ব্যাজ বা হার্ট বাটন ছাড়া একদম পরিষ্কার পণ্যের ছবি -->
                <div class="prod-img-box">
                    <img src="${prod.image}" alt="${prod.name}" loading="lazy">
                </div>

                <div class="prod-card-content">
                    <h4 class="prod-card-title">${prod.name}</h4>

                    <div class="prod-price-block" style="display: flex; align-items: baseline; gap: 5px; margin-bottom: 5px;">
                        <span class="price-val" style="color: #E63946; font-size: 15.5px; font-weight: 800; line-height: 1;">৳ ${Number(prod.price).toLocaleString('bn-BD')}</span>
                        ${prod.regularPrice && Number(prod.regularPrice) > Number(prod.price) 
                            ? `<span class="price-old-val" style="font-size: 12px; color: #9CA3AF; text-decoration: line-through; line-height: 1;">৳ ${Number(prod.regularPrice).toLocaleString('bn-BD')}</span>` 
                            : `<span class="price-unit" style="font-size: 11px; color: #6B7280; line-height: 1;">/${prod.unit || 'কেজি'}</span>`
                        }
                    </div>

                    ${inStock 
                        ? `<div style="display: flex; gap: 5px; margin-top: 0; align-items: center;">
                             <button type="button" class="btn-card-order-full" onclick="event.stopPropagation(); window.triggerOrderModal('${prod.id || prod.name}')" style="flex: 1; padding: 6px 4px; font-size: 12px; border-radius: 16px; cursor: pointer;" title="সরাসরি অর্ডার">
                               <span>অর্ডার</span>
                             </button>
                             <button type="button" onclick="event.stopPropagation(); window.addToCart('${prod.id || prod.name}')" style="background: #E8F3ED; color: var(--primary); border: 1px solid #C2DED1; border-radius: 16px; padding: 6px 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; height: 30px; width: 32px;" title="কার্টে যোগ করুন">
                               <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
                             </button>
                           </div>`
                        : `<button class="btn-card-order-full disabled" disabled style="padding: 6px; font-size: 11.5px; border-radius: 16px;">স্টক শেষ</button>`
                    }
                </div>
            </div>
        `;
    }).join('');
}
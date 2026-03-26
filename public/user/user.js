/**
 * ============================================================================
 * public/user/user.js — Student File Viewer Portal Logic
 * ============================================================================
 * Handles the secure document viewing experience for students, including:
 * - Real-time file listing and category filtering
 * - Secure OTP-based authentication flow
 * - Multi-format document viewing (PDF, Images, Word)
 * - Security protections (Watermarking, Right-click/Print screen blocks)
 * - User activity heartbeat and logging
 * ============================================================================
 */

/* ----------------------------------------------------------------------------
   GLOBAL STATE & CONSTANTS
   ---------------------------------------------------------------------------- */
let files = [];               /* Array of file objects from server */
let selectedFileIndex = null; /* Index of the file currently chosen */
let selectedFileName = null;  /* Name of the file currently chosen */
let categoryFilter = "All";   /* Active category tab filter */
let currentMobile = "";       /* Mobile number entered by the user */
let otpCountdown;             /* Interval handle for the OTP timer */

const OTP_SESSION_TIME = 10 * 60 * 1000; /* Session valid for 10 minutes */

/**
 * ============================================================
 * SECTION 1 — INITIALIZATION & DATA LOADING
 * ============================================================
 */

/**
 * loadFiles()
 * Entry point. Loads files and checks for direct links.
 */
async function loadFiles() {
  const container = document.getElementById("files");
  if (container) container.innerHTML = '<div class="spinner"></div>';

  try {
    const res = await fetch("/api/files");
    if (!res.ok) throw new Error("Failed to fetch files");

    files = await res.json();
    renderFiles();
    loadCategoriesToFilter();
    
    /* Auto-open if a file is specified in the URL query (?file=name.pdf) */
    openFileFromURL();
  } catch (err) {
    console.error("❌ [LOAD] File fetch error:", err);
    showErrorState(container);
  }
}

/**
 * showErrorState(container)
 * Displays a professional retry UI when file loading fails.
 */
function showErrorState(container) {
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <i class="fa-solid fa-circle-exclamation" style="font-size:40px; color:#ef4444; margin-bottom:14px; display:block;"></i>
      <h3>Failed to load files</h3>
      <p>Please check your connection or try again later.</p>
      <button class="retry-btn" onclick="loadFiles()">Retry Now</button>
    </div>
  `;
}

/**
 * loadCategoriesToFilter()
 * Dynamically builds the category filter tabs.
 */
async function loadCategoriesToFilter() {
  const tabs = document.getElementById("categoryTabs");
  if (!tabs) return;

  try {
    const res = await fetch("/api/categories");
    const categories = await res.json();

    /* Always start with "All" tab */
    tabs.innerHTML = `<button class="cat-tab active" onclick="setCategory('All', this)">All</button>`;
    
    categories.forEach(cat => {
      tabs.innerHTML += `<button class="cat-tab" onclick="setCategory('${escapeHTML(cat.name)}', this)">${escapeHTML(cat.name)}</button>`;
    });
  } catch (err) {
    console.error("❌ [CATEGORIES] Load error:", err);
  }
}

/**
 * ============================================================
 * SECTION 2 — RENDERING & FILTERING
 * ============================================================
 */

/**
 * renderFiles()
 * Filters and displays file cards based on search and category.
 */
function renderFiles() {
  const container = document.getElementById("files");
  const searchInput = document.getElementById("searchInput");
  const search = searchInput ? searchInput.value.toLowerCase().trim() : "";

  if (!container) return;
  container.innerHTML = "";

  if (files.length === 0) {
    showNoFiles(container);
    return;
  }

  const visible = files.filter(f => 
    (categoryFilter === "All" || f.category === categoryFilter) &&
    (f.name.toLowerCase().includes(search))
  );

  if (visible.length === 0) {
    showNoResults(container);
    return;
  }

  visible.forEach((file) => {
    const { icon, cls } = getFileIcon(file.name);
    const isViewOnly = file.importance === "important";
    const accessLabel = isViewOnly ? "View Only" : "View & Download";
    const accessCls = isViewOnly ? "badge-view-only" : "badge-view-download";
    const accessIcon = isViewOnly ? "fa-solid fa-lock" : "fa-solid fa-download";
    const displayName = escapeHTML(file.name).replace(/\.[^.]+$/, "");
    const globalIdx = files.indexOf(file);

    container.innerHTML += `
      <div class="file-card" onclick="viewFile(${globalIdx})" role="button" tabindex="0">
        <div class="file-icon-wrap ${cls}">
          <i class="${icon}"></i>
        </div>
        <div class="file-card-name">${displayName}</div>
        <div class="file-card-meta">
          <span>${escapeHTML(file.category || "General")}</span>
          &middot;
          <span>${(file.name.split(".").pop() || "FILE").toUpperCase()}</span>
        </div>
        <span class="file-access-badge ${accessCls}">
          <i class="fa ${accessIcon}"></i> ${accessLabel}
        </span>
      </div>
    `;
  });
}

function showNoFiles(container) {
  container.innerHTML = `
    <div class="empty-state">
      <i class="fa-solid fa-folder-open muted-icon"></i>
      <h3>No files uploaded yet</h3>
      <p>Ask your administrator to upload documents.</p>
    </div>
  `;
}

function showNoResults(container) {
  container.innerHTML = `
    <div class="empty-state">
      <i class="fa-solid fa-magnifying-glass muted-icon"></i>
      <h3>No results found</h3>
      <p>Try adjusting your search or selecting a different category.</p>
    </div>
  `;
}

/**
 * getFileIcon(name)
 * Map file extensions to FontAwesome icons and color classes.
 */
function getFileIcon(name) {
  const ext = (name || "").split(".").pop().toLowerCase();
  if (ext === "pdf") return { icon: "fa-solid fa-file-pdf", cls: "pdf" };
  if (["doc", "docx"].includes(ext)) return { icon: "fa-solid fa-file-word", cls: "doc" };
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return { icon: "fa-solid fa-file-image", cls: "image" };
  return { icon: "fa-solid fa-file", cls: "other" };
}

/**
 * setCategory(name, btn)
 * Handles category tab switching.
 */
function setCategory(name, btn) {
  categoryFilter = name;
  document.querySelectorAll(".cat-tab").forEach(t => t.classList.remove("active"));
  btn.classList.add("active");
  renderFiles();
}

/**
 * ============================================================
 * SECTION 3 — OTP AUTHENTICATION FLOW
 * ============================================================
 */

/**
 * viewFile(index)
 * Triggered on file card click. Initiates OTP flow if needed.
 */
async function viewFile(index) {
  selectedFileIndex = index;
  selectedFileName = files[index].name;

  const mobile = sessionStorage.getItem("verifiedMobile") || currentMobile;

  /* 1. Pre-check block status if we have a mobile stored */
  if (mobile) {
    const isBlocked = await checkBlockStatus(mobile);
    if (isBlocked) {
      showAccessBlocked();
      return;
    }
  }

  /* 2. Direct open if session is valid, otherwise show OTP modal */
  if (isOtpValid()) {
    openViewer();
  } else {
    toggleModal("otpModal", true);
    showStep("mobileStep");
  }
}

async function checkBlockStatus(mobile) {
  try {
    const res = await fetch("/api/users/check-block", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile })
    });
    const data = await res.json();
    return data.blocked;
  } catch (e) { return false; }
}

function showAccessBlocked() {
  toggleModal("otpModal", true);
  showStep("resultStep");
  document.getElementById("resultTitle").textContent = "Access Blocked";
  document.getElementById("resultMessage").textContent = "Your access has been restricted by the administrator.";
  const icon = document.getElementById("resultIcon");
  if (icon) icon.innerHTML = '<i class="fa-solid fa-ban" style="color:#ef4444; font-size:40px;"></i>';
}

/**
 * sendOtp()
 * Validates inputs and triggers the backend OTP send.
 */
async function sendOtp() {
  const name = document.getElementById("userName")?.value.trim();
  const mobileInput = document.getElementById("mobileInput")?.value.trim();

  if (!name) return showAuthError("Please enter your name");
  
  if (window.iti) {
    currentMobile = window.iti.getNumber();
  } else {
    currentMobile = mobileInput;
  }

  if (!currentMobile) return showAuthError("Please enter a valid phone number");

  showAuthError(""); /* Clear errors */

  try {
    const res = await fetch("/api/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile: currentMobile, name })
    });

    const data = await res.json();
    if (data.success || data.status === "pending") {
      showStep("otpStep");
      startOtpTimer();
      focusFirstOtpBox();
    } else {
      showAuthError(data.error || "Failed to send OTP");
    }
  } catch (err) {
    showAuthError("Network error. Please try again.");
  }
}

/**
 * verifyOtp()
 * Collects digit inputs and validates with server.
 */
async function verifyOtp() {
  let otp = "";
  document.querySelectorAll(".otp-digit").forEach(i => otp += i.value);

  if (otp.length < 6) {
    const err = document.getElementById("verifyError");
    if (err) err.textContent = "Enter 6-digit code";
    return;
  }

  try {
    const res = await fetch("/api/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile: currentMobile, otp })
    });

    const data = await res.json();
    if (!data.success) {
      shakeOtpBoxes();
      return;
    }

    /* Final Block Check after OTP success */
    const blocked = await checkBlockStatus(currentMobile);
    if (blocked) {
      showAccessBlocked();
      return;
    }

    /* Session setup */
    setupUserSession(data);
    
    showStep("resultStep");
    updateResultUI("Verified!", "OTP verified. Opening your file...", true);

    setTimeout(() => {
      toggleModal("otpModal", false);
      openViewer();
    }, 1400);

  } catch (err) {
    updateResultUI("Server Error", "Something went wrong. Try again.", false);
  }
}

function setupUserSession(data) {
  sessionStorage.setItem("otpVerified", "true");
  sessionStorage.setItem("otpTime", Date.now());
  sessionStorage.setItem("verifiedMobile", currentMobile);
  /* Basic token generation - Replace with JWT in production if possible */
  const token = btoa(`${currentMobile}:${Date.now()}`);
  sessionStorage.setItem("authToken", token);
}

/**
 * ============================================================
 * SECTION 4 — FILE VIEWER & SECURITY
 * ============================================================
 */

/**
 * openViewer()
 * Configures the fullscreen modal, loads file content, and applies protections.
 */
function openViewer() {
  const file = files[selectedFileIndex];
  if (!file) return;

  saveViewLog(file.name);
  toggleModal("viewerModal", true);

  const container = document.getElementById("viewerContent");
  const fileNameEl = document.getElementById("viewerFileName");
  if (fileNameEl) fileNameEl.textContent = file.name.replace(/\.[^.]+$/, "");

  const token = sessionStorage.getItem("authToken") || "";
  const fileUrl = `/secure-files/${file.name}?token=${token}`;
  const ext = file.name.split(".").pop().toLowerCase();

  handleDownloadButton(file, token);
  showWatermark(true);

  /* Render based on type */
  if (container) {
    container.innerHTML = "";
    if (ext === "pdf") {
      loadPDF(fileUrl);
    } else if (["jpg", "jpeg", "png", "webp"].includes(ext)) {
      const img = document.createElement("img");
      img.src = fileUrl;
      img.style.width = "100%";
      img.style.maxHeight = "85vh";
      img.style.objectFit = "contain";
      container.appendChild(img);
    } else if (["doc", "docx"].includes(ext)) {
      const iframe = document.createElement("iframe");
      iframe.src = "https://view.officeapps.live.com/op/embed.aspx?src=" + encodeURIComponent(window.location.origin + fileUrl);
      iframe.setAttribute("sandbox", "allow-scripts allow-forms allow-modals allow-popups allow-presentation");
      iframe.style.width = "100%";
      iframe.style.height = "85vh";
      iframe.style.border = "none";
      container.appendChild(iframe);
    }
  }
}

function handleDownloadButton(file, token) {
  const btn = document.getElementById("downloadBtn");
  if (!btn) return;

  if (file.importance === "important") {
    btn.style.display = "none";
  } else {
    btn.style.display = "flex";
    btn.onclick = () => {
      const link = document.createElement("a");
      link.href = `/secure-files/download/${file.name}?token=${token}`;
      link.click();
      saveDownloadLog(file.name);
    };
  }
}

/**
 * loadPDF(url)
 * Uses PDF.js to render PDF pages to canvases.
 */
async function loadPDF(url) {
  const pdfjsLib = window["pdfjs-dist/build/pdf"];
  if (!pdfjsLib) return console.error("PDF.js missing");

  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

  try {
    const loadingTask = pdfjsLib.getDocument(url);
    const pdf = await loadingTask.promise;
    const container = document.getElementById("viewerContent");

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const scale = window.innerWidth < 768 ? 1.2 : 1.5;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.className = "pdf-page";
      const ctx = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      container.appendChild(canvas);
      await page.render({ canvasContext: ctx, viewport }).promise;
    }
  } catch (e) {
    console.error("PDF Render Error:", e);
  }
}

/**
 * ============================================================
 * SECTION 5 — LOGGING & TRACKING
 * ============================================================
 */

/**
 * getCachedLocation()
 * Fetches geolocation data once and stores it in sessionStorage to avoid
 * redundant external API calls and improve performance.
 */
async function getCachedLocation() {
  const cached = sessionStorage.getItem("userLocation");
  if (cached) return JSON.parse(cached);

  try {
    /* Fetch from server-side location endpoint (hides CORS/403 errors from console) */
    const res = await fetch("/api/location");
    const data = await res.json();
    
    if (data && data.success) {
      const loc = {
        ip:      data.ip      || "Unknown",
        country: data.country || "Unknown",
        state:   data.state    || "Unknown"
      };
      sessionStorage.setItem("userLocation", JSON.stringify(loc));
      return loc;
    }
  } catch (e) {
    /* Silent fail to avoid polluting the console; falling back to "Unknown" */
  }

  const fallback = { ip: "Unknown", country: "Unknown", state: "Unknown" };
  return fallback;
}

/**
 * logActivity(action, fileName)
 * Centralized logging for tracking user interactions (view/download).
 */
async function logActivity(action, fileName) {
  const mobile = sessionStorage.getItem("verifiedMobile") || currentMobile;
  const name = document.getElementById("userName")?.value || "Student";

  if (!mobile || mobile === "Unknown") return;

  const endpoint = action === "view" ? "/api/save-view" : "/api/save-download";
  const loc = await getCachedLocation();

  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file: fileName,
        name: name,
        mobile: mobile,
        ip: loc.ip,
        country: loc.country,
        state: loc.state,
        device: navigator.userAgent
      })
    });
  } catch (e) {
    console.error(`❌ [LOG] ${action} log failed:`, e);
  }
}

async function saveViewLog(fileName) {
  await logActivity("view", fileName);
}

async function saveDownloadLog(fileName) {
  await logActivity("download", fileName);
}

/**
 * ============================================================
 * SECTION 6 — UTILITIES & UI HELPERS
 * ============================================================
 */

function toggleModal(id, isOpen) {
  const el = document.getElementById(id);
  if (el) isOpen ? el.classList.add("open") : el.classList.remove("open");
}

function showStep(step) {
  ["mobileStep", "otpStep", "resultStep"].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.style.display = (s === step) ? "block" : "none";
  });
}

function showAuthError(msg) {
  const el = document.getElementById("sendError");
  if (el) el.textContent = msg;
}

function isOtpValid() {
  const time = sessionStorage.getItem("otpTime");
  if (!time) return false;
  return (Date.now() - parseInt(time)) < OTP_SESSION_TIME;
}

function escapeHTML(str) {
  if (typeof str !== "string") return "";
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return str.replace(/[&<>"']/g, m => map[m]);
}

function shakeOtpBoxes() {
  const boxes = document.querySelector(".otp-boxes");
  if (boxes) {
    boxes.classList.add("shake");
    setTimeout(() => boxes.classList.remove("shake"), 400);
  }
}

function updateResultUI(title, msg, isSuccess) {
  document.getElementById("resultTitle").textContent = title;
  document.getElementById("resultMessage").textContent = msg;
  const icon = document.getElementById("resultIcon");
  if (icon) {
    icon.innerHTML = isSuccess 
      ? '<i class="fa-solid fa-circle-check" style="color:#10b981; font-size:40px;"></i>'
      : '<i class="fa-solid fa-circle-xmark" style="color:#ef4444; font-size:40px;"></i>';
  }
}

function startOtpTimer() {
  clearInterval(otpCountdown);
  let time = 120;
  const timerEl = document.getElementById("countdown");
  const btn = document.getElementById("verifyBtn");
  
  const updateTimer = () => {
    const m = Math.floor(time / 60).toString().padStart(2, '0');
    const s = (time % 60).toString().padStart(2, '0');
    if (timerEl) timerEl.textContent = `${m}:${s}`;
    if (time <= 0) {
      clearInterval(otpCountdown);
      if (btn) btn.textContent = "Resend OTP";
    }
    time--;
  };
  updateTimer();
  otpCountdown = setInterval(updateTimer, 1000);
}

function focusFirstOtpBox() {
  document.querySelector(".otp-digit")?.focus();
}

function showWatermark(show) {
  const wm = document.getElementById("watermarkOverlay");
  if (!wm) return;

  if (show) {
    const watermarkText = "MCET"; 
    let pattern = "";

    // reduce count (was 80 ❌)
    for (let i = 0; i < 20; i++) {
      pattern += `
        <span style="
          display:inline-block;
          margin:80px;
          transform:rotate(-30deg);
          opacity:0.08;
          font-size:18px;
          font-weight:bold;
          color:#000;
        ">
          ${watermarkText}
        </span>
      `;
    }

    wm.innerHTML = pattern;
    wm.style.display = "block";
  } else {
    wm.style.display = "none";
    wm.innerHTML = "";
  }
}

function openFileFromURL() {
  const params = new URLSearchParams(window.location.search);
  const file = params.get("file");
  if (!file) return;
  
  const idx = files.findIndex(f => f.name === file);
  if (idx !== -1) viewFile(idx);
}

function closeViewer() {
  toggleModal("viewerModal", false);
  showWatermark(false);
  const container = document.getElementById("viewerContent");
  if (container) container.innerHTML = "";
}

function closeOtpModal() {
  toggleModal("otpModal", false);
  showStep("mobileStep");
  showAuthError("");
}

function initPhoneInput() {
  const input = document.querySelector("#mobileInput");
  if (input && window.intlTelInput) {
    window.iti = window.intlTelInput(input, {
      initialCountry: "in",
      separateDialCode: true,
      utilsScript: "https://cdn.jsdelivr.net/npm/intl-tel-input@18.1.1/build/js/utils.js"
    });
  }
}

/* Event Listeners */
document.addEventListener("DOMContentLoaded", () => {
  loadFiles();
  initPhoneInput();
  
  /* Keyboard listeners for Enter key */
  document.getElementById("userName")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendOtp();
  });
  document.getElementById("mobileInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendOtp();
  });

  /* Auto-advance & Enter for OTP boxes */
  const otpBoxes = document.querySelectorAll(".otp-digit");
  otpBoxes.forEach((box, i) => {
    box.addEventListener("input", () => { if (box.value && otpBoxes[i+1]) otpBoxes[i+1].focus(); });
    box.addEventListener("keydown", (e) => { 
      if (e.key === "Backspace" && !box.value && otpBoxes[i-1]) otpBoxes[i-1].focus(); 
      if (e.key === "Enter") verifyOtp();
    });
  });

  /* Block PrintScreen */
  document.addEventListener("keyup", (e) => {
    if (e.key === "PrintScreen") {
      navigator.clipboard.writeText("").catch(() => {});
      alert("Screenshots are disabled for security.");
    }
  });

  /* Global Keyboard blocks */
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && (e.key === 'p' || e.key === 's' || e.key === 'u')) e.preventDefault();
  });
});

/* Heartbeat & Block Status Check */
setInterval(async () => {
  const mobile = sessionStorage.getItem("verifiedMobile");
  if (!mobile) return;

  try {
    const res = await fetch("/api/users/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile })
    });
    
    const data = await res.json();
    if (data.blocked) {
      document.getElementById("blockedNumberDisplay").innerText = mobile;
      const modal = document.getElementById("blockedModal");
      if (modal) {
        modal.style.display = "flex";
        /* Force close any open viewers or OTP boxes */
        if (typeof closeViewer === "function") closeViewer();
        toggleModal("otpModal", false);
      }
    }
  } catch (e) {
    console.warn("⚠️ [HB] Heartbeat check failed.");
  }
}, 30000); // Check every 30s

function backToMobile() {
  /* Clear error messages and reset UI for the mobile entry step */
  showAuthError("");
  const errEl = document.getElementById("verifyError");
  if (errEl) errEl.textContent = "";
  
  const sendBtn = document.getElementById("sendOtpBtn");
  if (sendBtn) {
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send OTP via WhatsApp';
  }

  showStep("mobileStep");
}

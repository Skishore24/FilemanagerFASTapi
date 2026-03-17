/* ============================================================
   public/user/user.js — User File Viewer Page Logic
   Handles:
   - Loading and displaying available files with search/filter
   - OTP flow: send → verify → open viewer
   - File viewing (PDF, images, Word docs via iframe)
   - Download logging and blocked user checks
   - Watermark overlay, right-click protection, screenshot block
   - Heartbeat (keeps user shown as online in admin dashboard)
   ============================================================ */

let otpCountdown;     /* setInterval handle for OTP countdown timer */
let files = [];       /* Array of file objects loaded from the server */


/* ============================================================
   showStep(step)
   Switches which step is visible inside the OTP modal.
   Steps: "mobileStep" | "otpStep" | "resultStep"
   ============================================================ */
function showStep(step) {

document.getElementById("mobileStep").style.display="none";
document.getElementById("otpStep").style.display="none";
document.getElementById("resultStep").style.display="none";

document.getElementById(step).style.display="block";

}

async function loadFiles() {
  document.getElementById("files").innerHTML = `
  <div class="spinner"></div>
`;

  try {

    const res = await fetch("/api/files");

    if (!res.ok) throw new Error("Failed to fetch files");

    files = await res.json();
    renderFiles();
    loadCategoriesToFilter(); /* Inject category tab buttons */

    /* If a file was linked in the URL query string, open it */
    openFileFromURL();

  } catch (err) {

    console.error("Error loading files:", err);

    /* Show styled error state instead of bare text */
    document.getElementById("files").innerHTML = `
      <div style="
        grid-column: 1 / -1;
        text-align: center;
        padding: 60px 20px;
        color: #6b7280;
      ">
        <i class="fa fa-exclamation-circle" style="font-size:40px; color:#ef4444; margin-bottom:14px; display:block;"></i>
        <p style="font-size:16px; font-weight:600; color:#374151; margin-bottom:6px;">Failed to load files</p>
        <p style="font-size:13px;">Please refresh the page or try again later.</p>
        <button onclick="loadFiles()" style="
          margin-top:18px;
          padding:10px 20px;
          background:linear-gradient(135deg,#6366f1,#7c3aed);
          color:white;
          border:none;
          border-radius:10px;
          font-size:14px;
          cursor:pointer;
          font-family:Poppins,sans-serif;
        ">Retry</button>
      </div>
    `;

  }

}
function openFileFromURL() {

  const fileFromURL = getFileFromURL();
  if (!fileFromURL) return;

  selectedFileIndex = files.findIndex(f => f.name === fileFromURL);

  if (selectedFileIndex !== -1) {
    selectedFileName = fileFromURL;
    /* Open OTP modal using the CSS .open class */
    document.getElementById("otpModal").classList.add("open");
    showStep("mobileStep");
  }
}


/* ============================================================
   GLOBAL STATE
   ============================================================ */
let selectedFileIndex = null;            /* Index of the currently selected file  */
let selectedFileName  = null;            /* Name of the currently selected file   */
let categoryFilter    = "All";           /* Active category filter value           */
let currentMobile     = "";              /* Mobile number entered in the OTP form  */

const OTP_SESSION_TIME = 10 * 60 * 1000; /* OTP session lasts 10 minutes           */

/* ============================================================
   getFileIcon(name)
   Returns a Font Awesome icon class + colour wrapper class
   based on the file extension.
   ============================================================ */
function getFileIcon(name) {

  const ext = (name || "").split(".").pop().toLowerCase();

  if (ext === "pdf")  return { icon: "fa-solid fa-file-pdf",        cls: "pdf"   };
  if (ext === "doc" ||
      ext === "docx") return { icon: "fa-solid fa-file-word",       cls: "doc"   };
  if (ext === "xls" ||
      ext === "xlsx") return { icon: "fa-solid fa-file-excel",      cls: "image" };
  if (["jpg","jpeg","png","gif","webp"].includes(ext))
                      return { icon: "fa-solid fa-file-image",      cls: "image" };

  return              { icon: "fa-solid fa-file",          cls: "other" };

}


/* ============================================================
   renderFiles()
   Renders premium file cards into the #files grid.
   Filters by: active category tab and search box value.
   ============================================================ */
function renderFiles() {

  const container = document.getElementById("files");
  const searchEl  = document.getElementById("searchInput");  /* Matches new HTML id */
  const search    = searchEl ? searchEl.value.toLowerCase().trim() : "";

  container.innerHTML = "";

  /* Show empty state card if no files exist */
  if (files.length === 0) {
    container.innerHTML = `
      <div style="
        grid-column:1/-1;
        text-align:center;
        padding:60px 20px;
        color:#6b7280;
      ">
        <i class="fa fa-folder-open" style="font-size:48px;color:#c7d2fe;display:block;margin-bottom:14px;"></i>
        <p style="font-size:16px;font-weight:600;color:#374151;margin-bottom:6px;">No files uploaded yet</p>
        <p style="font-size:13px;">Ask your admin to upload documents.</p>
      </div>
    `;
    return;
  }

  const visible = files.filter(file =>
    (categoryFilter === "All" || file.category === categoryFilter) &&
    file.name.toLowerCase().includes(search)
  );

  /* Show no-results state if search/filter has no matches */
  if (visible.length === 0) {
    container.innerHTML = `
      <div style="
        grid-column:1/-1;
        text-align:center;
        padding:50px 20px;
        color:#6b7280;
      ">
        <i class="fa fa-search" style="font-size:36px;color:#c7d2fe;display:block;margin-bottom:12px;"></i>
        <p style="font-size:15px;font-weight:600;color:#374151;margin-bottom:6px;">No results found</p>
        <p style="font-size:13px;">Try a different search term or category.</p>
      </div>
    `;
    return;
  }

  /* Render each file as a premium card */
  visible.forEach((file, index) => {

    const { icon, cls }  = getFileIcon(file.name);
    const isViewOnly     = file.importance === "important";
    const accessLabel    = isViewOnly ? "View Only"        : "View &amp; Download";
    const accessCls      = isViewOnly ? "badge-view-only"  : "badge-view-download";
    const accessIcon     = isViewOnly ? "fa-lock"          : "fa-download";

    /* Truncate very long file names for display */
    const displayName = escapeHTML(file.name).replace(/\.[^.]+$/, ""); /* strip ext */

    const idx = files.indexOf(file); 

    container.innerHTML += `
      <div class="file-card" onclick="viewFile(${idx})" title="${escapeHTML(file.name)}" role="button" tabindex="0" aria-label="Open ${escapeHTML(file.name)}">

        <!-- File type icon -->
        <div class="file-icon-wrap ${cls}">
          <i class="${icon}"></i>
        </div>

        <!-- File name -->
        <div class="file-card-name">${displayName}</div>

        <!-- Category and file extension -->
        <div class="file-card-meta">
          <span>${escapeHTML(file.category || "General")}</span>
          &middot;
          <span>${(file.name.split(".").pop() || "").toUpperCase()}</span>
        </div>

        <!-- Access type badge -->
        <span class="file-access-badge ${accessCls}">
          <i class="fa ${accessIcon}"></i>
          ${accessLabel}
        </span>

      </div>
    `;

  });

  /* Re-attach keyboard Enter support for accessibility */
  container.querySelectorAll(".file-card").forEach((card, i) => {
    card.addEventListener("keydown", e => {
      if (e.key === "Enter") card.click();
    });
  });

}

/* ============================================================
   loadCategoriesToFilter()
   Fetches all categories and injects .cat-tab pill buttons
   into #categoryTabs in the new user.html layout.
   ============================================================ */
async function loadCategoriesToFilter() {

  try {

    const res        = await fetch("/api/categories");
    const categories = await res.json();
    const tabs       = document.getElementById("categoryTabs");

    if (!tabs) return; /* Safety guard */

    /* "All" tab is always first and starts active */
    tabs.innerHTML = `<button class="cat-tab active" onclick="setCategory('All', this)">All</button>`;

    categories.forEach(cat => {
      tabs.innerHTML += `<button class="cat-tab" onclick="setCategory('${escapeHTML(cat.name)}', this)">${escapeHTML(cat.name)}</button>`;
    });

  } catch (err) {
    console.error("Failed to load categories:", err);
  }

}


/* ============================================================
   setCategory(name, btn)
   Called when a category tab is clicked.
   Highlights the active tab and re-renders the file grid.
   ============================================================ */
function setCategory(name, btn) {

  categoryFilter = name;

  /* Visually mark only the clicked tab as active */
  document.querySelectorAll(".cat-tab").forEach(t => t.classList.remove("active"));
  btn.classList.add("active");

  renderFiles();

}


/* ============================================================
   changeFilter() — legacy compatibility stub
   ============================================================ */


/* ============================================================
   viewFile(index)
   Called when a file card is clicked.
   Checks if user is blocked, then opens OTP modal or viewer
   if the OTP session is still valid.
   ============================================================ */
async function viewFile(index) {

    selectedFileIndex = index;
    selectedFileName  = files[index].name;


    /* Check if admin has blocked this user */
const mobile = sessionStorage.getItem("verifiedMobile") || currentMobile;

if (mobile) {
  const res = await fetch("/api/users/check-block", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mobile })
  });

  const data = await res.json();

  if (data.blocked) {
    document.getElementById("otpModal").classList.add("open");
    showStep("resultStep");

    document.getElementById("resultTitle").textContent = "Access Blocked";
    document.getElementById("resultMessage").textContent =
      "Your access has been blocked by admin.";

    return;
  }
}

    /* If OTP session is still valid, open viewer directly */
    if (isOtpValid()) {
        openViewer();
    } else {
        /* Ask for OTP verification */
        document.getElementById("otpModal").classList.add("open");
        showStep("mobileStep");
    }

}

/* ============================================================
   showMessage(msg)
   Displays an inline error below the send OTP form.
   Uses #sendError element from the new user.html layout.
   ============================================================ */
function showMessage(msg) {
  const el = document.getElementById("sendError");
  if (el) el.textContent = msg;
}

/* ============================================================
   sendOtp()
   Validates name + mobile, then sends OTP via /api/send-otp.
   Does NOT depend on intl-tel-input (iti) library.
   Reads country code from #countryCode <select> and
   mobile digits from #mobileInput, combines into E.164 format.
   ============================================================ */
async function sendOtp() {

  const name = document.getElementById("userName")?.value.trim() || "";

  if(name === ""){
    showMessage("Please enter your name.");
    return;
  }


 let mobileInput = document.getElementById("mobileInput").value.trim();

if (window.iti) {
  currentMobile = window.iti.getNumber();
} else {
  currentMobile = mobileInput;
}

console.log("Mobile:", currentMobile);

  console.log("International mobile:", currentMobile);

  if(!currentMobile){
    showMessage("Please enter a valid phone number.");
    return;
  }

  showMessage("");

  try{

    const res = await fetch("/api/send-otp",{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ mobile: currentMobile })
    });

    const data = await res.json();
    console.log("OTP API response:", data);

    if (data.success || data.status === "pending") {

      showStep("otpStep");
      startOtpTimer();

      document.querySelectorAll(".otp-digit").forEach(i=>i.value="");

      document.querySelector(".otp-digit")?.focus();

    }else{
      showMessage(data.message || "Failed to send OTP.");
    }

  }catch(err){

    showMessage("Network error. Please try again.");

  }

}
/* ============================================================
   startOtpTimer()
   Starts a 2-minute countdown on the OTP screen.
   Uses #countdown element (matching new user.html layout).
   Auto-switches Verify button to Resend when time runs out.
   ============================================================ */
function startOtpTimer() {

  clearInterval(otpCountdown);

  let time = 120;

  /* Use #countdown (new HTML) falling back to #timer for compatibility */
  const timerEl = document.getElementById("countdown") || document.getElementById("timer");
  const btn = document.getElementById("verifyBtn");

  if (btn) { btn.innerText = "Verify OTP"; btn.onclick = verifyOtp; if (btn) {
  btn.disabled = false; // allow click initially
} }
  if (timerEl) timerEl.innerText = formatTimerDisplay(time);

  otpCountdown = setInterval(() => {

    time--;
    if (timerEl) timerEl.innerText = formatTimerDisplay(time);

    if (time <= 0) {
      clearInterval(otpCountdown);
      if (btn) { btn.innerText = "Resend OTP"; btn.onclick = resendOtp; btn.disabled = false; }
    }

  }, 1000);

}

/* Formats seconds as mm:ss for display */
function formatTimerDisplay(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

async function resendOtp() {

  /* Clear all digit boxes before resending */
  document.querySelectorAll(".otp-digit").forEach(i => i.value = "");

  await sendOtp();

}



/* ============================================================
   verifyOtp()
   Reads the 6-digit OTP boxes, sends to /api/verify-otp.
   On success: saves OTP session, hides modal, opens viewer.
   On failure: shows shake animation and result step error.
   ============================================================ */
async function verifyOtp() {

    /* Concatenate all 6 digit box values */
    let otp = "";
    document.querySelectorAll(".otp-digit")
        .forEach(i => otp += i.value);

    /* Require 6 digits */
    if (otp.length < 6) {
      const errEl = document.getElementById("verifyError");
      if (errEl) errEl.textContent = "Please enter the full OTP.";
      return;
    }

    try {

        const res = await fetch("/api/verify-otp", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ mobile: currentMobile, otp })
        });

        const data = await res.json();

        if (!data.success) {

            /* Shake the OTP boxes to signal wrong code */
            const boxes = document.querySelector(".otp-boxes");
            if (boxes) {
              boxes.classList.add("shake");
              setTimeout(() => boxes.classList.remove("shake"), 420);
            }

            /* Show error in result step */
            showStep("resultStep");

            const icon = document.getElementById("resultIcon");
            if (icon) icon.innerHTML = '<i class="fa fa-times-circle" style="color:#ef4444;font-size:40px;"></i>';

            const title = document.getElementById("resultTitle");
            if (title) title.textContent = "Wrong OTP";

            const msg = document.getElementById("resultMessage");
            if (msg) msg.textContent = "The code you entered is incorrect. Please try again.";

            return;
        }

        /* Re-check block status after verification */
        const check = await fetch("/api/users/check-block", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ mobile: currentMobile })
        });

        const blockData = await check.json();

        if (blockData.blocked) {

            sessionStorage.clear();

            showStep("resultStep");

            const icon = document.getElementById("resultIcon");
            if (icon) icon.innerHTML = '<i class="fa fa-ban" style="color:#ef4444;font-size:40px;"></i>';

            const title = document.getElementById("resultTitle");
            if (title) title.textContent = "Access Blocked";

            const msg = document.getElementById("resultMessage");
            if (msg) msg.textContent = "Your access has been blocked by the admin.";

            return;
        }

        /* SUCCESS: store session and open viewer */
        sessionStorage.setItem("otpVerified", "true");
        sessionStorage.setItem("otpTime",     Date.now());
        sessionStorage.setItem("verifiedMobile", currentMobile);
        const token = btoa(currentMobile + ":" + Date.now());
        sessionStorage.setItem("authToken", token);

        /* Show success result briefly, then open viewer */
        showStep("resultStep");

        const icon = document.getElementById("resultIcon");
        if (icon) icon.innerHTML = '<i class="fa fa-check-circle" style="color:#10b981;font-size:40px;"></i>';

        const title = document.getElementById("resultTitle");
        if (title) title.textContent = "Verified!";

        const msg = document.getElementById("resultMessage");
        if (msg) msg.textContent = "OTP verified. Opening your file...";

        setTimeout(() => {
            closeOtpModal();
            openViewer();
        }, 1400);

    } catch (err) {

        /* Show server error in modal instead of alert() */
        showStep("resultStep");

        const icon = document.getElementById("resultIcon");
        if (icon) icon.innerHTML = '<i class="fa fa-exclamation-triangle" style="color:#f59e0b;font-size:40px;"></i>';

        const title = document.getElementById("resultTitle");
        if (title) title.textContent = "Server Error";

        const msg = document.getElementById("resultMessage");
        if (msg) msg.textContent = "Something went wrong. Please try again.";

    }

}


/* ============================================================
   closeOtpModal()
   Hides the OTP verification modal and resets all step state.
   ============================================================ */
function closeOtpModal() {

  const modal = document.getElementById("otpModal");
  if (modal) modal.classList.remove("open");

  /* Reset all steps back to mobileStep for next open */
  showStep("mobileStep");

  /* Clear any error messages */
  ["sendError", "verifyError"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  });

  /* Clear OTP digit boxes */
  document.querySelectorAll(".otp-digit").forEach(d => d.value = "");

  /* Stop the countdown timer */
  clearInterval(otpCountdown);

}


/* ============================================================
   closeViewer()
   Hides the file viewer modal and clears its content.
   ============================================================ */
function closeViewer() {

  const overlay = document.getElementById("viewerModal");
  if (overlay) overlay.classList.remove("open");

  /* Clear rendered content to stop PDF rendering / video playback */
  const content = document.getElementById("viewerContent");
  if (content) content.innerHTML = "";

  /* Hide watermark */
  const wm = document.getElementById("watermarkOverlay");
  if (wm) wm.style.display = "none";

}

/* ================= RETRY OTP ================= */
function retryOtp(){

showStep("otpStep");

document.querySelectorAll(".otp-boxes input")
.forEach(i => i.value="");

document.querySelector(".otp-boxes input").focus();

}

function initPhoneInput(){

  const phoneInput = document.querySelector("#mobileInput");

  if(!phoneInput || !window.intlTelInput) return;

  window.iti = window.intlTelInput(phoneInput,{
    initialCountry:"in",
    separateDialCode:true,
    preferredCountries:["in","us","gb"],
    utilsScript:"https://cdn.jsdelivr.net/npm/intl-tel-input@18.1.1/build/js/utils.js"
  });

}
/* ============================================================
   loadPDF(url)
   Renders a PDF file page-by-page onto HTML canvas elements.
   Uses PDF.js. Scale is increased by 15% on large screens.
   ============================================================ */
async function loadPDF(url) {

  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  if (!pdfjsLib) return;

  /* IMPORTANT: set worker */
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const loadingTask = pdfjsLib.getDocument(url);
  const pdf = await loadingTask.promise;

  const container = document.getElementById("viewerContent");
  if (!container) return;

  container.innerHTML = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {

    const page = await pdf.getPage(pageNum);
    const scale = window.innerWidth < 768 ? 1.2 : 1.5;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    container.appendChild(canvas);

    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;
  }
}

/* ============================================================
   openViewer()
   Opens the file viewer modal for the selected file.
   - Logs the view event to the server
   - Shows or hides the download button based on file importance
   - Renders the file: PDF via canvas, images as <img>, Word via iframe
   ============================================================ */
function openViewer() {

  let file = files[selectedFileIndex];
  if (!file) return;

  saveViewLog(file.name);

  /* Use CSS class approach (matches user.css .viewer-overlay.open) */
  document.getElementById("viewerModal").classList.add("open");

  const container = document.getElementById("viewerContent");
  if (!container) return;
  container.innerHTML = "";

  /* Set file name in viewer header */
  const fileNameEl = document.getElementById("viewerFileName");
  if (fileNameEl) fileNameEl.textContent = file.name.replace(/\.[^.]+$/, "");

const token = sessionStorage.getItem("authToken") || "";
  if (!token) {
  alert("Session expired. Please verify OTP again.");
  return;
}
const fileUrl = `/secure-files/${file.name}?token=${token}`;
  const ext = file.name.split(".").pop().toLowerCase();

  const downloadBtn = document.getElementById("downloadBtn");

  /* CONTROL DOWNLOAD BUTTON */
  if (file.importance === "important") {
    if (downloadBtn) downloadBtn.style.display = "none";
  } else {
    if (downloadBtn) {
      downloadBtn.style.display = "flex";
      downloadBtn.onclick = function() {
        const link = document.createElement("a");
        link.href = "/secure-files/download/" + file.name + "?token=" + token;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        saveDownloadLog(file.name);
      };
    }
  }

  /* Show watermark */
  const wm = document.getElementById("watermarkOverlay");
  if (wm) wm.style.display = "block";

  /* FILE VIEWER */
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
    iframe.src =
      "https://view.officeapps.live.com/op/embed.aspx?src=" +
      encodeURIComponent(window.location.origin + fileUrl);
    iframe.style.width = "100%";
    iframe.style.height = "85vh";
    iframe.style.border = "none";
    container.appendChild(iframe);
  }
}

document.addEventListener("keydown", function(e) {

  const viewer = document.getElementById("viewerModal");
  if (!viewer || !viewer.classList.contains("open")) return;

  if (
    (e.ctrlKey && e.key === "s") ||
    (e.ctrlKey && e.key === "p") ||
    (e.ctrlKey && e.key === "u")
  ) {
    e.preventDefault();
  }

  if (e.key === "PrintScreen") {
    navigator.clipboard.writeText("Screenshot blocked").catch(() => {});
  }

});

document.addEventListener("keyup", function(e) {
  if (e.key === "PrintScreen") {
    /* Clear clipboard capture attempt */
    navigator.clipboard.writeText("").catch(() => {});
  }
});
/* ================= OTP SESSION ================= */
function isOtpValid() {
    let t = sessionStorage.getItem("otpTime");
    if (!t) return false;
    return Date.now() - t < OTP_SESSION_TIME;
}


function getFileFromURL() {
  let params = new URLSearchParams(window.location.search);
  return params.get("file");
}

/* ============================================================
   saveViewLog(fileName) / saveDownloadLog(fileName)
   Called when a user opens or downloads a file.
   Fetches the user's location via ipwho.is then posts to the server.
   ============================================================ */
async function saveViewLog(fileName) {

  let name = document.getElementById("userName")?.value || "Unknown";
  let mobile = sessionStorage.getItem("verifiedMobile") || currentMobile || "Unknown";

  if(mobile === "Unknown") return;

  let logs = JSON.parse(localStorage.getItem("viewLogs")) || [];

  // Get location from free API
  let location = { country: "-", region: "-", ip: "Auto" };
  try {
      const res = await fetch("https://ipwho.is/");
      if (res.ok) {
          const data = await res.json();
          location.country = data.country || "-";
          location.region = data.region || "-";
          location.ip = data.ip || "Auto";
      }
  } catch (err) {
      console.log("Failed to fetch location", err);
  }

  logs.push({
      file: fileName,
      name: name,
      mobile: mobile,
      ip: location.ip,
      country: location.country,
      state: location.region,
      time: new Date().toLocaleString(),
      device: navigator.userAgent
  });

  localStorage.setItem("viewLogs", JSON.stringify(logs));

  fetch("/api/save-view",{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      file:fileName,
      name:name,
      mobile:mobile,
      ip:location.ip,
      country:location.country,
      state:location.region,
      device:navigator.userAgent
    })
  });
}

async function saveDownloadLog(fileName) {

  let name = document.getElementById("userName")?.value || "Unknown";
  let mobile = sessionStorage.getItem("verifiedMobile") || currentMobile || "Unknown";

  if (mobile === "Unknown") return;

  let location = { country: "-", region: "-", ip: "Auto" };
  try {
      const res = await fetch("https://ipwho.is/");
      if (res.ok) {
          const data = await res.json();
          location.country = data.country || "-";
          location.region = data.region || "-";
          location.ip = data.ip || "Auto";
      }
  } catch (err) {
      console.log("Failed to fetch location", err);
  }

  fetch("/api/save-download",{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      file: fileName,
      name: name,
      mobile: mobile,
      ip: location.ip,
      country: location.country,
      state: location.region,
      device: navigator.userAgent
    })
  });
}

/* ================= BLOCK RIGHT CLICK ================= */
document.addEventListener("contextmenu", function(e) {
  const viewer = document.getElementById("viewerModal");
  if (viewer && viewer.classList.contains("open")) {
    e.preventDefault();
  }
});


/* ============================================================
   checkIfBlocked()
   Periodically checks if the current user has been blocked.
   Called every 30 seconds. If blocked: clears session and reloads.
   ============================================================ */
function checkIfBlocked() {

    let mobile =
        sessionStorage.getItem("verifiedMobile") || currentMobile;

    if (!mobile) return;

    fetch("/api/users/check-block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile })
    })
    .then(res => res.json())
    .then(data => {

        if (data.blocked) {
            alert("Your access has been blocked by admin.");

            sessionStorage.clear();
            location.reload();
        }

    });
}

/* Blur viewer when tab hidden */
document.addEventListener("visibilitychange", function () {

  let viewer = document.getElementById("viewerModal");
  if (!viewer) return;

  if (document.hidden) {
    viewer.style.filter = "blur(10px)";
  } else {
    viewer.style.filter = "none";
  }
});

/* ============================================================
   DOMContentLoaded — Initialize everything when page is ready
   ============================================================ */
window.addEventListener("DOMContentLoaded", () => {

  loadFiles();
  initPhoneInput();

  /* Keyboard shortcut block */
  document.addEventListener("keydown", function(e) {
    if (e.ctrlKey && e.shiftKey && e.key === "C") e.preventDefault();
  });

  /* Enter key submission for OTP form inputs */
  const mobileInput = document.getElementById("mobileInput");
  if (mobileInput) mobileInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendOtp();
  });

  const nameInput = document.getElementById("userName");
  if (nameInput) nameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendOtp();
  });

  /* OTP digit boxes — auto-advance and backspace support */
  const otpBoxes = document.querySelectorAll(".otp-digit");
  otpBoxes.forEach((box, i, arr) => {

    box.addEventListener("input", () => {
      if (box.value && arr[i + 1]) arr[i + 1].focus();

      let otp = "";
      arr.forEach(input => otp += input.value);

      const btn = document.getElementById("verifyBtn");
      if (btn) {
        btn.disabled = otp.length < 6;
      }
    });

    box.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !box.value && arr[i - 1]) {
        arr[i - 1].focus();
      }
    });

  });

});


function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag])
  );
}

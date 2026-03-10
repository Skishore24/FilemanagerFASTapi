let files = [];

async function loadFiles(){
  try{
    let res = await fetch("/api/files");
    files = await res.json();
    renderFiles();

    // open file after files loaded
    openFileFromURL();

  }catch(err){
    console.log("Error loading files", err);
  }
}
function openFileFromURL(){

  let fileFromURL = getFileFromURL();
  if(!fileFromURL) return;

  selectedFileIndex = files.findIndex(
    f => f.name === fileFromURL
  );

  if(selectedFileIndex !== -1){

    selectedFileName = fileFromURL;

    document.getElementById("otpModal").style.display = "flex";
    document.getElementById("mobileStep").style.display = "block";
    document.getElementById("otpStep").style.display = "none";
    document.getElementById("resultStep").style.display = "none";
  }
}


let selectedFileIndex = null;
let selectedFileName = null;
let categoryFilter = "All";
let currentMobile = "";

const OTP_SESSION_TIME = 10 * 60 * 1000;

/* ================= RENDER FILES ================= */
function renderFiles() {
    let container = document.getElementById("files");
    let searchBox = document.getElementById("search");

    if (!container || !searchBox) return;

    let search = searchBox.value.toLowerCase();
    container.innerHTML = "";

    files
        .filter(f =>
            f.name.toLowerCase().includes(search) &&
            (categoryFilter === "All" || f.category === categoryFilter)
        )
        .forEach((file, index) => {
            container.innerHTML += `
      <div class="card">
        <h4>${file.name}</h4>
        <small>${file.category}</small>
        <button onclick="viewFile(${index})">View</button>
      </div>`;
        });
}

async function loadCategoriesToFilter() {

  let res = await fetch("/api/categories");
  let categories = await res.json();

  let select = document.getElementById("filterCategory");
  select.innerHTML = `<option value="All">All Categories</option>`;

  categories.forEach(cat=>{
    select.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
  });
}


/* ================= FILTER ================= */
function changeFilter() {
    categoryFilter = document.getElementById("filterCategory").value;
    renderFiles();
}

function downloadFile(file) {

    window.open(file.url);

    let downloadLogs = JSON.parse(localStorage.getItem("downloadLogs")) || [];

    downloadLogs.push({
        file: file.name,
        date: new Date().toLocaleDateString()
    });

    localStorage.setItem("downloadLogs", JSON.stringify(downloadLogs));
}

/* ================= VIEW FILE (NORMAL) ================= */
async function viewFile(index) {

    selectedFileIndex = index;
    selectedFileName = files[index].name;

    let mobile =
        sessionStorage.getItem("verifiedMobile") || currentMobile;

    if (mobile) {
        let res = await fetch("/api/users/check-block", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mobile })
        });

        let data = await res.json();

        if (data.blocked) {
            alert("Your access has been blocked by admin.");
            return;
        }
    }

    if (isOtpValid()) {
        openViewer();
    } else {
        document.getElementById("otpModal").style.display = "flex";
        document.getElementById("mobileStep").style.display = "block";
        document.getElementById("otpStep").style.display = "none";
        document.getElementById("resultStep").style.display = "none";
    }
}


/* ================= SEND OTP ================= */
async function sendOtp() {

    let name = document.getElementById("userName").value;

    if (!name) {
        alert("Enter name");
        return;
    }

    if (!window.iti || !iti.isValidNumber()) {
        alert("Invalid number");
        return;
    }

    currentMobile = iti.getNumber();

    try {

        let res = await fetch("/api/send-otp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mobile: currentMobile })
        });

        let data = await res.json();

        if (data.success) {

            // CHECK BLOCK AFTER OTP SEND
            let check = await fetch("/api/users/check-block", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mobile: currentMobile })
            });

            let blockData = await check.json();

            if (blockData.blocked) {
                alert("Your access has been blocked by admin.");
                sessionStorage.clear();
                location.reload();
                return;
            }

            // SHOW OTP BOX
            document.getElementById("mobileStep").style.display = "none";
            document.getElementById("otpStep").style.display = "block";

        } else {
            alert("OTP send failed");
        }

    } catch (err) {
        alert("Server error while sending OTP");
    }
}


/* ================= VERIFY OTP ================= */
async function verifyOtp() {

    let otp = "";
    document.querySelectorAll(".otp-boxes input")
        .forEach(i => otp += i.value);

    if (otp.length !== 4) {
        alert("Enter 4 digit OTP");
        return;
    }

    try {

        let res = await fetch("/api/verify-otp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mobile: currentMobile, otp })
        });

        let data = await res.json();

        if (!data.success) {
            // Wrong OTP UI
            let card = document.querySelector(".otp-card");
            card.classList.add("shake");

            setTimeout(() => card.classList.remove("shake"), 400);

            document.getElementById("resultIcon").className = "result-icon error";
            document.getElementById("resultTitle").innerText = "Oops!";
            document.getElementById("resultMessage").innerText = "Wrong OTP. Try again.";
            document.getElementById("resultButton").style.display = "block";

            document.getElementById("otpStep").style.display = "none";
            document.getElementById("resultStep").style.display = "block";
            return;
        }

        // CHECK BLOCK AFTER VERIFY
        let check = await fetch("/api/users/check-block", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mobile: currentMobile })
        });

        let blockData = await check.json();

        if (blockData.blocked) {
            alert("Your access has been blocked by admin.");
            sessionStorage.clear();
            location.reload();
            return;
        }

        // SUCCESS UI
        sessionStorage.setItem("otpVerified", "true");
        sessionStorage.setItem("otpTime", Date.now());
        sessionStorage.setItem("verifiedMobile", currentMobile);

        document.getElementById("resultIcon").className = "result-icon success";
        document.getElementById("resultTitle").innerText = "Success!";
        document.getElementById("resultMessage").innerText = "OTP verified successfully.";
        document.getElementById("resultButton").style.display = "none";

        document.getElementById("otpStep").style.display = "none";
        document.getElementById("resultStep").style.display = "block";

        setTimeout(() => {
            document.getElementById("otpModal").style.display = "none";
            openViewer();
        }, 1500);

    } catch (err) {
        alert("Server error");
    }
}

/* ================= RETRY OTP ================= */
function retryOtp() {
    document.getElementById("resultStep").style.display = "none";
    document.getElementById("otpStep").style.display = "block";
    document.querySelectorAll(".otp-boxes input").forEach(i => i.value = "");
}

function closeOtp() {
    document.getElementById("otpModal").style.display = "none";
}



window.addEventListener("load", () => {
  loadFiles();
  loadCategoriesToFilter();
    initPhoneInput();
});

function initPhoneInput(){

  let phoneInput = document.querySelector("#mobileInput");
  if(!phoneInput) return;

  if(window.intlTelInput){
    window.iti = window.intlTelInput(phoneInput, {
      initialCountry: "in",
      nationalMode: false,
      separateDialCode: true,
      autoPlaceholder: "aggressive",
      preferredCountries: ["in","us","gb"],
      utilsScript:
        "https://cdn.jsdelivr.net/npm/intl-tel-input@18.1.1/build/js/utils.js"
    });
  }
}
async function loadPDF(url) {

  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const loadingTask = pdfjsLib.getDocument(url);
  const pdf = await loadingTask.promise;

  const container = document.getElementById("pdfContainer");
  container.innerHTML = "";

  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;

  const isLaptop = window.innerWidth > 900; // detect large screen

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });

    const scaleX = containerWidth / viewport.width;
    const scaleY = containerHeight / viewport.height;

    let scale = Math.min(scaleX, scaleY);

    // 🔥 Increase size only for laptop
    if (isLaptop) {
      scale = scale * 1.15;   // increase 15%
    }

    const scaledViewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;

    canvas.style.display = "block";
    canvas.style.margin = "20px auto";

    container.appendChild(canvas);

    await page.render({
      canvasContext: context,
      viewport: scaledViewport
    }).promise;
  }
}
function openViewer() {

  let file = files[selectedFileIndex];
  if (!file) return;

  saveViewLog(file.name);

  document.getElementById("viewerModal").style.display = "flex";

  const container = document.getElementById("pdfContainer");
  container.innerHTML = "";

  const fileUrl = "/secure-files/" + file.name;
  const ext = file.name.split('.').pop().toLowerCase();

  // ===== PDF =====
  if (ext === "pdf") {
      loadPDF(fileUrl);
  }

  // ===== IMAGE =====
  else if (["jpg","jpeg","png","webp"].includes(ext)) {

      const img = document.createElement("img");
      img.src = fileUrl;
      img.style.width = "100%";
      img.style.maxHeight = "85vh";
      img.style.objectFit = "contain";

      container.appendChild(img);
  }

  // ===== DOC / DOCX =====
  else if (["doc","docx"].includes(ext)) {

      const iframe = document.createElement("iframe");
      iframe.src =
        "https://view.officeapps.live.com/op/embed.aspx?src=" +
        encodeURIComponent(window.location.origin + fileUrl);

      iframe.style.width = "100%";
      iframe.style.height = "85vh";
      iframe.style.border = "none";

      container.appendChild(iframe);
  }

  // ===== OTHER FILES =====
  else {
      container.innerHTML =
        "<p style='padding:20px'>Preview not supported. Please download.</p>";
  }
}
document.addEventListener("keydown", function(e) {

  if (document.getElementById("viewerModal").style.display !== "flex") return;

  // Disable Ctrl+S, Ctrl+P, Ctrl+U
  if (
    (e.ctrlKey && e.key === "s") ||
    (e.ctrlKey && e.key === "p") ||
    (e.ctrlKey && e.key === "u")
  ) {
    e.preventDefault();
  }

  // Disable PrintScreen
  if (e.key === "PrintScreen") {
    navigator.clipboard.writeText("");
    alert("Screenshot disabled");
  }
});

function closeViewer() {
    document.getElementById("viewerModal").style.display = "none";
    document.getElementById("pdfContainer").innerHTML = "";
}
/* ================= OTP SESSION ================= */
function isOtpValid() {
    let t = sessionStorage.getItem("otpTime");
    if (!t) return false;
    return Date.now() - t < OTP_SESSION_TIME;
}

/* ================= OTP INPUT AUTO ================= */
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".otp-boxes input")
        .forEach((box, i, arr) => {

            box.addEventListener("input", () => {
                if (box.value && arr[i + 1]) arr[i + 1].focus();

                let otp = "";
                arr.forEach(i => otp += i.value);
                if (otp.length === 4) verifyOtp();
            });

            box.addEventListener("keydown", (e) => {
                if (e.key === "Backspace" && !box.value && arr[i - 1]) {
                    arr[i - 1].focus();
                }
            });

        });
    loadCategoriesToFilter();
    renderFiles();
});
function getFileFromURL() {
  let params = new URLSearchParams(window.location.search);
  return params.get("file");
}

async function saveViewLog(fileName) {

  let name = document.getElementById("userName")?.value || "Unknown";
  let mobile = sessionStorage.getItem("verifiedMobile") || currentMobile || "Unknown";

  if(mobile === "Unknown") return;

  let logs = JSON.parse(localStorage.getItem("viewLogs")) || [];

  // Get location from free API
  let location = { country: "-", region: "-" };

  try {
    let res = await fetch("https://ipapi.co/json/");
    let data = await res.json();

    location.country = data.country_code || "-";
    location.region = data.region || "-";
  } catch(e){
    console.log("Location fetch failed");
  }

  logs.push({
      file: fileName,
      name: name,
      mobile: mobile,
      ip: "Auto",
      country: location.country,
      state: location.region,
      time: new Date().toLocaleString(),
      device: navigator.userAgent
  });

fetch("/api/save-view",{
  method:"POST",
  headers:{ "Content-Type":"application/json" },
  body: JSON.stringify({
    file:fileName,
    name:name,
    mobile:mobile,
    ip:"Auto",
    country:location.country,
    state:location.region,
    device:navigator.userAgent
  })
});
}


function getDeviceInfo() {
    return navigator.userAgent;
}

function getDeviceId() {
    let id = localStorage.getItem("deviceId");
    if (!id) {
        id = "DEV-" + Math.random().toString(36).substr(2, 9);
        localStorage.setItem("deviceId", id);
    }
    return id;
}

/* ================= BLOCK RIGHT CLICK ================= */
document.addEventListener("contextmenu", function(e) {
    if (document.getElementById("viewerModal").style.display === "flex") {
        e.preventDefault();
    }
});


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


setInterval(() => {
  let mobile = sessionStorage.getItem("verifiedMobile");
  if (mobile) checkIfBlocked();
}, 3000);

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
setInterval(() => {

  let mobile = sessionStorage.getItem("verifiedMobile");
  if(!mobile) return;

  fetch("/api/users/heartbeat", {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ mobile })
  });

}, 5000);

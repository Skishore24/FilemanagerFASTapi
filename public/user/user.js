let otpCountdown;
let files = [];
function showStep(step){

document.getElementById("mobileStep").style.display="none";
document.getElementById("otpStep").style.display="none";
document.getElementById("resultStep").style.display="none";

document.getElementById(step).style.display="block";

}

async function loadFiles(){
  try{

    let res = await fetch("/api/files");

    if(!res.ok){
    let text = await res.text();
    console.error("Server error:", text);
    return;
    }

    files = await res.json();

    console.log("FILES:", files); // debug

    renderFiles();

    // open file after files loaded
    if(files.length > 0){
    openFileFromURL();
    }

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

    showStep("mobileStep");   // IMPORTANT
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
let search = searchBox ? searchBox.value.toLowerCase() : "";
  container.innerHTML = "";

    if(files.length === 0){
    container.innerHTML = "<p>No files available</p>";
    return;
    }

  files
  .filter(file =>
      (categoryFilter === "All" || file.category === categoryFilter) &&
      file.name.toLowerCase().includes(search)
  )
  .forEach((file,index)=>{

    container.innerHTML += `
      <div class="card">
        <h4>${file.name}</h4>
        <small>${file.category}</small>
        <button class="viewBtn" data-index="${index}">View</button>
      </div>
    `;

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

    const mobile = sessionStorage.getItem("verifiedMobile") || "Unknown";

window.open("/secure-files/" + file.name + "?mobile=" + mobile);

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

    // check if user blocked
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

    /* ⭐ OTP SESSION CHECK */

    if (isOtpValid()) {

        console.log("OTP still valid → open viewer");
        openViewer();

    } else {

        console.log("OTP expired → ask OTP");

        document.getElementById("otpModal").style.display = "flex";
        showStep("mobileStep");
    }

}

/* ================= SEND OTP ================= */
async function sendOtp(){

let name = document.getElementById("userName").value.trim();

if(name === ""){
showMessage("Please enter your name");
document.getElementById("userName").focus();
return;
}

if(!window.iti || !iti.isValidNumber()){
showMessage("Please enter a valid mobile number");
document.getElementById("mobileInput").focus();
return;
}

currentMobile = iti.getNumber();

try{

let res = await fetch("/api/send-otp",{
method:"POST",
headers:{ "Content-Type":"application/json" },
body:JSON.stringify({ mobile:currentMobile })
});

let data = await res.json();

if(data.success){

showStep("otpStep");
startOtpTimer();
document.querySelectorAll(".otp-boxes input")
.forEach(i => i.value="");
document.getElementById("verifyOtpBtn").disabled = true;
document.querySelector(".otp-boxes input").focus();

}else{
showMessage("Failed to send OTP");
}

}catch(err){
showMessage("Server error");
}

}

function startOtpTimer(){

clearInterval(otpCountdown);

let time = 120;

const timerEl = document.getElementById("timer");
const btn = document.getElementById("verifyOtpBtn");

btn.innerText = "Verify";
btn.onclick = verifyOtp;
btn.disabled = true;
timerEl.innerText = time;

otpCountdown = setInterval(()=>{

time--;

timerEl.innerText = time;

if(time <= 0){

clearInterval(otpCountdown);

btn.innerText = "Resend OTP";
btn.onclick = resendOtp;
btn.disabled = false;

}

},1000);

}
async function resendOtp(){

document.querySelectorAll(".otp-boxes input")
.forEach(i => i.value="");

await sendOtp();

}



/* ================= VERIFY OTP ================= */
async function verifyOtp() {

    let otp = "";
    document.querySelectorAll(".otp-boxes input")
        .forEach(i => otp += i.value);

    if(otp.length !== 4){

      document.getElementById("otpError").style.display="block";

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
            document.getElementById("otpError").style.display="none";
            document.getElementById("resultIcon").className = "result-icon error";
            document.getElementById("resultTitle").innerText = "Oops!";
            document.getElementById("resultMessage").innerText = "Wrong OTP. Try again.";
            document.getElementById("resultButton").style.display = "block";

            showStep("resultStep");
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
function retryOtp(){

showStep("otpStep");

document.querySelectorAll(".otp-boxes input")
.forEach(i => i.value="");

document.querySelector(".otp-boxes input").focus();

}

function closeOtp(){

 document.getElementById("otpModal").style.display = "none";

 clearInterval(otpCountdown);

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

  const mobile = sessionStorage.getItem("verifiedMobile") || "Unknown";
const fileUrl = "/secure-files/" + file.name + "?mobile=" + mobile;
  const ext = file.name.split(".").pop().toLowerCase();

  const downloadBtn = document.getElementById("downloadBtn");

  /* CONTROL DOWNLOAD BUTTON */

  if(file.importance === "important"){   // VIEW ONLY

    downloadBtn.style.display = "none";

  }else{                                 // VIEW + DOWNLOAD

    downloadBtn.style.display = "block";

    downloadBtn.onclick = function(){

      const link = document.createElement("a");
      link.href = fileUrl;
      link.download = file.name;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    };

  }

  /* FILE VIEWER */

  if (ext === "pdf") {
    loadPDF(fileUrl);
  }

  else if (["jpg","jpeg","png","webp"].includes(ext)) {

    const img = document.createElement("img");
    img.src = fileUrl;
    img.style.width = "100%";
    img.style.maxHeight = "85vh";
    img.style.objectFit = "contain";

    container.appendChild(img);
  }

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
console.log("Opening viewer:", file);
}
document.addEventListener("keydown", function(e){

 if (document.getElementById("viewerModal").style.display !== "flex") return;

 if(
  (e.ctrlKey && e.key === "s") ||
  (e.ctrlKey && e.key === "p") ||
  (e.ctrlKey && e.key === "u")
 ){
  e.preventDefault();
 }

 if(e.key==="PrintScreen"){
  navigator.clipboard.writeText("Screenshot blocked");
  alert("Screenshot disabled");
 }

});

document.addEventListener("keyup",function(e){
 if(e.key==="PrintScreen"){
  alert("Screenshot disabled");
 }
});


function closeViewer() {

  const viewer = document.getElementById("viewerModal");
  const container = document.getElementById("pdfContainer");

  if(viewer){
    viewer.style.display = "none";
  }

  if(container){
    container.innerHTML = "";
  }

}
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

async function saveViewLog(fileName) {

  let name = document.getElementById("userName")?.value || "Unknown";
  let mobile = sessionStorage.getItem("verifiedMobile") || currentMobile || "Unknown";

  if(mobile === "Unknown") return;

  let logs = JSON.parse(localStorage.getItem("viewLogs")) || [];

  // Get location from free API
let location = { country:"-", region:"-" };

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

function showMessage(text,type="error"){

const msg = document.getElementById("uiMessage") || document.getElementById("mobileMessage");

if(!msg) return;
  msg.innerText = text;
  msg.className = "ui-message " + type;
  msg.style.display = "block";

  setTimeout(()=>{
    msg.style.display="none";
  },3000);
}
setInterval(() => {
  let mobile = sessionStorage.getItem("verifiedMobile");
  if (mobile) checkIfBlocked();
}, 30000);

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

}, 60000);
window.addEventListener("DOMContentLoaded", () => {

  loadFiles();
  loadCategoriesToFilter();
  initPhoneInput();

  document.getElementById("search").addEventListener("keyup", renderFiles);
  document.getElementById("filterCategory").addEventListener("change", changeFilter);
  document.getElementById("closeOtpBtn").onclick = closeOtp;
  document.getElementById("sendOtpBtn").onclick = sendOtp;
  document.getElementById("verifyOtpBtn").onclick = verifyOtp;
  document.getElementById("resultButton").onclick = retryOtp;
  document.getElementById("closeViewerBtn").onclick = closeViewer;
  document.addEventListener("keydown",function(e){
    if(e.ctrlKey && e.shiftKey && e.key==="C"){
    e.preventDefault();
    }
    });
      document.getElementById("mobileInput").addEventListener("keypress",(e)=>{
    if(e.key==="Enter") sendOtp();
    });

const nameInput = document.getElementById("userName");

if(nameInput){
nameInput.addEventListener("keypress",(e)=>{
if(e.key==="Enter") sendOtp();
});
}

  document.addEventListener("click", function(e) {
    if (e.target.classList.contains("viewBtn")) {
      const index = e.target.dataset.index;
      viewFile(index);
    }
  });

  // OTP auto input
  document.querySelectorAll(".otp-boxes input")
.forEach((box, i, arr) => {

  box.addEventListener("input", () => {

    document.getElementById("otpError").style.display = "none";

    if (box.value && arr[i + 1]) arr[i + 1].focus();

    let otp="";
    arr.forEach(input => otp += input.value);

    const btn = document.getElementById("verifyOtpBtn");

    if(otp.length === 4){
      btn.disabled = false;
      btn.focus();
    }else{
      btn.disabled = true;
    }

  });

  box.addEventListener("keydown",(e)=>{
    if(e.key==="Backspace" && !box.value && arr[i-1]){
      arr[i-1].focus();
    }
  });

});

  });


let devtoolsOpen = false;

setInterval(() => {

 const threshold = 160;

 if (window.outerWidth - window.innerWidth > threshold ||
     window.outerHeight - window.innerHeight > threshold) {

   if(!devtoolsOpen){
     console.clear();
    console.warn("Developer tools detected");
     devtoolsOpen = true;
   }

 } else {
   devtoolsOpen = false;
 }

},1000);
document.addEventListener("keydown",function(e){

 if(
  e.key === "F12" ||
  (e.ctrlKey && e.shiftKey && e.key === "I") ||
  (e.ctrlKey && e.shiftKey && e.key === "J")
 ){
  e.preventDefault();

  if(!devtoolsOpen){
  alert("Developer tools blocked");
  }

 }

});


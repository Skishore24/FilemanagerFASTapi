let selectedMobile = "";
let currentPage = 1;
let rowsPerPage = 10;
let selectedLogIndex = null;
let confirmType = "";
let totalPages = 1;
let previousModal = "";
let sortOrder = "newest";
let logsData = [];

function sortLogs(order){
  sortOrder = order;
  showLogs();
}
let token = localStorage.getItem("token");

if(!token){
  window.location.href = "/admin/login.html";
}


function getFileIcon(fileName) {

  if (!fileName) return "fa-file";

  fileName = fileName.toLowerCase();

  if (fileName.endsWith(".pdf")) return "fa-file-pdf";
  if (fileName.endsWith(".doc") || fileName.endsWith(".docx")) return "fa-file-word";
  if (fileName.endsWith(".xls") || fileName.endsWith(".xlsx")) return "fa-file-excel";
  if (fileName.endsWith(".ppt") || fileName.endsWith(".pptx")) return "fa-file-powerpoint";
  if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg") || fileName.endsWith(".png")) return "fa-file-image";
  if (fileName.endsWith(".zip") || fileName.endsWith(".rar")) return "fa-file-archive";

  return "fa-file";
}
async function showLogs(){

let search = document.getElementById("searchLogs").value || "";
let date = document.getElementById("filterDate")?.value || "";
let category = document.getElementById("modalCategory")?.value || "All";

let res = await fetch(
`/api/logs?search=${search}&page=${currentPage}&sort=${sortOrder}&date=${date}&category=${category}`
);

if(!res.ok){
  alert("Failed to load logs");
  return;
}

let data = await res.json();

logsData = data.logs;
totalPages = data.totalPages || 1;

document.getElementById("pageInfo").innerText =
 "Page " + currentPage + " of " + totalPages;

let table = document.getElementById("logTable");
table.innerHTML="";

logsData.forEach((log,index)=>{

table.innerHTML += `

<tr>

<td data-label="Select">
<input type="checkbox"
class="logCheck"
data-index="${index}"
onchange="updateBulkLogActions()">
</td>

<td data-label="File">
<div class="file-cell">
<i class="fa-regular ${getFileIcon(log.file_name)}"></i>
<span>${log.file_name || "-"}</span>
</div>
</td>

<td data-label="Name">
${log.name || "-"}
</td>

<td data-label="Number">
${log.mobile || "-"}
</td>

<td data-label="IP">
${log.ip || "-"}
</td>

<td data-label="Viewed At">
${formatDateTime(log.viewed_at)}
</td>

<td data-label="Action">
<button class="view-btn"
onclick="openLogDetails(${index})">
View
</button>
</td>

</tr>
`;

});

}
function nextPage(){
  if(currentPage < totalPages){
    currentPage++;
    showLogs();
  }
}



function prevPage(){
  if(currentPage>1){
    currentPage--;
    showLogs();
  }
}
document.getElementById("searchLogs").addEventListener("keyup", ()=>{
  currentPage = 1;
  showLogs();
});


function updateBulkLogActions() {

    let checked = document.querySelectorAll(".logCheck:checked").length;
    let panel = document.getElementById("bulkActionsLogs");

    if (checked > 0) {
        panel.style.display = "block";
    } else {
        panel.style.display = "none";
    }
}



function toggleSelectAllLogs() {
  let master = document.getElementById("selectAllLogs");
  let checks = document.querySelectorAll("#logTable .logCheck");

  checks.forEach(cb => {
    cb.checked = master.checked;
  });

  updateBulkLogActions();
}





/* Log Details */
function openLogDetails(index) {

  let log = logsData[index];
  if (!log) return;

  selectedMobile = log.mobile;
  selectedLogIndex = index;

  document.getElementById("detailFile").innerText = log.file_name;
  document.getElementById("detailMobile").innerText = log.mobile;
  document.getElementById("detailIP").innerText = log.ip || "-";
document.getElementById("detailTime").innerText = formatDateTime(log.viewed_at);
  document.getElementById("detailMAC").innerText = log.device || "-";
document.getElementById("logModal").classList.add("show");

}



function closeLogModal() {
document.getElementById("logModal").classList.remove("show");
}


async function deleteLog() {

  if (selectedLogIndex === null) return;

  let log = logsData[selectedLogIndex];
  if (!log) return;

  await fetch(`/api/logs/${log.id}`, {
    method: "DELETE"
  });

  closeLogModal();
  showLogs();
  openSuccessPopup("Log deleted successfully");
}

async function blockSelectedUsers(){

  let selected = getSelectedLogs();

  if(selected.length === 0){
    alert("Select logs first");
    return;
  }

  for (let i of selected){

    let mobile = logsData[i].mobile;

    if(!mobile) continue;

    await fetch("/api/users/block", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile })
    });
  }

 await showLogs();

document.getElementById("selectAllLogs").checked=false;
document.getElementById("bulkActionsLogs").style.display="none";

openSuccessPopup("Users blocked successfully");
}

async function blockSingleUser(){

  if(!selectedMobile) return;

  await fetch("/api/users/block", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mobile: selectedMobile })
  });

  closeLogModal();
  openSuccessPopup("User blocked successfully");
}



function closeBlockConfirm() {
    document.getElementById("blockConfirmModal").style.display = "none";
}

/* Blocked Users */
function openBlockedModal() {
document.getElementById("blockedModal").classList.add("show");
    showBlockedUsers();
}

function closeBlockedModal() {
document.getElementById("blockedModal").classList.remove("show");
}

async function showBlockedUsers(){

  let res = await fetch("/api/users/blocked");
  let blockedUsers = await res.json();

  let table = document.getElementById("blockedTable");
  table.innerHTML = "";

  if(blockedUsers.length === 0){
    table.innerHTML = "<tr><td colspan='2'>No blocked users</td></tr>";
    return;
  }

  blockedUsers.forEach(user=>{
    table.innerHTML += `
      <tr>
        <td>${user.mobile}</td>
        <td>
          <button class="view-btn" onclick="confirmUnblock('${user.mobile}')">
            Unblock
          </button>
        </td>
      </tr>
    `;
  });
}

function getSelectedLogs(){
  let checks = document.querySelectorAll(".logCheck:checked");
  let selected = [];

  checks.forEach(cb => {
    selected.push(parseInt(cb.dataset.index));
  });

  return selected;
}


function unblockUser(index) {

    let blockedUsers = JSON.parse(localStorage.getItem("blockedUsers")) || [];
    let mobile = blockedUsers[index];

    fetch("/unblock-user", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ mobile })
        })
        .then(() => {
            openSuccessPopup("User unblocked successfully");
            openBlockedModal();
        });

}


/* Filter Modal */
function openFilterModal() {
document.getElementById("filterModal").classList.add("show");
}

function closeFilterModal() {
document.getElementById("filterModal").classList.remove("show");
}

function applyFilters(){

  currentPage = 1;

  showLogs();  

  closeFilterModal();

}
function renderFilteredLogs(data){

  let table = document.getElementById("logTable");
  table.innerHTML = "";

 data.forEach((log,index)=>{
  table.innerHTML += `
    <tr>
      <td>
        <input type="checkbox" class="logCheck" data-index="${index}" onchange="updateBulkLogActions()">
      </td>
<td>
  <div class="file-cell">
    <i class="fa-regular ${getFileIcon(log.file_name)}"></i>
    <span>${log.file_name || "-"}</span>
  </div>
</td>



   <td data-label="Name">${log.name}</td>
<td data-label="Number">${log.mobile}</td>
<td data-label="IP">${log.ip}</td>
<td data-label="Viewed At">${formatDateTime(log.viewed_at)}</td>


      <td>
        <button class="view-btn" onclick="openLogDetails(${index})">
          View
        </button>
      </td>
    </tr>
  `;
});

}

/* Categories */
function loadCategories() {

    let select = document.getElementById("modalCategory");
    let files = JSON.parse(localStorage.getItem("files")) || [];

    let categories = [...new Set(files.map(f => f.category))];

    categories.forEach(cat => {
        let opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = cat;
        select.appendChild(opt);
    });
}

/* Export CSV */
function exportCSV(){
  window.open("/api/logs/export");
}

document.addEventListener("DOMContentLoaded", () => {
    loadCategories();
    showLogs();
});

function toggleMenu() {
    document.querySelector(".sidebar").classList.toggle("active");
    document.querySelector(".overlay").classList.toggle("active");
}

document.addEventListener("DOMContentLoaded", () => {
  loadCategories();
  showLogs();
});

function openConfirm(type) {

  confirmType = type;
if (document.getElementById("logModal").classList.contains("show")) {

    previousModal = "logModal";
    closeLogModal();
  } else {
    previousModal = "";
  }

  let title = document.getElementById("confirmTitle");
  let msg = document.getElementById("confirmMessage");

  if (type === "block") {
    title.innerText = "Block Users";
    msg.innerText = "Are you sure you want to block this user?";
  }

  if (type === "delete") {
    title.innerText = "Delete Log";
    msg.innerText = "This log will be permanently deleted.";
  }
document.getElementById("confirmActionModal").classList.add("show");

  }
async function deleteSingleLog(){

  if(selectedLogIndex === null) return;

  let log = logsData[selectedLogIndex];
  if(!log) return;

  console.log("Deleting log:", log);

  await fetch(`/api/logs/${log.id}`, {
    method: "DELETE"
  });

  closeLogModal();
  showLogs();
  openSuccessPopup("Log deleted successfully");
}

async function confirmAction(){

  if(confirmType === "block"){
    await blockSingleUser();
  }

  if(confirmType === "delete"){
    await deleteSingleLog();
  }

  if(confirmType === "unblock"){
    await fetch("/api/users/unblock", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ mobile: unblockMobile })
    });

    showBlockedUsers();
    showLogs();
    openSuccessPopup("User unblocked successfully");
  }

document.getElementById("confirmActionModal").classList.remove("show");

}




function closeConfirmAction() {
document.getElementById("confirmActionModal").classList.remove("show");

    // return to previous popup if needed
    if (previousModal === "logModal") {
       document.getElementById("logModal").classList.add("show");

    }
}



async function deleteSelectedLogs(){

  let selected = getSelectedLogs();

  if(selected.length === 0){
    alert("Select logs first");
    return;
  }

  for(let index of selected){

    let log = logsData[index];
    if(!log) continue;

    await fetch(`/api/logs/${log.id}`,{
      method:"DELETE"
    });

  }

  // Reload logs
  await showLogs();

  // Reset checkboxes
  document.getElementById("selectAllLogs").checked = false;

  // Hide bulk actions
  document.getElementById("bulkActionsLogs").style.display = "none";

  openSuccessPopup("Logs deleted successfully");
}

function openSuccessPopup(message) {
    document.getElementById("successMessage").innerText = message;
document.getElementById("successModal").classList.add("show");
}

function closeSuccessPopup() {
document.getElementById("successModal").classList.remove("show");
}

let unblockMobile = null;

function confirmUnblock(mobile){
  unblockMobile = mobile;
  confirmType = "unblock";

document.getElementById("confirmActionModal").classList.add("show");
}




function formatDateTime(dateString) {
  if(!dateString) return "-";

  const date = new Date(dateString);

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function logoutUser(){
  localStorage.removeItem("token");
  localStorage.removeItem("currentUser");
  sessionStorage.clear();
  window.location.href = "/admin/login.html";
}


/* ===== Load Logged User Info ===== */
let currentUser = JSON.parse(localStorage.getItem("currentUser"));

if(currentUser){

  let nameEl = document.getElementById("userName");
  let emailEl = document.getElementById("userEmail");

  if(nameEl)
    nameEl.innerText = currentUser.name || "Admin";

  if(emailEl)
    emailEl.innerText = currentUser.email || "";
}

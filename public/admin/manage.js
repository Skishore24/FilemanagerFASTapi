
let editIndex = null;
let currentFilter = "All";
let categories = [];
let currentPage = 1;
let rowsPerPage = 5;
let importanceFilter = "All";
let dateFilter = "";
let filePage = 1;
let filesPerPage = 20;
let bulkActionType = null;

const uploadBox = document.querySelector(".upload-box");
const fileInput = document.getElementById("fileInput");
const isAdminPage = window.location.pathname.includes("admin");
let token = localStorage.getItem("token");

if(!token){
  window.location.href = "/admin/login.html";
}

let files = [];
async function loadCategories(){
  let res = await fetch("/api/categories");
  categories = await res.json();
  showCategories();
}
async function loadFiles(){
  try{
    let res = await fetch("/api/files");

    if(!res.ok) throw new Error("Server error");

    files = await res.json();
    showFiles();

  }catch(err){
    console.log("Error loading files:", err);
    alert("Failed to load files");
  }
}



/* ADD FILE */
let tempFiles = [];

function addFile() {

  if (!fileInput || fileInput.files.length === 0) {
    alert("Select a file");
    return;
  }

  tempFiles = fileInput.files;

  // fill category dropdown
  let select = document.getElementById("uploadCategory");
  select.innerHTML = "";

categories.forEach(cat=>{
  select.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
});

  // open popup
  document.getElementById("uploadModal").style.display = "flex";
}

function downloadFile(index){
  let file = files[index];
  if(!file) return;

  let mobile = localStorage.getItem("mobile") || "Unknown";

  window.location =
    "/secure-files/download/" + file.name + "?mobile=" + mobile;
}


function getFileIcon(fileName){

  if(!fileName) return "fa-file";

  let name = fileName.toLowerCase();

  if(name.endsWith(".pdf")) return "fa-file-pdf";
  if(name.endsWith(".doc") || name.endsWith(".docx")) return "fa-file-word";
  if(name.endsWith(".xls") || name.endsWith(".xlsx")) return "fa-file-excel";
  if(name.endsWith(".ppt") || name.endsWith(".pptx")) return "fa-file-powerpoint";
  if(/\.(jpg|jpeg|png|gif|webp)$/.test(name)) return "fa-file-image";
  if(/\.(zip|rar|7z)$/.test(name)) return "fa-file-archive";

  return "fa-file";
}



function toggleSelectAll(){
  let master = document.getElementById("selectAll");
  let checks = document.querySelectorAll(".fileCheck");

  checks.forEach(cb => {
    cb.checked = master.checked;
  });

  updateBulkActions();
}

function markViewDownload(){
  if(getSelectedIndexes().length === 0){
    alert("Select files first");
    return;
  }

  bulkActionType = "viewDownload";

  document.getElementById("bulkTitle").innerText = "Mark View & Download";
  document.getElementById("bulkMessage").innerText =
    "Allow download for selected files?";

  document.getElementById("bulkConfirmModal").style.display = "flex";
}


function getSelectedIndexes(){

  let checks = document.querySelectorAll(".fileCheck:checked");
  let indexes = [];

  checks.forEach(cb => indexes.push(parseInt(cb.value)));

  return indexes;
}
function confirmBulkAction(){
  let selected = getSelectedIndexes();

  Promise.all(selected.map(i=>{
    let file = files[i];

    if(bulkActionType === "delete"){
      return fetch("/api/files/" + file.id,{method:"DELETE"});
    }

    if(bulkActionType === "viewOnly" || bulkActionType === "viewDownload"){
      let importanceValue =
        bulkActionType === "viewOnly" ? "important" : "less";

      return fetch("/api/files/importance/" + file.id,{
        method:"PUT",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ importance: importanceValue })
      });
    }
  })).then(()=>{
    closeBulkModal();
    loadFiles();
  });
}



function closeBulkModal(){
  document.getElementById("bulkConfirmModal").style.display = "none";
}

function deleteSelected(){

  if(getSelectedIndexes().length === 0){
    alert("Select files first");
    return;
  }

  bulkActionType = "delete";

  document.getElementById("bulkTitle").innerText = "Delete Files";
  document.getElementById("bulkMessage").innerText =
    "Delete selected files? This cannot be undone.";

  document.getElementById("bulkConfirmModal").style.display = "flex";
}

function markViewOnly(){
  if(getSelectedIndexes().length === 0){
    alert("Select files first");
    return;
  }

  bulkActionType = "viewOnly";

  document.getElementById("bulkTitle").innerText = "Mark View Only";
  document.getElementById("bulkMessage").innerText =
    "Mark selected files as View Only?";

  document.getElementById("bulkConfirmModal").style.display = "flex";
}

function updateBulkActions(){
  let checked = document.querySelectorAll(".fileCheck:checked").length;
  let panel = document.getElementById("bulkActions");

  if(checked > 0){
    panel.style.display = "block";
  }else{
    panel.style.display = "none";
  }
}


/* SHOW FILES */
function showFiles() {

  let list = document.getElementById("fileList");
  let countBadge = document.getElementById("fileCount");
  let searchBox = document.getElementById("searchManage");

  let search = searchBox ? searchBox.value.toLowerCase() : "";

  list.innerHTML = "";

  let filtered = files.filter(file => {

let matchSearch = (file.name || "").toLowerCase().includes(search);

  let matchCategory = currentFilter === "All" || file.category === currentFilter;
  let matchImportance = importanceFilter === "All" || file.importance === importanceFilter;
  let matchDate = true;

    if(dateFilter){
      let fileDate = new Date(file.date);
      let selectedDate = new Date(dateFilter);

      matchDate =
        fileDate.getFullYear() === selectedDate.getFullYear() &&
        fileDate.getMonth() === selectedDate.getMonth() &&
        fileDate.getDate() === selectedDate.getDate();
    }

  return matchSearch && matchCategory && matchImportance && matchDate;
});

let start = (filePage - 1) * filesPerPage;
let end = start + filesPerPage;
let pageFiles = filtered.slice(start, end);
pageFiles.forEach((file, index) => {
  let realIndex = start + index;

let viewable = file.importance === "important"

  ? `<span class="badge-view view-only"><i class="fa fa-eye"></i> View Only</span>`
  : `<span class="badge-view view-download"><i class="fa fa-eye"></i> View & Download</span>`;
list.innerHTML += `
<tr>
<td data-label="Select">
<input type="checkbox" 
class="fileCheck" 
value="${realIndex}" 
onchange="updateBulkActions(); event.stopPropagation();">
</td>

<td data-label="File Name" class="file-name-cell">
<i class="fa-regular ${getFileIcon(file.name)}"></i>

<span title="${file.name}">${file.name}</span>
</td>

<td data-label="Category">
<span class="badge-cat">${file.category}</span>
</td>

<td data-label="Size">${file.size || "-"}</td>

<td data-label="Uploaded">
${new Date(file.date).toLocaleString("en-IN", {
  day:"2-digit",
  month:"short",
  year:"numeric",
  hour:"2-digit",
  minute:"2-digit"
})}
</td>

<td data-label="Viewable">${viewable}</td>

<td data-label="Actions">
<button class="view-btn" onclick="openDetails(${realIndex})">View</button>
</td>
</tr>`;



});
  if (countBadge) countBadge.innerText = filtered.length;
  let totalPages = Math.ceil(filtered.length / filesPerPage) || 1;
document.getElementById("filePageInfo").innerText =
  "Page " + filePage + " of " + totalPages;

updateBulkActions();

}
let selectedIndex = null;

function openDetails(index){
  selectedIndex = index;

  let file = files[index];

  document.getElementById("dName").innerText = file.name;
  document.getElementById("dSize").innerText = file.size;
let formattedDate = new Date(file.date).toLocaleString("en-IN", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

document.getElementById("dDate").innerText = formattedDate;
  // ← REPLACE THIS LINE
  document.getElementById("dCategory").innerText = file.category || "General";

  document.getElementById("dImportance").innerText =
file.importance === "important"
    ? "View Only"
    : "View & Download";

let downloadBtn = document.getElementById("downloadBtn");

if(isAdminPage){
  // Admin can download everything
  downloadBtn.style.display = "inline-block";
}else{
  // User page restriction
  if(file.importance === "important"){
    downloadBtn.style.display = "none";
  }else{
    downloadBtn.style.display = "inline-block";
  }
}

  document.getElementById("detailsModal").style.display = "flex";
}

function closeDetails(){
  document.getElementById("detailsModal").style.display = "none";
}

function copyLink(){
  let file = files[selectedIndex];
  let url = window.location.origin + "/user/user.html?file=" + encodeURIComponent(file.name);

  const tempInput = document.createElement("input");
  tempInput.value = url;
  document.body.appendChild(tempInput);
  tempInput.select();
  document.execCommand("copy");
  document.body.removeChild(tempInput);

  alert("Link copied");
}

function copyFileUrl(fileName){

  selectedFileIndex = files.findIndex(f => f.name === fileName);

  // open OTP popup
  document.getElementById("otpModal").style.display="flex";
  document.getElementById("mobileStep").style.display="block";
  document.getElementById("otpStep").style.display="none";
  document.getElementById("resultStep").style.display="none";
}

function showToast(message){
  let toast = document.getElementById("toast");
  toast.innerText = message;
  toast.classList.add("show");

  setTimeout(()=>{
    toast.classList.remove("show");
  },2500);
}


/* DELETE */
let deleteFileIndex = null;
function confirmDeleteFile(index){

  deleteFileIndex = index;

  // close details popup automatically
  closeDetails();

  // open file confirm popup
  document.getElementById("confirmFileModal").style.display = "flex";
}

function closeFileConfirm(){
  document.getElementById("confirmFileModal").style.display = "none";
  deleteFileIndex = null;
}
function closeViewer(){
  document.getElementById("viewerModal").style.display="none";
  document.getElementById("viewerFrame").src="";
}

async function deleteFileConfirmed(){

  if(deleteFileIndex === null) return;

  let file = files[deleteFileIndex];
  if(!file) return;

  closeViewer();   // ADD THIS

  await fetch("/api/files/" + file.id,{
    method:"DELETE"
  });

  closeFileConfirm();
  loadFiles();
}




/* VIEW */
function viewFile(index) {
  let file = files[index];
  if(!file) return;

  closeDetails(); // close popup first

  let viewer = document.getElementById("viewerModal");
  let frame = document.getElementById("viewerFrame");

let mobile = localStorage.getItem("mobile") || "Unknown";
frame.src = "/secure-files/" + file.name + "?mobile=" + mobile + "&t=" + Date.now();

  viewer.style.display = "flex";
}


document.addEventListener("keydown", function(e){
  if(e.key === "Escape"){
    closeViewer();
  }
});

/* EDIT MODAL */
async function openEditModal(index) {

  editIndex = index;
  let file = files[index];
document.getElementById("editName").value =
  file.name.replace(/\.[^/.]+$/, "");

  document.getElementById("editImportance").value = file.importance || "less";

  // make sure categories loaded first
  if(categories.length === 0){
    await loadCategories();
  }

  loadEditCategories(file.category);

  document.getElementById("editModal").style.display = "flex";
  document.getElementById("editError").innerText = "";
document.getElementById("editSuccess").innerText = "";

}


function closeEditModal() {
  document.getElementById("editModal").style.display = "none";
}

function saveEdit() {

  let newName = document.getElementById("editName").value.trim();
  let newImportance = document.getElementById("editImportance").value;
  let newCategory = document.getElementById("editCategory").value;

  let errorBox = document.getElementById("editError");
  let successBox = document.getElementById("editSuccess");

  errorBox.innerText = "";
  successBox.innerText = "";

  if(!newName){
    errorBox.innerText = "File name cannot be empty";
    return;
  }

  let file = files[editIndex];

  fetch("/api/files/" + file.id, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: newName,
      category: newCategory,
      importance: newImportance
    })
  })
  .then(res => res.json())
  .then(data => {

    if(data.error){
      errorBox.innerText = data.error;
      return;
    }

    successBox.innerText = "File updated successfully";

    setTimeout(()=>{
      closeEditModal();
      loadFiles();
    },1000);

  })
  .catch(()=>{
    errorBox.innerText = "Something went wrong";
  });
}


function closeViewer(){
  document.getElementById("viewerModal").style.display="none";
  document.getElementById("viewerFrame").src="";
}

function closeFilter() {
  document.getElementById("filterModal").style.display = "none";
}

function applyFilter() {
  currentFilter = document.getElementById("filterCategory").value;
  importanceFilter = document.getElementById("filterImportance").value;
  dateFilter = document.getElementById("filterDate").value;

  closeFilter();

  nextFilePage()
prevFilePage()
showFiles()

}


/* DRAG DROP */
if (uploadBox) {

  uploadBox.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadBox.style.borderColor = "#6366f1";
  });

  uploadBox.addEventListener("dragleave", () => {
    uploadBox.style.borderColor = "#c7d2fe";
  });

  uploadBox.addEventListener("drop", (e) => {
    e.preventDefault();
    fileInput.files = e.dataTransfer.files;
    addFile();
  });
}

/* CLICK UPLOAD */
if (fileInput) {
  fileInput.addEventListener("change", addFile);
}
function openCategoryModal(){
  document.getElementById("categoryModal").style.display="flex";
  showCategories();
}

function closeCategoryModal(){
  document.getElementById("categoryModal").style.display="none";
}
function showCategories(){

  let list = document.getElementById("categoryList");
  if(!list) return;

  let searchInput = document.getElementById("categorySearch");
  let search = searchInput ? searchInput.value.toLowerCase() : "";

  let filtered = categories.filter(cat =>
  cat.name.toLowerCase().includes(search)
);


  let start = (currentPage - 1) * rowsPerPage;
  let end = start + rowsPerPage;

  let pageData = filtered.slice(start, end);

  list.innerHTML = "";

  pageData.forEach((cat,index)=>{
    list.innerHTML += `
      <tr>
<td>${cat.name}</td>
        <td>
          <button class="btn-edit" onclick="editCategory(${start+index})">Edit</button>
          <button class="btn-delete" onclick="confirmDeleteCategory(${start+index})">Delete</button>
        </td>
      </tr>
    `;
  });

  let totalPages = Math.ceil(filtered.length / rowsPerPage) || 1;
  document.getElementById("pageInfo").innerText =
    "Page " + currentPage + " of " + totalPages;
}

function editFromDetails(){

  // close details popup
  document.getElementById("detailsModal").style.display = "none";

  // open edit modal
  openEditModal(selectedIndex);
}


function addCategory(){

  let input = document.getElementById("newCategory");
  let name = input.value.trim();

  if(!name){
    input.focus();
    return;
  }

  // prevent duplicates
 if(categories.some(c => c.name.toLowerCase() === name.toLowerCase())){
  alert("Category already exists");
  return;
}

fetch("/api/categories",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify({name})
}).then(loadCategories);

  input.value = "";

  // move to last page so new item visible
  currentPage = Math.ceil(categories.length / rowsPerPage);

  showCategories();
}
document.addEventListener("DOMContentLoaded", () => {
  loadFiles();
  loadCategories();
});

function deleteCategory(){

  if(deleteIndex === null) return;

  let cat = categories[deleteIndex];

  fetch("/api/categories/" + cat.id,{
    method:"DELETE"
  }).then(()=>{
    deleteIndex = null;   // important
    closeConfirm();
    loadCategories();
  });
}


let editCategoryIndex = null;

function editCategory(index){

  editCategoryIndex = index;

  // close category popup
  closeCategoryModal();

  // set value
document.getElementById("editCategoryInput").value = categories[index].name;

  // open edit popup
  document.getElementById("editCategoryModal").style.display = "flex";
}
function saveCategoryEdit(){

  let newName = document.getElementById("editCategoryInput").value.trim();
  if(!newName) return;

  let cat = categories[editCategoryIndex];

  fetch("/api/categories/" + cat.id,{
    method:"PUT",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ name:newName })
  }).then(loadCategories);

  closeEditCategory();
}

function closeEditCategory(){
  document.getElementById("editCategoryModal").style.display = "none";
}
function openFileFromURL(){

  let fileFromURL = getFileFromURL();
  if(!fileFromURL) return;

  selectedFileIndex = files.findIndex(
    f => f.name === fileFromURL
  );

  if(selectedFileIndex !== -1){

    selectedFileName = fileFromURL;

    // open OTP popup
    document.getElementById("otpModal").style.display = "flex";
    document.getElementById("mobileStep").style.display = "block";
    document.getElementById("otpStep").style.display = "none";
    document.getElementById("resultStep").style.display = "none";
  }
}

async function openFilter() {

  if(categories.length === 0){
    await loadCategories();
  }

  let select = document.getElementById("filterCategory");
  select.innerHTML = `<option value="All">All</option>`;

  categories.forEach(cat=>{
    select.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
  });

  document.getElementById("filterModal").style.display="flex";
}


function nextPage(){
  let totalPages = Math.ceil(categories.length / rowsPerPage);
  if(currentPage < totalPages){
    currentPage++;
    showCategories();
  }
}

function prevPage(){
  if(currentPage > 1){
    currentPage--;
    showCategories();
  }
}
let deleteIndex = null;

function confirmDeleteCategory(index){
  deleteIndex = index;
  document.getElementById("confirmModal").style.display="flex";
}

function closeConfirm(){
  document.getElementById("confirmModal").style.display="none";
  deleteIndex = null;
}

function canDownload(file){
  return file.importance !== "important";
}

/* LOAD */
function toggleMenu(e){
  if(e) e.stopPropagation();   // prevent auto close
  document.querySelector(".sidebar").classList.toggle("active");
  document.querySelector(".overlay").classList.toggle("active");
}

document.addEventListener("click", function(e){

  let sidebar = document.querySelector(".sidebar");
  let toggleBtn = document.querySelector(".menu-toggle");
  let overlay = document.querySelector(".overlay");

  if(!sidebar || !toggleBtn || !overlay) return;

  if(window.innerWidth <= 900){
    if(
      !sidebar.contains(e.target) &&
      !toggleBtn.contains(e.target)
    ){
      sidebar.classList.remove("active");
      overlay.classList.remove("active");
    }
  }

});

function nextFilePage(){

  let searchBox = document.getElementById("searchManage");
  let search = searchBox ? searchBox.value.toLowerCase() : "";

  let filtered = files.filter(file => {

    let matchSearch = (file.name || "").toLowerCase().includes(search);
    let matchCategory = currentFilter === "All" || file.category === currentFilter;
    let matchImportance = importanceFilter === "All" || file.importance === importanceFilter;

    let matchDate = true;
    if(dateFilter){
      let fileDate = new Date(file.date);
      let selectedDate = new Date(dateFilter);

      matchDate =
        fileDate.getFullYear() === selectedDate.getFullYear() &&
        fileDate.getMonth() === selectedDate.getMonth() &&
        fileDate.getDate() === selectedDate.getDate();
    }

    return matchSearch && matchCategory && matchImportance && matchDate;
  });

  let totalPages = Math.ceil(filtered.length / filesPerPage);

  if(filePage < totalPages){
    filePage++;
    showFiles();
  }
}

function loadEditCategories(selectedCategory="") {

  let select = document.getElementById("editCategory");
  select.innerHTML = "";

  categories.forEach(cat=>{
    let option = document.createElement("option");
    option.value = cat.name;
    option.textContent = cat.name;

    if(cat.name === selectedCategory){
      option.selected = true;
    }

    select.appendChild(option);
  });
}


function prevFilePage(){
  if(filePage > 1){
    filePage--;
    showFiles();
  }
}
function confirmUpload(){

  let category = document.getElementById("uploadCategory").value;
  let importance = document.getElementById("uploadImportance").value;

  for (let i = 0; i < tempFiles.length; i++) {

    let formData = new FormData();
    formData.append("file", tempFiles[i]);
    formData.append("category", category);
    formData.append("importance", importance);   // ADD THIS

    fetch("/api/files",{
      method:"POST",
      body: formData
    }).then(()=>loadFiles());
  }

  fileInput.value = "";
  closeUploadModal();
}



function closeUploadModal(){
  document.getElementById("uploadModal").style.display = "none";
}

function saveManualFile(){

  let name = document.getElementById("name").value;
  let category = document.getElementById("category").value;
  let size = document.getElementById("size").value;
  let importance = document.getElementById("importance").value;

  fetch("/api/files",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({name,category,size,importance})
  }).then(()=>{
    alert("File Added");
    location.reload();
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

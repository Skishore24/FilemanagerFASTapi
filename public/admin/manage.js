/**
 * ============================================================================
 * public/admin/manage.js — Admin File & Category Management Logic
 * ============================================================================
 * Core logic for the administrative management interface:
 * - File CRUD operations (Upload, Rename, Delete)
 * - Bulk actions for efficiency (Delete selected, Change Importance)
 * - Category management (Add, Edit, Delete)
 * - Advanced filtering & pagination for large datasets
 * - Real-time UI updates and feedback (Toasts)
 * ============================================================================
 */

/* ----------------------------------------------------------------------------
   GLOBAL STATE & CONSTANTS
   ---------------------------------------------------------------------------- */
const token = localStorage.getItem("token");

/* Immediate check for admin session */
if (!token) {
  window.location.href = "/admin/login.html";
}

let files = [];               /* Master file list */
let categories = [];          /* Master category list */
let currentFilter = "All";    /* Active category filter */
let importanceFilter = "All"; /* Active access level filter */
let dateFilter = "";          /* Active date filter */
let filePage = 1;             /* Current page for files table */
const filesPerPage = 20;      /* Rows per page for files table */

let editIndex = null;         /* Index of file being edited */
let tempFiles = [];           /* Files selected in upload dialog */
let bulkActionType = null;    /* Type of bulk operation (delete/importance) */
let deleteCategoryIndex = null;
let editCategoryIndex = null;
let currentPage = 1;          /* For category modal pagination */
const rowsPerPage = 5;

/**
 * ============================================================
 * SECTION 1 — INITIALIZATION & DATA LOADING
 * ============================================================
 */

/**
 * ============================================================
 * SECTION 1 — INITIALIZATION & DATA LOADING
 * ============================================================
 */

document.addEventListener("DOMContentLoaded", () => {
  showFiles();
  loadCategories();
  initSidebarProfile();

  /* Periodic session verification */
  setInterval(() => {
    const token = localStorage.getItem("token");
    if (!token || token === "null") logoutUser();
  }, 5000);

  /* Sync hidden file input change */
  const input = document.getElementById("fileInput");
  if (input) {
    input.addEventListener("change", () => {
      if (input.files.length > 0) triggerUpload();
    });
  }
});

/**
 * showFiles()
 * Renamed from loadFiles to match manage.html naming.
 * Fetches all file records and triggers rendering.
 */
async function showFiles() {
  try {
    const res = await fetch("/api/files", {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (res.status === 401 || res.status === 403) {
      logoutUser();
      return;
    }

    if (!res.ok) throw new Error("Fetch failed");
    files = await res.json();
    renderFileTable();
  } catch (err) {
    console.error("Load files error:", err);
    showToast("❌ Failed to load files", "error");
  }
}

/**
 * loadFiles()
 * Alias for showFiles to maintain compatibility with other internal calls.
 */
function loadFiles() { showFiles(); }

async function loadCategories() {
  try {
    const res = await fetch("/api/categories", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) throw new Error();
    categories = await res.json() || [];
    renderCategoryTable();
    populateCategoryDropdowns();
  } catch (err) {
    console.warn("Categories fetch error:", err);
    showToast("Failed to load categories. Modal/Filters may be incomplete.", "error");
  }
}

function populateCategoryDropdowns() {
  const dropdowns = ["filterCategory", "uploadCategory", "editCategory"];
  dropdowns.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    
    /* Preserve the first "All" or "General" option */
    const firstOption = el.options[0] ? el.options[0].outerHTML : "";
    el.innerHTML = firstOption;
    
    categories.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat.name;
      opt.textContent = cat.name;
      el.appendChild(opt);
    });
  });
}

/**
 * ============================================================
 * SECTION 2 — FILE RENDERING & FILTERING
 * ============================================================
 */

function renderFileTable() {
  const list = document.getElementById("fileList");
  const countBadge = document.getElementById("fileCount");
  const searchInput = document.getElementById("searchManage");
  const search = searchInput ? searchInput.value.toLowerCase().trim() : "";

  if (!list) return;
  list.innerHTML = "";

  const filtered = files.filter(f => {
    const matchSearch = f.name.toLowerCase().includes(search);
    const matchCategory = currentFilter === "All" || f.category === currentFilter;
    const matchImportance = importanceFilter === "All" || f.importance === importanceFilter;
    let matchDate = true;

    if (dateFilter) {
      const fDate = new Date(f.date).toDateString();
      const sDate = new Date(dateFilter).toDateString();
      matchDate = fDate === sDate;
    }
    return matchSearch && matchCategory && matchImportance && matchDate;
  });

  /* Calculate Pagination */
  const totalPages = Math.ceil(filtered.length / filesPerPage) || 1;
  if (filePage > totalPages) filePage = totalPages;
  if (filePage < 1) filePage = 1;

  const start = (filePage - 1) * filesPerPage;
  const pageItems = filtered.slice(start, start + filesPerPage);

  if (pageItems.length === 0) {
    list.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#6b7280;">No files matching your criteria.</td></tr>`;
  }

  pageItems.forEach((file) => {
    const globalIdx = files.indexOf(file);
    const { icon, color } = getFileIcon(file.name);
    const isImportant = file.importance === "important";
    const statusLabel = isImportant ? "View Only" : "View & Download";
    const statusClass = isImportant ? "view-only" : "view-download";

    list.innerHTML += `
      <tr>
        <td data-label="Select"><input type="checkbox" class="fileCheck" value="${globalIdx}" onchange="updateBulkPanel()"></td>
        <td data-label="File Name">
          <div class="file-name-cell">
            <i class="${icon}" style="color: ${color}"></i>
            <span title="${escapeHTML(file.name)}">${escapeHTML(file.name)}</span>
          </div>
        </td>
        <td data-label="Category"><span class="badge-cat">${escapeHTML(file.category)}</span></td>
        <td data-label="Size">${escapeHTML(file.size || "-")}</td>
        <td data-label="Uploaded">${file.date ? new Date(file.date).toLocaleDateString("en-IN", { day:'2-digit', month:'short', year:'numeric' }) : "-"}</td>
        <td data-label="Access"><span class="badge-view ${statusClass}">${statusLabel}</span></td>
        <td data-label="Actions">
          <button class="view-btn" onclick="openFileDetails(${globalIdx})">
            <i class="fa-solid fa-eye"></i> View
          </button>
        </td>
      </tr>
    `;
  });

  if (countBadge) countBadge.innerText = filtered.length;
  updatePaginationLabel(filtered.length);
  updateBulkPanel();
}

/**
 * ============================================================
 * SECTION 3 — FILE OPERATIONS (CRUD)
 * ============================================================
 */

/* -- UPLOAD -- */
function triggerUpload() {
  const input = document.getElementById("fileInput");
  if (!input || input.files.length === 0) return;
  
  tempFiles = input.files;
  renderUploadCategoryOptions();
  toggleModal("uploadModal", true);
}

function renderUploadCategoryOptions() {
  const select = document.getElementById("uploadCategory");
  if (!select) return;
  select.innerHTML = "";
  categories.forEach(cat => {
    select.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
  });
}

async function confirmUpload() {
  const category = document.getElementById("uploadCategory").value;
  const importance = document.getElementById("uploadImportance").value;

  try {
    const uploadTasks = [...tempFiles].map(file => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", category);
      fd.append("importance", importance);
      return fetch("/api/files", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: fd
      });
    });

    await Promise.all(uploadTasks);
    showToast("Files uploaded successfully!", "success");
    showFiles();
    toggleModal("uploadModal", false);
    document.getElementById("fileInput").value = "";
  } catch (err) {
    showToast("Upload failed", "error");
  }
}

function closeUploadModal() {
  toggleModal("uploadModal", false);
  document.getElementById("fileInput").value = "";
}

/* -- DELETE -- */
let selectedIndex = null; /* For detail/confirm modals */

function confirmDeleteFile(idx) {
  selectedIndex = idx;
  toggleModal("confirmFileModal", true);
}

async function deleteFileConfirmed() {
  const file = files[selectedIndex];
  if (!file) return;

  try {
    const res = await fetch(`/api/files/${file.id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (res.ok) {
      showToast("File deleted", "success");
      showFiles();
      closeFileConfirm();
      closeDetails();
    }
  } catch (e) { showToast("Delete failed", "error"); }
}

function closeFileConfirm() {
  toggleModal("confirmFileModal", false);
}

/* -- EDIT -- */
function editFromDetails() {
  editIndex = selectedIndex;
  const file = files[editIndex];
  
  document.getElementById("editName").value = file.name.replace(/\.[^.]+$/, "");
  document.getElementById("editCategory").value = file.category;
  document.getElementById("editImportance").value = file.importance;
  
  closeDetails();
  toggleModal("editModal", true);
}

async function saveEdit() {
  const id = files[editIndex].id;
  const name = document.getElementById("editName").value.trim();
  const category = document.getElementById("editCategory").value;
  const importance = document.getElementById("editImportance").value;

  if (!name) return showToast("Name is required", "error");

  try {
    const res = await fetch(`/api/files/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ name, category, importance })
    });
    const data = await res.json();
    if (data.success) {
      showToast("Updated successfully");
      showFiles();
      toggleModal("editModal", false);
    } else {
      showToast(data.error || "Update failed", "error");
    }
  } catch (e) { showToast("Error updating file", "error"); }
}

function closeEditModal() {
  toggleModal("editModal", false);
}

/**
 * ============================================================
 * SECTION 4 — BULK ACTIONS
 * ============================================================
 */

function markViewOnly() { handleBulkAction("viewOnly"); }
function markViewDownload() { handleBulkAction("viewDownload"); }
function deleteSelected() { handleBulkAction("delete"); }

function handleBulkAction(type) {
  const selected = getSelectedIndexes();
  if (selected.length === 0) return showToast("Select files first", "info");

  bulkActionType = type;
  const modalData = {
    delete: { title: "Delete Files", msg: `Delete ${selected.length} selected files permanently?` },
    viewOnly: { title: "Mark View Only", msg: `Set ${selected.length} files to restricted access?` },
    viewDownload: { title: "Mark View & Download", msg: `Allow all actions for ${selected.length} files?` }
  }[type];

  document.getElementById("bulkTitle").innerText = modalData.title;
  document.getElementById("bulkMessage").innerText = modalData.msg;
  toggleModal("bulkConfirmModal", true);
}

async function confirmBulkAction() {
  const selected = getSelectedIndexes();
  const tasks = selected.map(idx => {
    const file = files[idx];
    if (bulkActionType === "delete") {
      return fetch(`/api/files/${file.id}`, { method: "DELETE", headers: { "Authorization": `Bearer ${token}` } });
    } else {
      const importance = bulkActionType === "viewOnly" ? "important" : "less";
      return fetch(`/api/files/importance/${file.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ importance })
      });
    }
  });

  try {
    await Promise.all(tasks);
    showToast("Bulk action completed", "success");
    toggleModal("bulkConfirmModal", false);
    showFiles();
  } catch (err) {
    showToast("Bulk action failed partially", "error");
  }
}

function closeBulkModal() {
  toggleModal("bulkConfirmModal", false);
}

function toggleSelectAll() {
  const master = document.getElementById("selectAll");
  const checks = document.querySelectorAll(".fileCheck");
  checks.forEach(c => c.checked = master.checked);
  updateBulkPanel();
}

/**
 * ============================================================
 * SECTION 5 — CATEGORY MANAGEMENT
 * ============================================================
 */

async function saveNewCategory() {
  const input = document.getElementById("newCategory");
  const name = input.value.trim();
  if (!name) return;

  try {
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ name })
    });
    if (res.ok) {
      input.value = "";
      loadCategories();
      showToast("Category added", "success");
    } else {
      const data = await res.json();
      showToast(data.error || "Failed to add category", "error");
    }
  } catch (e) {
    showToast("Server error", "error");
  }
}

function openCategoryModal() {
  toggleModal("categoryModal", true);
  renderCategoryTable();
}

function closeCategoryModal() {
  toggleModal("categoryModal", false);
}

function renderCategoryTable() {
  const list = document.getElementById("categoryList");
  const searchInput = document.getElementById("categorySearch");
  const search = searchInput ? searchInput.value.toLowerCase().trim() : "";
  if (!list) return;

  const filtered = categories.filter(c => c.name.toLowerCase().includes(search));
  
  const totalPages = Math.ceil(filtered.length / rowsPerPage) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const start = (currentPage - 1) * rowsPerPage;
  const pageItems = filtered.slice(start, start + rowsPerPage);

  list.innerHTML = "";
  pageItems.forEach(cat => {
    list.innerHTML += `
      <tr>
        <td data-label="Category Name">${escapeHTML(cat.name)}</td>
        <td data-label="Actions">
          <button class="btn-edit" onclick="openEditCategory('${cat.id}', '${escapeHTML(cat.name)}')">
            <i class="fa-solid fa-pen"></i> Edit
          </button>
          <button class="btn-delete" onclick="confirmDeleteCategory('${cat.id}')">
            <i class="fa-solid fa-trash"></i> Delete
          </button>
        </td>
      </tr>
    `;
  });

  const info = document.getElementById("pageInfo");
  if (info) info.innerText = `Page ${currentPage} of ${totalPages}`;
}

function showCategories() {
  currentPage = 1;
  renderCategoryTable();
}

function prevPage() {
  if (currentPage > 1) {
    currentPage--;
    renderCategoryTable();
  }
}

function nextPage() {
  const filtered = categories.filter(c => {
    const s = document.getElementById("categorySearch")?.value || "";
    return c.name.toLowerCase().includes(s.toLowerCase().trim());
  });
  const total = Math.ceil(filtered.length / rowsPerPage) || 1;
  if (currentPage < total) {
    currentPage++;
    renderCategoryTable();
  }
}

let catToDelete = null;
function confirmDeleteCategory(id) {
  catToDelete = id;
  toggleModal("confirmModal", true);
}

function closeConfirm() {
  catToDelete = null;
  toggleModal("confirmModal", false);
}

async function deleteCategory() {
  if (!catToDelete) return;
  try {
    const res = await fetch(`/api/categories/${catToDelete}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (res.ok) {
      showToast("Category deleted", "success");
      loadCategories();
      closeConfirm();
    } else {
      const data = await res.json();
      showToast(data.error || "Delete failed", "error");
    }
  } catch (e) {
    showToast("Request failed", "error");
  }
}

function openEditCategory(id, name) {
  catToEdit = id;
  const input = document.getElementById("editCategoryInput");
  if (input) input.value = name;
  toggleModal("editCategoryModal", true);
}

function closeEditCategory() {
  catToEdit = null;
  toggleModal("editCategoryModal", false);
}

async function saveCategoryEdit() {
  const input = document.getElementById("editCategoryInput");
  const name = input ? input.value.trim() : "";
  if (!name || !catToEdit) return;

  try {
    const res = await fetch(`/api/categories/${catToEdit}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ name })
    });
    if (res.ok) {
      showToast("Category updated", "success");
      loadCategories();
      closeEditCategory();
    } else {
      const data = await res.json();
      showToast(data.error || "Update failed", "error");
    }
  } catch (e) {
    showToast("Request failed", "error");
  }
}

function addCategory() {
  saveNewCategory();
}

/**
 * ============================================================
 * SECTION 6 — DOM HELPERS & MODALS
 * ============================================================
 */

function openFileDetails(idx) {
  selectedIndex = idx;
  const file = files[idx];
  if (!file) return;

  document.getElementById("dName").innerText       = file.name;
  document.getElementById("dCategory").innerText   = file.category;
  document.getElementById("dSize").innerText       = file.size || "-";
  document.getElementById("dDate").innerText       = new Date(file.date).toLocaleDateString();
  document.getElementById("dImportance").innerText = file.importance === "important" ? "View Only" : "View & Download";
  
  toggleModal("detailsModal", true);
}

function closeDetails() { toggleModal("detailsModal", false); }

function openFilter() { toggleModal("filterModal", true); }
function closeFilter() { toggleModal("filterModal", false); }

function applyFilter() {
  currentFilter = document.getElementById("filterCategory").value;
  importanceFilter = document.getElementById("filterImportance").value;
  dateFilter = document.getElementById("filterDate").value;
  filePage = 1;
  closeFilter();
  renderFileTable();
}

function updatePaginationLabel(totalItems) {
  const el = document.getElementById("filePageInfo");
  if (!el) return;
  const totalPages = Math.ceil(totalItems / filesPerPage) || 1;
  el.innerText = `Page ${filePage} of ${totalPages}`;
}

function prevFilePage() {
  if (filePage > 1) {
    filePage--;
    renderFileTable();
  }
}

function nextFilePage() {
  const total = Math.ceil(files.length / filesPerPage) || 1;
  if (filePage < total) {
    filePage++;
    renderFileTable();
  }
}

function toggleModal(id, show) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = show ? "flex" : "none";
}

function getSelectedIndexes() {
  return [...document.querySelectorAll(".fileCheck:checked")].map(cb => parseInt(cb.value));
}

function updateBulkPanel() {
  const panel = document.getElementById("bulkActions");
  const checks = document.querySelectorAll(".fileCheck:checked");
  if (panel) panel.style.display = checks.length > 0 ? "flex" : "none";
}

function getFileIcon(name) {
  const ext = (name || "").toLowerCase().split(".").pop();
  const map = {
    pdf:  { icon: "fa-solid fa-file-pdf", color: "#ef4444" },
    doc:  { icon: "fa-solid fa-file-word", color: "#2563eb" },
    docx: { icon: "fa-solid fa-file-word", color: "#2563eb" },
    xls:  { icon: "fa-solid fa-file-excel", color: "#16a34a" },
    xlsx: { icon: "fa-solid fa-file-excel", color: "#16a34a" },
    jpg:  { icon: "fa-solid fa-file-image", color: "#9333ea" },
    png:  { icon: "fa-solid fa-file-image", color: "#9333ea" }
  };
  return map[ext] || { icon: "fa-solid fa-file", color: "#6b7280" };
}

function showToast(msg, type = "success") {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.innerText = msg;
  toast.className = `toast show ${type}`;
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function logoutUser() {
  localStorage.clear();
  window.location.href = "/admin/login.html";
}

function escapeHTML(value) {
  if (!value) return "";
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, m => map[m]);
}

function initSidebarProfile() {
  const user = JSON.parse(localStorage.getItem("currentUser") || "{}");
  const el = document.getElementById("userEmail");
  if (el) el.innerText = user.email || "Admin";
}

function toggleMenu(event) {
  if (event) event.stopPropagation();
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.querySelector(".overlay");
  if (sidebar) sidebar.classList.toggle("active");
  if (overlay) overlay.classList.toggle("active");
}

function viewFile(idx) {
  closeDetails(); /* Close the details modal first as requested */
  const file = files[idx];
  if (!file) return;
  const viewer = document.getElementById("viewerModal");
  const iframe = document.getElementById("viewerFrame");
  if (viewer && iframe) {
    iframe.src = "/uploads/" + file.name;
    viewer.style.display = "flex";
  }
}

function closeViewer() {
  const viewer = document.getElementById("viewerModal");
  const iframe = document.getElementById("viewerFrame");
  if (viewer && iframe) {
    iframe.src = "";
    viewer.style.display = "none";
  }
}

function downloadFile(idx) {
  const file = files[idx];
  if (!file) return;
  const link = document.createElement("a");
  link.href = "/uploads/" + file.name;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Download started...");
}

function copyLink() {
  const file = files[selectedIndex];
  if (!file) return;
  const url = window.location.origin + "/uploads/" + file.name;
  navigator.clipboard.writeText(url).then(() => {
    showToast("Link copied to clipboard!", "success");
  }).catch(() => {
    showToast("Failed to copy link", "error");
  });
}


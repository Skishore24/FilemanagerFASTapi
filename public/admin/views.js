/**
 * ============================================================================
 * public/admin/views.js — Admin Activity Log & Audit Trail
 * ============================================================================
 * Provides deep-dive visibility into file access logs:
 * - Paginated & Searchable activity history
 * - Filtering by date, category, and user number
 * - Detailed event inspection (IP, Device, Timestamp)
 * - Bulk management (Delete logs, block suspicious users)
 * - Export capabilities (Excel/XLSX)
 * ============================================================================
 */

/* ----------------------------------------------------------------------------
   GLOBAL STATE & CONSTANTS
   ---------------------------------------------------------------------------- */
const token = localStorage.getItem("token");

if (!token) {
  window.location.href = "/admin/login.html";
}

let logsData = [];           /* Active page of logs */
let currentPage = 1;         /* Current result page */
let logsTotalPages = 1;      /* Total result pages */
let sortOrder = "DESC";      /* Sort direction (newest first) */

let selectedLogIndex = null; /* Index of log currently in detail view */
let selectedMobile = "";     /* Mobile associated with selected log */
let unblockMobile = null;    /* Mobile being unblocked */
let confirmType = "";        /* Active confirmation context (block/delete) */

/**
 * ============================================================
 * SECTION 1 — INITIALIZATION & DATA LOADING
 * ============================================================
 */

document.addEventListener("DOMContentLoaded", () => {
  loadCategories();
  showLogs();
  initSidebarProfile();
});

async function showLogs() {
  const search   = document.getElementById("searchLogs")?.value || "";
  const date     = document.getElementById("filterDate")?.value || "";
  const category = document.getElementById("modalCategory")?.value || "All";

  try {
    const url = `/api/logs?search=${search}&page=${currentPage}&sort=${sortOrder}&date=${date}&category=${category}`;
    const res = await fetch(url, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (res.status === 401 || res.status === 403) return logoutUser();
    
    if (!res.ok) throw new Error();

    const data = await res.json();
    logsData = data.logs || [];
    logsTotalPages = data.totalPages || 1;

    updatePaginationDisplay();
    renderLogTable();
  } catch (err) {
    displayTableError();
  }
}

/**
 * ============================================================
 * SECTION 2 — TABLE RENDERING
 * ============================================================
 */

function renderLogTable() {
  const table = document.getElementById("logTable");
  if (!table) return;
  table.innerHTML = "";

  logsData.forEach((log, index) => {
    const { icon, color } = getFileIcon(log.file_name);
    table.innerHTML += `
      <tr>
        <td data-label="Select"><input type="checkbox" class="logCheck" value="${index}" onchange="updateBulkPanel()"></td>
        <td data-label="File">
          <div class="file-cell">
            <i class="${icon}" style="color: ${color}"></i>
            <span>${escapeHTML(log.file_name || "-")}</span>
          </div>
        </td>
        <td data-label="Name">${escapeHTML(log.name || "-")}</td>
        <td data-label="Number">${escapeHTML(log.mobile || "-")}</td>
        <td data-label="IP">${escapeHTML(log.ip || "-")}</td>
        <td data-label="Viewed At">${formatDateTime(log.viewed_at)}</td>
        <td data-label="Action"><button class="view-btn" onclick="inspectLog(${index})">Details</button></td>
      </tr>
    `;
  });
}

/**
 * ============================================================
 * SECTION 3 — LOG ACTIONS (Details & Export)
 * ============================================================
 */

function inspectLog(index) {
  const log = logsData[index];
  if (!log) return;

  selectedLogIndex = index;
  selectedMobile = log.mobile;

  document.getElementById("detailFile").innerText = log.file_name;
  document.getElementById("detailMobile").innerText = log.mobile;
  document.getElementById("detailIP").innerText = log.ip || "-";
  document.getElementById("detailTime").innerText = formatDateTime(log.viewed_at);
  document.getElementById("detailMAC").innerText = log.device || "-";
  
  toggleModal("logModal", true);
}

async function exportLogs() {
  try {
    const res = await fetch("/api/logs/export", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) throw new Error();

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MCET_Logs_${new Date().toISOString().split('T')[0]}.xlsx`;
    a.click();
  } catch {
    openSuccessPopup("⚠️ Export failed. Please try again.");
  }
}

/**
 * ============================================================
 * SECTION 4 — UTILITIES & HELPERS
 * ============================================================
 */

function getFileIcon(name) {
  const ext = (name || "").toLowerCase().split(".").pop();
  const map = {
    pdf:  { icon: "fa-solid fa-file-pdf", color: "#ef4444" },
    doc:  { icon: "fa-solid fa-file-word", color: "#2563eb" },
    docx: { icon: "fa-solid fa-file-word", color: "#2563eb" },
    xls:  { icon: "fa-solid fa-file-excel", color: "#16a34a" },
    xlsx: { icon: "fa-solid fa-file-excel", color: "#16a34a" }
  };
  return map[ext] || { icon: "fa-solid fa-file", color: "#6b7280" };
}

function formatDateTime(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", 
    hour: "2-digit", minute: "2-digit", hour12: true
  });
}

function escapeHTML(str) {
  if (!str) return "";
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str).replace(/[&<>"']/g, m => map[m]);
}

function toggleModal(id, show) {
  const el = document.getElementById(id);
  if (el) {
    if (show) el.classList.add("show");
    else el.classList.remove("show");
  }
}

function logoutUser() {
  localStorage.clear();
  window.location.href = "/admin/login.html";
}

function initSidebarProfile() {
  const user = JSON.parse(localStorage.getItem("currentUser") || "{}");
  const el = document.getElementById("userEmail");
  if (el) el.innerText = user.email || "Admin";
}

/**
 * ============================================================
 * SECTION 5 — MISSING FUNCTIONS (Categories, Pagination, Modals, Bulk Actions)
 * ============================================================
 */

/* Load categories into the filter dropdown */
async function loadCategories() {
  try {
    const res = await fetch("/api/categories");
    if (!res.ok) return;
    const categories = await res.json();

    const select = document.getElementById("modalCategory");
    if (!select) return;

    /* Keep the "All" option, add categories */
    select.innerHTML = '<option value="All">All</option>';
    categories.forEach(cat => {
      select.innerHTML += `<option value="${escapeHTML(cat.name)}">${escapeHTML(cat.name)}</option>`;
    });
  } catch (err) {
    console.error("Failed to load categories:", err);
  }
}

/* Display error message in the table when fetch fails */
function displayTableError() {
  const table = document.getElementById("logTable");
  if (table) {
    table.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:20px; color:#ef4444;">
          <i class="fa-solid fa-circle-exclamation"></i>
          Failed to load logs. Please refresh the page.
        </td>
      </tr>
    `;
  }
}

/* Update pagination display */
function updatePaginationDisplay() {
  const pageInfo = document.getElementById("pageInfo");
  if (pageInfo) {
    pageInfo.innerText = `Page ${currentPage} of ${logsTotalPages}`;
  }
}

/* Previous page */
function prevPage() {
  if (currentPage > 1) {
    currentPage--;
    showLogs();
  }
}

/* Next page */
function nextPage() {
  if (currentPage < logsTotalPages) {
    currentPage++;
    showLogs();
  }
}

/* Sort logs by date */
function sortLogs(value) {
  sortOrder = value === "oldest" ? "ASC" : "DESC";
  currentPage = 1;
  showLogs();
}

/* Open filter modal */
function openFilterModal() {
  toggleModal("filterModal", true);
}

/* Close filter modal */
function closeFilterModal() {
  toggleModal("filterModal", false);
}

/* Apply filters and reload */
function applyFilters() {
  currentPage = 1;
  closeFilterModal();
  showLogs();
}

/* Close log detail modal */
function closeLogModal() {
  toggleModal("logModal", false);
}

/* Open blocked users list */
async function openBlockedModal() {
  toggleModal("blockedModal", true);
  try {
    const res = await fetch("/api/users/blocked", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) return;
    const blocked = await res.json();
    const table = document.getElementById("blockedTable");
    if (!table) return;

    table.innerHTML = "";
    if (blocked.length === 0) {
      table.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:15px; color:#6b7280;">No blocked users</td></tr>';
      return;
    }
    blocked.forEach(u => {
      table.innerHTML += `
        <tr>
          <td data-label="Mobile">${escapeHTML(u.mobile)}</td>
          <td data-label="Status"><span class="status-badge block">Blocked</span></td>
          <td data-label="Action">
            <button class="unblock-btn" onclick="unblockUser('${u.mobile}')" title="Unblock User">
              <i class="fa-solid fa-unlock"></i> Unblock
            </button>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    console.error("Failed to load blocked users:", err);
  }
}

/* Close blocked modal */
function closeBlockedModal() {
  toggleModal("blockedModal", false);
}

/* Unblock a user */
async function unblockUser(mobile) {
  if (!mobile) return;
  const targetMobile = mobile.trim();
  try {
    const res = await fetch("/api/users/unblock", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ mobile: targetMobile })
    });
    
    if (!res.ok) throw new Error("Failed to unblock");
    
    await openBlockedModal(); /* Refresh list */
    showLogs();
  } catch (err) {
    console.error("❌ Unblock failed:", err);
  }
}

/* Open confirmation modal */
function openConfirm(type) {
  confirmType = type;
  const title = document.getElementById("confirmTitle");
  const msg = document.getElementById("confirmMessage");

  if (type === "block") {
    if (title) title.innerText = "Block User";
    if (msg) msg.innerText = `Block mobile ${selectedMobile}?`;
  } else if (type === "delete") {
    if (title) title.innerText = "Delete Log";
    if (msg) msg.innerText = "Are you sure you want to delete this log?";
  }
  toggleModal("confirmActionModal", true);
}

/* Close confirm modal */
function closeConfirmAction() {
  toggleModal("confirmActionModal", false);
}

/* Execute confirmed action */
async function confirmAction() {
  closeConfirmAction();

  if (confirmType === "block" && selectedMobile) {
    const targetMobile = selectedMobile.trim();
    try {
      const res = await fetch("/api/users/block", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ mobile: targetMobile })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to block");

      closeLogModal();
      openSuccessPopup("User has been blocked successfully.");
      showLogs();
    } catch (err) {
      console.error("❌ Block failed:", err);
      openSuccessPopup("Error: " + err.message);
    }
  } else if (confirmType === "delete" && selectedLogIndex !== null) {
    const log = logsData[selectedLogIndex];
    if (!log) return;
    try {
      await fetch(`/api/logs/${log.id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      closeLogModal();
      openSuccessPopup("Log deleted successfully.");
      showLogs();
    } catch (e) {}
  }
}

/* Close block confirmation modal */
function closeBlockConfirm() {
  toggleModal("blockConfirmModal", false);
}

/* Open success popup */
function openSuccessPopup(message) {
  const msg = document.getElementById("successMessage");
  if (msg) msg.innerText = message;
  toggleModal("successModal", true);
}

/* Close success popup */
function closeSuccessPopup() {
  toggleModal("successModal", false);
}

/* Export logs as Excel */
function exportCSV() {
  exportLogs();
}

/* Select/deselect all log checkboxes */
function toggleSelectAllLogs() {
  const master = document.getElementById("selectAllLogs");
  const checks = document.querySelectorAll(".logCheck");
  checks.forEach(c => c.checked = master.checked);
  updateBulkPanel();
}

/* Show/hide bulk actions bar */
function updateBulkPanel() {
  const checked = document.querySelectorAll(".logCheck:checked");
  const bar = document.getElementById("bulkActionsLogs");
  if (bar) {
    bar.style.display = checked.length > 0 ? "flex" : "none";
  }
}

/* Block selected users */
async function blockSelectedUsers() {
  const checked = document.querySelectorAll(".logCheck:checked");
  const mobiles = new Set();
  checked.forEach(c => {
    const log = logsData[c.value];
    if (log && log.mobile) mobiles.add(log.mobile);
  });

  for (const mobile of mobiles) {
    try {
      await fetch("/api/users/block", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ mobile })
      });
    } catch (e) {}
  }
  openSuccessPopup(`${mobiles.size} user(s) blocked.`);
  showLogs();
}

/* Delete selected logs */
async function deleteSelectedLogs() {
  const checked = document.querySelectorAll(".logCheck:checked");
  for (const c of checked) {
    const log = logsData[c.value];
    if (!log) continue;
    try {
      await fetch(`/api/logs/${log.id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
    } catch (e) {}
  }
  openSuccessPopup(`${checked.length} log(s) deleted.`);
  showLogs();
}

/* Toggle mobile sidebar */
function toggleMenu() {
  document.querySelector(".sidebar")?.classList.toggle("active");
  document.querySelector(".overlay")?.classList.toggle("active");
}

/**
 * ============================================================================
 * public/admin/userDetails.js — Admin User Monitoring & Access Control
 * ============================================================================
 * Handles administrative oversight of users/students:
 * - Real-time user listing and status tracking (Online/Offline)
 * - Detailed user activity profiles (View/Download history)
 * - Access control management (Block/Unblock users)
 * - Geographic distribution tracking per user
 * - Bulk user management (Bulk delete logs / Bulk block)
 * ============================================================================
 */

/* ----------------------------------------------------------------------------
   GLOBAL STATE & CONSTANTS
   ---------------------------------------------------------------------------- */
const token = localStorage.getItem("token");

/* Immediate session validation */
if (!token || token === "null") {
  window.location.href = "/admin/login.html";
}

let usersData = {};          /* Grouped logs by mobile number */
let blockedUsersList = [];   /* List of blocked mobile numbers */
let currentPage = 1;         /* Main table pagination */
const rowsPerPage = 10;

let popupLogs = [];          /* Current user's logs in focus */
let popupPage = 1;
const popupRows = 5;

let confirmType = "";        /* Active confirmation modal context */
let confirmMobile = null;     /* Mobile(s) being acted upon */

/**
 * ============================================================
 * SECTION 1 — INITIALIZATION & DATA REFRESH
 * ============================================================
 */

document.addEventListener("DOMContentLoaded", () => {
  loadUsers();
  initSidebarProfile();
  
  /* Periodic session verification */
  setInterval(() => {
    const token = localStorage.getItem("token");
    if (!token || token === "null") logoutUser();
  }, 5000);

  /* Periodic refresh for status updates */
  setInterval(loadUsers, 30000); 
});

async function loadUsers() {
  try {
    /* 1. Sync blocked status */
    const blockRes = await fetch("/api/users/blocked", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (blockRes.status === 401) return logoutUser();
    blockedUsersList = (await blockRes.json()).map(u => u.mobile);

    /* 2. Fetch activity logs (Master data for users) */
    const res = await fetch("/api/logs?page=1&limit=1000", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) throw new Error();

    const data = await res.json();
    const logs = data.logs || [];

    const grouped = {};

    logs.forEach(log => {
      const key = log.mobile && log.mobile !== "Unknown" ? log.mobile : "Unknown";
        if (!grouped[key]) grouped[key] = [];
          grouped[key].push(log);
        });
      usersData = grouped;
    renderUserTable();
  } catch (err) {
    console.error("❌ [USERS] Refresh failed");
  }
}

/**
 * ============================================================
 * SECTION 2 — USER TABLE RENDERING
 * ============================================================
 */

function renderUserTable() {
  const table = document.getElementById("userTable");
  const search = document.getElementById("searchUsers")?.value.toLowerCase().trim() || "";
  if (!table) return;

  const mobiles = Object.keys(usersData).filter(m => {
    const name = (usersData[m][0].name || "").toLowerCase();
    return (name.includes(search) || m.includes(search)) && !blockedUsersList.includes(m);
  });

  const start = (currentPage - 1) * rowsPerPage;
  const pageItems = mobiles.slice(start, start + rowsPerPage);

  table.innerHTML = "";
  pageItems.forEach(mobile => {
    const logs = usersData[mobile];
    const name = logs[0].name || "Unknown";
    const status = getUserOnlineStatus(logs);
    const location = getBestLocation(logs);

    table.innerHTML += `
      <tr>
        <td data-label="Select"><input type="checkbox" class="userCheck" value="${mobile}" onchange="updateBulkPanel()"></td>
        <td data-label="Name">
          <div class="user-name">
            <div class="user-avatar" style="background:${getAvatarColor(name)}">${name.charAt(0).toUpperCase()}</div>
            <span>${escapeHTML(name)}</span>
          </div>
        </td>
        <td data-label="Mobile">${escapeHTML(mobile)}</td>
        <td data-label="Status"><span class="status ${status}"><span class="status-dot"></span>${status === 'online' ? 'Online' : 'Offline'}</span></td>
        <td data-label="Location">${escapeHTML(location)}</td>
        <td data-label="Visits">${logs.length}</td>
        <td data-label="Action"><button class="view-btn" onclick="openUserDetails('${mobile}')">View Profile</button></td>
      </tr>
    `;
  });

  updatePaginationUI(mobiles.length);
}
function openUserDetails(mobile) {
  const logs = usersData[mobile];
  if (!logs || logs.length === 0) return;

  const name = logs[0].name || "Unknown";

  document.getElementById("avatarCircle").innerText =
    name.charAt(0).toUpperCase();

  document.getElementById("uName").innerText = name;
  document.getElementById("uMobile").innerText = mobile;
  document.getElementById("uVisits").innerText = logs.length;

  const sortedLogs = [...logs].sort(
    (a, b) => new Date(b.viewed_at) - new Date(a.viewed_at)
  );

  const lastVisit = sortedLogs[0]?.viewed_at;
  document.getElementById("uLastVisit").innerText =
    lastVisit ? new Date(lastVisit).toLocaleString() : "-";

  document.getElementById("uLocation").innerText = getBestLocation(logs);

  const status = getUserOnlineStatus(logs);
  document.getElementById("uStatus").innerHTML = 
    `<span class="status ${status}"><span class="status-dot"></span>${status === "online" ? "Online" : "Offline"}</span>`;

  popupLogs = sortedLogs;
  popupPage = 1;
  renderPopupTable();
  document.getElementById("userModal").style.display = "flex";
}

function updatePaginationUI(totalItems) {
  const pageInfo = document.getElementById("pageInfo");
  if (!pageInfo) return;

  const totalPages = Math.ceil(totalItems / rowsPerPage) || 1;
  pageInfo.innerText = `Page ${currentPage} of ${totalPages}`;

  /* Update button states if needed */
  const prevBtn = document.querySelector(".pagination button:first-child");
  const nextBtn = document.querySelector(".pagination button:last-child");

  if (prevBtn) prevBtn.disabled = (currentPage === 1);
  if (nextBtn) nextBtn.disabled = (currentPage === totalPages);
}

function getBestLocation(logs) {
  if (!logs || logs.length === 0) return "Not Available";
  const sorted = [...logs].sort((a,b) => new Date(b.viewed_at) - new Date(a.viewed_at));
  for (let log of sorted) {
    const loc = formatLocation(log);
    if (loc !== "Not Available") return loc;
  }
  return "Not Available";
}

function renderPopupTable() {
  const table = document.getElementById("uFileTable");
  if (!table) return;

  const start = (popupPage - 1) * popupRows;
  const pageLogs = popupLogs.slice(start, start + popupRows);

  table.innerHTML = "";
  if (pageLogs.length === 0) {
    table.innerHTML = `<tr><td colspan="2" style="text-align:center; padding: 20px;">No activity found</td></tr>`;
  } else {
    pageLogs.forEach(log => {
      table.innerHTML += `
        <tr>
          <td data-label="File">${escapeHTML(log.file || log.file_name || "Unknown File")}</td>
          <td data-label="Viewed At">${log.viewed_at ? new Date(log.viewed_at).toLocaleString() : "-"}</td>
        </tr>
      `;
    });
  }
  renderPopupPagination();
}

function renderPopupPagination() {
  const container = document.getElementById("popupPagination");
  if (!container) return;

  const totalPages = Math.ceil(popupLogs.length / popupRows);
  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <button onclick="changePopupPage(-1)" ${popupPage === 1 ? 'disabled' : ''}>Prev</button>
    <span id="popupPageInfo">Page ${popupPage} of ${totalPages}</span>
    <button onclick="changePopupPage(1)" ${popupPage === totalPages ? 'disabled' : ''}>Next</button>
  `;
}

function changePopupPage(dir) {
  const totalPages = Math.ceil(popupLogs.length / popupRows);
  const newPage = popupPage + dir;
  if (newPage >= 1 && newPage <= totalPages) {
    popupPage = newPage;
    renderPopupTable();
  }
}


function closeUserModal() {
  document.getElementById("userModal").style.display = "none";
}

/**
 * ============================================================
 * SECTION 3 — ACCESS CONTROL (Block/Unblock)
 * ============================================================
 */

async function blockUser(mobile) {
  if (!mobile) return;
  const targetMobile = mobile.trim();
  try {
    const res = await fetch("/api/users/block", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ mobile: targetMobile })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to block");

    await loadUsers(); /* Master refresh */
    toggleModal("userModal", false);
  } catch (err) {
    console.error("❌ Block failed:", err);
    openSuccessPopup("Error: " + err.message);
  }
}

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

    await loadUsers(); 
    openBlockedModal(); /* Refresh the blocked users table modal */
  } catch (err) {
    console.error("❌ Unblock failed:", err);
  }
}

/**
 * ============================================================
 * SECTION 4 — LOG MANAGEMENT (Delete)
 * ============================================================
 */

async function deleteUserLogs(mobile) {
  if (!confirm("Are you sure? This will delete all activity history for this user.")) return;
  try {
    await fetch("/api/users/delete-user-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ mobile })
    });
    loadUsers();
    toggleModal("userModal", false);
  } catch (e) {}
}

/**
 * ============================================================
 * SECTION 5 — UTILITIES & UI HELPERS
 * ============================================================
 */

function getUserOnlineStatus(logs) {
  const latest = logs.map(l => l.last_active || l.viewed_at).sort((a,b) => new Date(b) - new Date(a))[0];
  if (!latest) return "offline";
  return (Date.now() - new Date(latest).getTime()) <= 300000 ? "online" : "offline";
}

function getAvatarColor(name) {
  const colors = ["#6366f1", "#10b981", "#f59e0b", "#0ea5e9", "#ef4444"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function toggleModal(id, show) {
  const el = document.getElementById(id);
  if (el) el.style.display = show ? "flex" : "none";
}

function formatLocation(log) {
  if (!log) return "Not Available";

  const state = log.state || "";
  const country = log.country || "";

  if (!state && !country) return "Not Available";

  /* Remove redundency if state and country are same */
  if (state === country) return country;

  return [state, country].filter(Boolean).join(", ");
}

function escapeHTML(str) {
  if (!str) return "";
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(str).replace(/[&<>"']/g, m => map[m]);
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

/* Admin Heartbeat Removed */

/**
 * ============================================================
 * SECTION 6 — MISSING FUNCTIONS (Blocked, Bulk, Pagination, Modals)
 * ============================================================
 */

/* Open blocked users modal */
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

/* Alias for backwards compatibility */
function openBlockedList() {
  openBlockedModal();
}

/* Close blocked modal */
function closeBlockedModal() {
  toggleModal("blockedModal", false);
}

/* Open success popup */
function openSuccessPopup(message) {
  const msg = document.getElementById("successMessage");
  if (msg) msg.innerText = message;
  const modal = document.getElementById("successModal");
  if (modal) modal.style.display = "flex";
}

/* Close success popup */
function closeSuccessPopup() {
  const modal = document.getElementById("successModal");
  if (modal) modal.style.display = "none";
}

/* Toggle select all user checkboxes */
function toggleSelectAll() {
  const master = document.getElementById("selectAllUsers");
  const checks = document.querySelectorAll(".userCheck");
  checks.forEach(c => c.checked = master.checked);
  updateBulkPanel();
}

/* Show/hide bulk actions bar */
function updateBulkPanel() {
  const checked = document.querySelectorAll(".userCheck:checked");
  const bar = document.getElementById("bulkActions");
  if (bar) {
    bar.style.display = checked.length > 0 ? "flex" : "none";
  }
}

/* Block selected users */
async function blockSelected() {
  const checked = document.querySelectorAll(".userCheck:checked");
  for (const c of checked) {
    try {
      await fetch("/api/users/block", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ mobile: c.value })
      });
    } catch (e) {}
  }
  openSuccessPopup(`${checked.length} user(s) blocked.`);
  loadUsers();
}

/* Delete selected user logs */
async function deleteSelected() {
  const checked = document.querySelectorAll(".userCheck:checked");
  for (const c of checked) {
    try {
      await fetch("/api/users/delete-user-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ mobile: c.value })
      });
    } catch (e) {}
  }
  openSuccessPopup(`${checked.length} user(s) logs deleted.`);
  loadUsers();
}

/* Block user from popup (no parameter — uses current popup mobile) */
function blockUserFromPopup() {
  const mobile = document.getElementById("uMobile")?.innerText;
  if (!mobile) return;
  confirmType = "block";
  confirmMobile = mobile;
  document.getElementById("confirmTitle").innerText = "Block User";
  document.getElementById("confirmMessage").innerText = `Block mobile ${mobile}?`;
  toggleModal("confirmModal", true);
}

/* Delete user logs from popup */
function deleteUserFromPopup() {
  const mobile = document.getElementById("uMobile")?.innerText;
  if (!mobile) return;
  confirmType = "delete";
  confirmMobile = mobile;
  document.getElementById("confirmTitle").innerText = "Delete User Data";
  document.getElementById("confirmMessage").innerText = `Delete all logs for ${mobile}?`;
  toggleModal("confirmModal", true);
}

/* Close confirm modal */
function closeConfirm() {
  toggleModal("confirmModal", false);
}

/* Execute confirmed action for userDetails */
async function confirmAction() {
  closeConfirm();

  if (confirmType === "block" && confirmMobile) {
    await blockUser(confirmMobile);
    openSuccessPopup("User blocked successfully.");
  } else if (confirmType === "delete" && confirmMobile) {
    await deleteUserLogs(confirmMobile);
    openSuccessPopup("User logs deleted.");
  }
}

/* Previous page */
function prevPage() {
  const mobiles = Object.keys(usersData).filter(m => !blockedUsersList.includes(m));
  const totalPages = Math.ceil(mobiles.length / rowsPerPage) || 1;
  if (currentPage > 1) {
    currentPage--;
    renderUserTable();
  }
}

/* Next page */
function nextPage() {
  const mobiles = Object.keys(usersData).filter(m => !blockedUsersList.includes(m));
  const totalPages = Math.ceil(mobiles.length / rowsPerPage) || 1;
  if (currentPage < totalPages) {
    currentPage++;
    renderUserTable();
  }
}

/* Toggle mobile sidebar */
function toggleMenu() {
  document.querySelector(".sidebar")?.classList.toggle("active");
  document.querySelector(".overlay")?.classList.toggle("active");
}


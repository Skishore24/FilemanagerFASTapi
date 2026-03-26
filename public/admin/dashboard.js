/**
 * ============================================================================
 * public/admin/dashboard.js — Admin Analytics & Monitoring Logic
 * ============================================================================
 * Provides real-time insights and data visualizations for administrators:
 * - Session-based authentication guard
 * - Dynamic summary statistic cards with animated counters
 * - Advanced data visualizations (Line, Doughnut, Bar charts)
 * - Interactive World Map for geographic distribution
 * - Live user activity monitoring and status tracking
 * - Smart polling with visibility-aware pause/resume
 * ============================================================================
 */

/* ----------------------------------------------------------------------------
   GLOBAL CONFIGURATION & STATE
   ---------------------------------------------------------------------------- */
const API_BASE = "/api/dashboard";
const REFRESH_INTERVAL = 30000; /* Refresh data every 30 seconds */

let pollTimer = null;           /* Handle for the main polling interval */
let charts = {                  /* Store active Chart.js instances */
  performance: null,
  devices: null,
  users: null,
  map: null
};

/**
 * ============================================================
 * SECTION 1 — AUTHENTICATION GUARD & BOOTSTRAP
 * ============================================================
 */

/**
 * Initial security check and data bootstrap.
 */
document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("token");

  /* Immediate redirect if no session exists */
  if (!token || token === "null") {
    window.location.href = "/admin/login.html";
    return;
  }

  /* Initialize Dashboard */
  initSidebarProfile();
  await refreshDashboard();
  startAutoRefresh();

  /* Periodic session verification */
  setInterval(() => {
    const token = localStorage.getItem("token");
    if (!token) handleSessionExpired();
  }, 5000);
});

/**
 * initSidebarProfile()
 * Fetches and displays admin identity in the header.
 */
function initSidebarProfile() {
  const user = JSON.parse(localStorage.getItem("currentUser") || "{}");
  const el = document.getElementById("userEmail");
  if (el) el.innerText = user.email || "Admin";
}

/**
 * refreshDashboard()
 * Orchestrates the full data refresh across stats and charts.
 */
async function refreshDashboard() {
  const summaryTask = updateSummaryStats();
  const chartsTask = loadAnalyticsCharts();
  
  await Promise.allSettled([summaryTask, chartsTask]);
}

/**
 * ============================================================
 * SECTION 2 — SUMMARY STATISTICS & ANIMATION
 * ============================================================
 */

/**
 * updateSummaryStats()
 * Fetches top-level KPIs and updates the UI cards.
 */
async function updateSummaryStats() {
  try {
    const res = await apiFetch(API_BASE);
    if (!res) return;

    const data = await res.json();
    
    animateCounter("totalFiles", data.totalFiles || 0);
    animateCounter("totalViews", data.totalViews || 0);
    animateCounter("totalCategories", data.totalCategories || 0);
    animateCounter("activeUsers", data.totalUsers || 0);
    
    const topFileEl = document.getElementById("topFile");
    if (topFileEl) topFileEl.innerText = data.topFile || "N/A";

  } catch (err) {
    console.error("❌ [STATS] Update failed:", err);
  }
}

/**
 * animateCounter(id, target)
 * Smoothly iterates a number from current to target value.
 */
function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;

  let current = parseInt(el.innerText) || 0;
  if (current === target) return;

  const duration = 1000; /* 1 second animation */
  const frameRate = 30;
  const totalFrames = (duration / 1000) * frameRate;
  const increment = (target - current) / totalFrames;

  let frame = 0;
  const timer = setInterval(() => {
    frame++;
    current += increment;
    
    if (frame >= totalFrames) {
      el.innerText = target;
      clearInterval(timer);
    } else {
      el.innerText = Math.floor(current);
    }
  }, 1000 / frameRate);
}

/**
 * ============================================================
 * SECTION 3 — ANALYTICS & VISUALIZATIONS
 * ============================================================
 */

async function loadAnalyticsCharts() {
  try {
    const res = await apiFetch(`${API_BASE}/charts`);
    if (!res) return;

    const data = await res.json();

    renderPerformanceChart(data.performance || []);
    renderDeviceUsageChart(data.devices || []);
    renderUserActivityChart(data.views || []);
    
    /* Geographic distribution delayed for container readiness */
    setTimeout(() => {
      renderGeographicMap(data.countries || []);
      populateTopCountriesTable(data.countries || []);
    }, 250);

    if (data.topUsers) populateActiveUsersTable(data.topUsers);

  } catch (err) {
    console.error("❌ [CHARTS] Loading failed:", err);
  }
}

function renderPerformanceChart(rawData) {
  const data = processTimelineData(rawData, ["views", "downloads"]);
  const ctx = getCanvasContext("performanceChart");
  if (!ctx) return;

  destroyChart("performance");

  /* Blue Gradient for Views */
  const viewsGradient = ctx.createLinearGradient(0, 0, 0, 300);
  viewsGradient.addColorStop(0, "rgba(99, 102, 241, 0.4)");
  viewsGradient.addColorStop(1, "rgba(99, 102, 241, 0)");

  /* Pink Gradient for Downloads */
  const downloadsGradient = ctx.createLinearGradient(0, 0, 0, 300);
  downloadsGradient.addColorStop(0, "rgba(236, 72, 153, 0.4)");
  downloadsGradient.addColorStop(1, "rgba(236, 72, 153, 0)");

  charts.performance = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.map(d => d.month),
      datasets: [
        {
          label: "Views",
          data: data.map(d => d.views),
          borderColor: "#6366f1",
          backgroundColor: viewsGradient,
          fill: true,
          tension: 0.4,
          pointRadius: 4
        },
        {
          label: "Downloads",
          data: data.map(d => d.downloads),
          borderColor: "#ec4899",
          backgroundColor: downloadsGradient,
          fill: true, /* Solid fill like Views */
          tension: 0.4,
          pointRadius: 4 /* No borderDash (solid line) */
        }
      ]
    },
    options: premiumChartOptions({ maintainAspectRatio: false })
  });
}

function renderDeviceUsageChart(rawData) {
  const ctx = getCanvasContext("deviceChart");
  if (!ctx) return;

  destroyChart("devices");

  /* Aggregate duplicates */
  const aggregated = rawData.reduce((acc, curr) => {
    const key = (curr.device || "Other").trim();
    acc[key] = (acc[key] || 0) + (curr.total || 0);
    return acc;
  }, {});

  const labels = Object.keys(aggregated);
  const values = Object.values(aggregated);

  charts.devices = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#3b82f6"],
        hoverOffset: 12,
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "70%",
      plugins: {
        legend: { position: "bottom", labels: { usePointStyle: true, padding: 20 } }
      }
    }
  });
}

function renderUserActivityChart(rawData) {
  const data = processTimelineData(rawData, ["total"]);
  const ctx = getCanvasContext("usersChart");
  if (!ctx) return;

  destroyChart("users");

  charts.users = new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.map(d => d.month),
      datasets: [{
        label: "Unique Visitors",
        data: data.map(d => d.total),
        backgroundColor: "#6366f1",
        borderRadius: 6,
        barThickness: 24
      }]
    },
    options: premiumChartOptions({ 
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    })
  });
}

/**
 * ============================================================
 * SECTION 4 — GEOGRAPHIC DATA (World Map)
 * ============================================================
 */

/* Mapping common country names to ISO-2 codes for jsVectorMap */
function getCountryCode(name) {
  if (!name) return null;
  const normalized = name.trim().toLowerCase();
  const map = {
    "india": "IN",
    "united states": "US",
    "united kingdom": "GB",
    "united arab emirates": "AE",
    "singapore": "SG",
    "malaysia": "MY",
    "germany": "DE",
    "france": "FR",
    "canada": "CA",
    "australia": "AU"
  };
  return map[normalized] || normalized.toUpperCase(); 
}

function renderGeographicMap(countries) {
  if (typeof jsVectorMap === "undefined") return;
  const container = document.getElementById("worldMap");
  if (!container) return;

  container.innerHTML = ""; /* Clear previous */

  const mapData = {};
  const tooltips = {};

  countries.forEach(c => {
    if (c.country) {
      const code = getCountryCode(c.country);
      if (code) {
        mapData[code] = (mapData[code] || 0) + c.views;
        tooltips[code] = `Views: ${mapData[code]} | Downloads: ${c.downloads}`;
      }
    }
  });

  charts.map = new jsVectorMap({
    selector: "#worldMap",
    map: "world",
    series: {
      regions: [{
        values: mapData,
        scale: ["#e0e7ff", "#4f46e5"],
        normalizeFunction: "polynomial"
      }]
    },
    onRegionTooltipShow(event, tooltip, code) {
      if (tooltips[code]) {
        tooltip.text(`${tooltip.text()} (${tooltips[code]})`);
      }
    }
  });
}

function populateTopCountriesTable(countries) {
  const tbody = document.getElementById("topCountries");
  if (!tbody) return;

  tbody.innerHTML = "";
  countries.sort((a, b) => b.views - a.views);

  const maxViews = countries[0]?.views || 1;

  countries.slice(0, 5).forEach(c => {
    const code = (c.country || "UN").toLowerCase();
    const percent = Math.round((c.views / maxViews) * 100);
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        <div class="country-cell">
          <img src="https://flagcdn.com/24x18/${code}.png" class="flag-icon" onerror="this.remove()">
          <span class="country-name">${escapeHTML(c.country || "Unknown")}</span>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" style="width: ${percent}%"></div>
        </div>
      </td>
      <td class="text-right font-semibold">${c.views.toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * ============================================================
 * SECTION 5 — USER MONITORING
 * ============================================================
 */

function populateActiveUsersTable(users) {
  const tbody = document.getElementById("recentUsers");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!users || users.length === 0) {
    tbody.innerHTML = "<tr><td colspan='4' class='text-center muted'>No active users found</td></tr>";
    return;
  }

  users.forEach(u => {
    const isOnline = u.lastActive && (new Date() - new Date(u.lastActive)) / 1000 <= 120;
    const statusClass = isOnline ? "badge-online" : "badge-offline";
    const initials = (u.name || "U").charAt(0).toUpperCase();

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div class="user-info">
          <div class="avatar-circle">${initials}</div>
          <span class="user-name">${escapeHTML(u.name || "Unknown")}</span>
        </div>
      </td>
      <td>${u.mobile || "-"}</td>
      <td>${u.totalVisits || 0}</td>
      <td>
        <span class="status ${isOnline ? 'online' : 'offline'}">
          <span class="status-dot"></span>
          ${isOnline ? 'Online' : 'Offline'}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * ============================================================
 * SECTION 6 — UTILITIES & SHARED LOGIC
 * ============================================================
 */

function apiFetch(url) {
  const token = localStorage.getItem("token");
  return fetch(url, {
    headers: { "Authorization": `Bearer ${token}` }
  }).then(res => {
    /* Step 6 — Handle 401 (Expired) and 403 (Invalid/Forbidden) errors identically */
    if (res.status === 401 || res.status === 403) {
      handleSessionExpired();
      return null;
    }
    return res;
  });
}
function toggleMenu() {
  document.querySelector(".sidebar").classList.toggle("active");
  document.querySelector(".overlay").classList.toggle("active");
}

function closeMenu() {
  document.querySelector(".sidebar").classList.remove("active");
  document.querySelector(".overlay").classList.remove("active");
}
function handleSessionExpired() {
  alert("Your session has expired. Please login again.");
  localStorage.clear();
  window.location.href = "/admin/login.html";
}

function processTimelineData(data, fields) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months.map(m => {
    const entry = data.find(d => d.month === m);
    if (entry) return entry;
    const placeholder = { month: m };
    fields.forEach(f => placeholder[f] = 0);
    return placeholder;
  });
}

function getCanvasContext(id) {
  const canvas = document.getElementById(id);
  return canvas ? canvas.getContext("2d") : null;
}

function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    charts[key] = null;
  }
}

function premiumChartOptions(overrides = {}) {
  return {
    responsive: true,
    animation: { duration: 1000, easing: "easeOutQuart" },
    plugins: {
      legend: { labels: { font: { family: "Inter, sans-serif", size: 12 } } },
      tooltip: { 
        backgroundColor: "rgba(17, 24, 39, 0.9)", 
        padding: 12, 
        titleFont: { size: 13 },
        bodyFont: { size: 13 },
        cornerRadius: 8
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { family: "Inter" } } },
      y: { border: { dash: [4, 4] }, grid: { color: "rgba(0,0,0,0.05)" }, beginAtZero: true }
    },
    ...overrides
  };
}

function escapeHTML(str) {
  if (!str) return "";
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return str.replace(/[&<>"']/g, m => map[m]);
}

/**
 * ============================================================
 * SECTION 7 — POLLING & SYSTEM EVENTS
 * ============================================================
 */

function startAutoRefresh() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (!document.hidden) refreshDashboard();
  }, REFRESH_INTERVAL);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refreshDashboard();
    startAutoRefresh();
  } else {
    clearInterval(pollTimer);
    pollTimer = null;
  }
});

/* Global event to force refresh */
window.addEventListener("refreshDashboard", refreshDashboard);

/**
 * logoutAdmin()
 * Clears local session and redirects.
 */
function logoutUser() {
  localStorage.clear();
  window.location.href = "/admin/login.html";
}

const token = localStorage.getItem("token");

if(!token || token === "null"){
  window.location.href="/admin/login.html";
}

document.addEventListener("DOMContentLoaded", async () => {

  const token = localStorage.getItem("token");

  if(!token || token === "null"){
    window.location.href="/admin/login.html";
    return;
  }

  loadUserInfo();
  await updateDashboard();
  await loadCharts();
});


function loadUserInfo(){

  let emailEl = document.getElementById("userEmail");

  // Try localStorage first
  let currentUser = JSON.parse(localStorage.getItem("currentUser"));

  if(currentUser && emailEl){
    emailEl.innerText = currentUser.email;
    return;
  }

  // Fallback → JWT token
  let token = localStorage.getItem("token");

  if(!token) return;

  try{
    let payload = JSON.parse(atob(token.split('.')[1]));

    if(emailEl){
      emailEl.innerText = payload.email || "";
    }

  }catch(err){
    console.log("Token decode error", err);
  }
}

async function updateDashboard(){
  try {
let token = localStorage.getItem("token");

let res = await fetch("/api/dashboard", {
  headers: {
    "Authorization": "Bearer " + token
  }
});

if(!res.ok){
  console.log("Charts API failed:", res.status);
  return;
}


let data = await res.json();
console.log("Charts API:", data);


    document.getElementById("totalFiles").innerText = data.totalFiles || 0;
    document.getElementById("totalViews").innerText = data.totalViews || 0;
    document.getElementById("totalCategories").innerText = data.totalCategories || 0;
    document.getElementById("activeUsers").innerText = data.totalUsers || 0;
    document.getElementById("topFile").innerText = data.topFile || "None";

  } catch (err) {
    console.log("Dashboard load error", err);
  }
}
function loadTopUsers(users){
  const tbody = document.getElementById("recentUsers");
  tbody.innerHTML = "";

  if(!users || users.length === 0){
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center">No users found</td>
      </tr>`;
    return;
  }

  users.forEach(u => {

    let status = "Offline";

    if(u.lastActive){
      let last = new Date(u.lastActive);
      let diff = (new Date() - last) / 1000;

      if(diff <= 120){
        status = "Online";
      }
    }

    let tr = document.createElement("tr");

tr.innerHTML = `
 <td>
  <div class="user-info">
    <div class="avatar-circle">
      ${(u.name || "U")[0].toUpperCase()}
    </div>
    <span>${u.name || "Unknown"}</span>
  </div>
</td>

  <td>${u.mobile || "-"}</td>
  <td>${u.totalVisits}</td>
  <td>
    <span class="${status === 'Online' ? 'badge-online' : 'badge-offline'}">
      ${status}
    </span>
  </td>
`;

    tbody.appendChild(tr);
  });
}

async function loadCharts(){
  console.log("loadCharts called");   // add this
  try{

let token = localStorage.getItem("token");

let res = await fetch("/api/dashboard/charts", {
  headers: {
    "Authorization": "Bearer " + token
  }
});


    if(!res.ok){
      console.log("API error");
      return;
    }

    let data = await res.json();
if(data.performance) drawPerformanceChart(data.performance);

    if(data.devices) drawDeviceChart(data.devices);
if(data.views && data.views.length){
  drawUsersChart(data.views);
}else{
  console.log("Users chart: no data");
}
  if(data.countries && data.countries.length){
  setTimeout(()=>{
    drawWorldMap(data.countries);
    loadTopCountries(data.countries);
  },200);
}

if(data.topUsers) loadTopUsers(data.topUsers);

  }catch(err){
    console.log("Chart load error:", err);
  }
}
function drawPerformanceChart(data){

  data = fillMissingMonths(data,"performance");

  const canvas = document.getElementById("performanceChart");
  if(!canvas) return;

  const ctx = canvas.getContext("2d");

  if(window.performanceChart && typeof window.performanceChart.destroy === "function"){
    window.performanceChart.destroy();
  }

  // Gradient for Views
  const gradientViews = ctx.createLinearGradient(0,0,0,300);
  gradientViews.addColorStop(0,"rgba(59,130,246,0.5)");
  gradientViews.addColorStop(1,"rgba(59,130,246,0)");

  // Gradient for Downloads
  const gradientDownloads = ctx.createLinearGradient(0,0,0,300);
  gradientDownloads.addColorStop(0,"rgba(236,72,153,0.5)");
  gradientDownloads.addColorStop(1,"rgba(236,72,153,0)");

  window.performanceChart = new Chart(ctx,{
    type:"line",
    data:{
      labels: data.map(d=>d.month),
      datasets:[
        {
          label:"Views",
          data: data.map(d=>d.views),
          borderColor:"#3b82f6",
          backgroundColor:gradientViews,
          fill:true,
          tension:0.4,
          pointRadius:4
        },
        {
          label:"Downloads",
          data: data.map(d=>d.downloads),
          borderColor:"#ec4899",
          backgroundColor:gradientDownloads,
          fill:true,
          tension:0.4,
          pointRadius:4
        }
      ]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation:{
        duration:1500,
        easing:"easeOutQuart"
      },
      plugins:{
        legend:{
          labels:{
            font:{ size:12 }
          }
        },
        tooltip:{
          backgroundColor:"#111827",
          padding:10
        }
      },
      scales:{
        x:{
          grid:{ display:false }
        },
        y:{
          grid:{
            color:"rgba(0,0,0,0.05)"
          },
          beginAtZero:true
        }
      }
    }
  });
}


function drawDeviceChart(devices){
  const canvas = document.getElementById("deviceChart");
  if(!canvas) return;

  const ctx = canvas.getContext("2d");

  if(window.deviceChart && typeof window.deviceChart.destroy === "function"){
    window.deviceChart.destroy();
  }

  window.deviceChart = new Chart(ctx,{
    type:"doughnut",
    data:{
      labels: devices.map(d=>d.device),
      datasets:[{
        data: devices.map(d=>d.total),
        backgroundColor:[
          "#6366f1",
          "#10b981",
          "#f59e0b",
          "#ec4899",
          "#3b82f6"
        ],
        borderWidth:0
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      cutout:"65%",
      animation:{
        animateRotate:true,
        duration:1200
      },
      plugins:{
        legend:{ position:"bottom" }
      }
    }
  });
}
function drawUsersChart(views){

  views = fillMissingMonths(views,"users");

  const canvas = document.getElementById("usersChart");
  if(!canvas) return;

  const ctx = canvas.getContext("2d");

  // Destroy old chart safely
  if(window.usersChart){
    try{
      window.usersChart.destroy();
    }catch(e){
      console.log("Chart destroy error:", e);
    }
    window.usersChart = null;
  }

  // Create fresh chart
  window.usersChart = new Chart(ctx,{
    type:"bar",
    data:{
      labels: views.map(v=>v.month),
      datasets:[{
        label:"Users",
        data: views.map(v=>v.total),
        backgroundColor:"#6366f1",
        borderRadius:8,
        barThickness:30
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{ legend:{ display:false }},
      scales:{
        x:{ grid:{ display:false }},
        y:{ beginAtZero:true }
      }
    }
  });
}

function fillMissingMonths(data, type="performance"){
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  let result = months.map(month=>{
    let found = data.find(d => d.month === month);

    if(found) return found;

    // default values if month not found
    if(type === "performance"){
      return { month, views:0, downloads:0 };
    }else{
      return { month, total:0 };
    }
  });

  return result;
}

function drawWorldMap(countries){
  if(typeof jsVectorMap === "undefined") return;

  const mapContainer = document.getElementById("worldMap");
  if(!mapContainer) return;

  mapContainer.innerHTML = "";

  let data = {};
  let tooltipData = {};

  countries.forEach(c=>{
    if(c.country){
      let code = c.country.toUpperCase().trim();

      data[code] = c.views; // color based on views

      tooltipData[code] = {
        views: c.views,
        downloads: c.downloads
      };
    }
  });

  new jsVectorMap({
    selector:"#worldMap",
    map:"world",
    series:{
      regions:[{
        values:data,
        scale:["#c7d2fe","#4f46e5"],
        normalizeFunction:"polynomial"
      }]
    },

    onRegionTooltipShow(event, tooltip, code){
      let d = tooltipData[code];
      if(d){
        tooltip.text(
          tooltip.text() +
          `\nViews: ${d.views}\nDownloads: ${d.downloads}`
        );
      }
    }
  });
}

function loadTopCountries(countries){
  const tbody = document.getElementById("topCountries");
  if(!tbody) return;

  tbody.innerHTML = "";

  countries.sort((a,b)=>b.views - a.views);

  let max = countries[0]?.views || 1;

  countries.slice(0,5).forEach(c=>{

    let code = (c.country || "UN").toLowerCase();

    let percent = Math.round((c.views / max) * 100);

    let tr = document.createElement("tr");

tr.innerHTML = `
<td>
  <div style="display:flex;align-items:center;gap:10px;">
    <img src="https://flagcdn.com/24x18/${code}.png"
         onerror="this.style.display='none'">
    ${c.country || "Unknown"}
  </div>

  <div style="height:6px;background:#eee;border-radius:6px;margin-top:6px;">
    <div style="width:${percent}%;height:100%;background:#6366f1;border-radius:6px;"></div>
  </div>
</td>
<td>${c.views}</td>
`;


    tbody.appendChild(tr);
  });
}



function logoutUser(){
  localStorage.removeItem("token");
  window.location.href = "/admin/login.html";
}


function toggleMenu(){
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.querySelector(".overlay");

  sidebar.classList.toggle("active");
  overlay.classList.toggle("active");
}
function closeMenu(){
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.querySelector(".overlay");

  sidebar.classList.remove("active");
  overlay.classList.remove("active");
}



setInterval(updateDashboard,10000);

window.addEventListener("refreshDashboard", async ()=>{
  await updateDashboard();
  await loadCharts();
});

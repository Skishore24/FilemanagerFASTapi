console.log("login.js loaded");

async function login(){
  let email = document.getElementById("email").value.trim();
  let password = document.getElementById("password").value.trim();
  let messageBox = document.getElementById("loginMessage");

  messageBox.className = "login-message show"; // show box
  messageBox.innerText = "";

  if(!email || !password){
    messageBox.classList.add("error");
    messageBox.innerText = "Enter email and password";
    return;
  }

  try{
    let res = await fetch("/api/auth/login",{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ email, password })
    });

    let data = await res.json();

    if(data.token){

  messageBox.classList.add("success");
  messageBox.innerText = "Login successful...";

  localStorage.setItem("token", data.token);

  // SAVE ADMIN DETAILS
  localStorage.setItem("currentUser", JSON.stringify({
    email: email,
    name: data.name || "Admin"
  }));

  setTimeout(()=>{
    window.location.href="/admin/dashboard.html";
  },800);
}else{
      messageBox.classList.add("error");
      messageBox.innerText = data.message || "Wrong password";
    }

  }catch(err){
    messageBox.classList.add("error");
    messageBox.innerText = "Server error";
  }
}

document.getElementById("togglePassword").addEventListener("click", function () {
  let passwordInput = document.getElementById("password");
  let icon = this;

  if (passwordInput.type === "password") {
    passwordInput.type = "text";
    icon.classList.remove("fa-eye");
    icon.classList.add("fa-eye-slash");
  } else {
    passwordInput.type = "password";
    icon.classList.remove("fa-eye-slash");
    icon.classList.add("fa-eye");
  }
});
/* ============================================================
   public/admin/login.js — Admin Login Page Logic
   Handles:
   - Form submission (calls /api/auth/login)
   - Password visibility toggle
   - Success redirect to dashboard
   - Error message display
   ============================================================ */

/* ============================================================
   DOM READY — Attach all event listeners once the page loads
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const toggle = document.getElementById("togglePassword");

  /* ---- Form Submit ---------------------------------------- */
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault(); /* Stop default HTML form submission */
      login();
    });
  }

  /* ---- Password Visibility Toggle ------------------------- */
  if (toggle) {
    toggle.addEventListener("click", function () {
      const passwordInput = document.getElementById("password");

      /* Switch between showing and hiding the password */
      if (passwordInput.type === "password") {
        passwordInput.type = "text";
        this.classList.remove("fa-eye");
        this.classList.add("fa-eye-slash");
      } else {
        passwordInput.type = "password";
        this.classList.remove("fa-eye-slash");
        this.classList.add("fa-eye");
      }
    });
  }
});

/* ============================================================
   login()
   Sends credentials to the backend and handles the response.
   On success: saves token to localStorage and redirects to dashboard.
   On failure: shows an error message below the form.
   ============================================================ */
async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const messageBox = document.getElementById("loginMessage");

  /* Reset message box before each attempt */
  messageBox.className = "login-message show";
  messageBox.innerText = "";

  /* Client-side validation */
  if (!email || !password) {
    messageBox.innerText = "Please enter your username and password";
    messageBox.classList.add("error");
    return;
  }

  try {
    /* Send credentials to the backend */
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (data.token) {
      /* Save JWT token for authenticated API calls */
      localStorage.setItem("token", data.token);

      /* Save user details for display in dashboard header */
      if (data.user) {
        localStorage.setItem("currentUser", JSON.stringify(data.user));
      }

      /* Redirect to dashboard on successful login */
      window.location.href = "/admin/dashboard.html";
    } else {
      /* Show server error message (e.g. wrong password) */
      messageBox.classList.add("error");
      messageBox.innerText = data.message || "Login failed. Please try again.";
    }
  } catch (err) {
    messageBox.classList.add("error");
    messageBox.innerText = "Server error. Please try again.";
  }
}

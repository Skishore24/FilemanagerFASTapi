/* ============================================================
   routes/otpRoutes.js — WhatsApp OTP Send & Verify
   POST /api/send-otp    — Send a 6-digit OTP via Twilio WhatsApp
   POST /api/verify-otp  — Verify the OTP entered by the user

   OTP storage is in-memory (process memory).
   OTPs expire after 5 minutes automatically.
   Max 5 failed verification attempts per number before lockout.
   ============================================================ */

const express = require("express");
const router  = express.Router();
const twilio  = require("twilio");
const crypto  = require("crypto");

require("dotenv").config();

/* ---- In-memory stores (reset on server restart) ----------- */
let otpStore       = {}; /* { mobile: { otp, expires } }   — active OTPs     */
let otpAttempts    = {}; /* { mobile: count }               — failed attempts */
let lastOtpRequest = {}; /* { mobile: timestamp }           — cooldown track  */

/* ---- Twilio client setup ---------------------------------- */
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);


/* ============================================================
   POST /api/send-otp
   Sends a 6-digit OTP to the given WhatsApp number.
   Enforces:
   - Mobile number must be in E.164 format (+91xxxxxxxxxx)
   - 30-second cooldown before resend is allowed
   - Cannot request new OTP while a valid one already exists
   ============================================================ */
router.post("/send-otp", async (req, res) => {

  const { mobile } = req.body;

  /* Validate mobile number is in E.164 format (e.g. +919876543210) */
  if (!mobile || !/^\+\d{8,15}$/.test(mobile)) {
    console.log("Invalid mobile received:", mobile);
    return res.status(400).json({
      success: false,
      message: "Invalid mobile format. Use international format like +919876543210"
    });
  }

  /* Enforce 30-second cooldown between OTP requests */
  if (lastOtpRequest[mobile] && Date.now() - lastOtpRequest[mobile] < 30000) {
    return res.status(429).json({ success: false, message: "Please wait 30 seconds before resending" });
  }

  /* Block new request if a valid OTP is already pending */
  if (otpStore[mobile] && Date.now() < otpStore[mobile].expires) {
    return res.status(429).json({ success: false, message: "OTP already sent. Please check your WhatsApp." });
  }

  /* Generate a cryptographically secure 6-digit OTP */
  const otp = crypto.randomInt(100000, 999999);

  /* Record cooldown timestamp and store OTP with 5-minute expiry */
  lastOtpRequest[mobile] = Date.now();
  otpStore[mobile] = {
    otp,
    expires: Date.now() + 5 * 60 * 1000  /* 5 minutes */
  };

  /* Auto-delete OTP after 5 minutes to free memory */
  setTimeout(() => { delete otpStore[mobile]; }, 5 * 60 * 1000);

  /* Send OTP via Twilio WhatsApp */
  try {
    await client.messages.create({
      body: `Your MCET verification OTP is ${otp}. Valid for 5 minutes. Do not share it.`,
      from: `whatsapp:${process.env.TWILIO_PHONE}`,
      to:   `whatsapp:${mobile}`

    });

    res.json({ success: true });

  } catch (err) {
    /* Clean up so user can retry immediately without waiting for cooldown */
    delete otpStore[mobile];
    delete lastOtpRequest[mobile];

    console.error("Twilio send error:", err.message);

    /* Return a friendly 400 instead of 500 so the UI can show the message */
    const friendly = err.message && err.message.includes("unverified")
      ? "This number is not registered in the WhatsApp sandbox. Please send 'join <sandbox-word>' to the Twilio number first."
      : err.message && err.message.includes("To'")
      ? "OTP could not be delivered. Please check your WhatsApp number and try again."
      : "Failed to send OTP. Please try again later.";

    res.status(400).json({ success: false, message: friendly });
  }

});


/* ============================================================
   POST /api/verify-otp
   Verifies the OTP entered by the user.
   Enforces max 5 failed attempts per number to prevent brute force.
   ============================================================ */
router.post("/verify-otp", (req, res) => {

  const { mobile, otp } = req.body;

  /* Initialize attempt counter if this is the first try */
  if (!otpAttempts[mobile]) otpAttempts[mobile] = 0;

  otpAttempts[mobile]++;

  /* Block after 5 failed attempts */
  if (otpAttempts[mobile] > 5) {
    return res.status(429).json({ success: false, message: "Too many failed attempts. Please request a new OTP." });
  }

  /* Check if an OTP was ever requested for this number */
  if (!otpStore[mobile]) {
    return res.status(400).json({ success: false, message: "No OTP found. Please request a new one." });
  }

  /* Check if the OTP has expired */
  if (Date.now() > otpStore[mobile].expires) {
  delete otpStore[mobile];
  delete otpAttempts[mobile]; // important fix
    return res.json({ success: false, message: "OTP has expired. Please request a new one." });
  }

  /* Compare entered OTP with stored OTP (string comparison to handle leading zeros) */
  if (String(otpStore[mobile].otp) === String(otp)) {

    /* OTP matched — clear stored OTP and reset attempt counter */
    delete otpStore[mobile];
    otpAttempts[mobile] = 0;

    return res.json({ success: true });
  }

  /* OTP did not match */
  res.json({ success: false, message: "Incorrect OTP. Please try again." });

});

module.exports = router;
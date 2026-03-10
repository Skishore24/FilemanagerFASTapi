const express = require("express");
const router = express.Router();
const twilio = require("twilio");
require("dotenv").config();

let otpStore = {};

/* TWILIO SETUP */
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/* SEND OTP */
router.post("/send-otp", async (req, res) => {
  const { mobile } = req.body;
  const otp = Math.floor(1000 + Math.random() * 9000);

  otpStore[mobile] = otp;

  try {
    await client.messages.create({
      body: `Your OTP is ${otp}`,
      from: "whatsapp:+14155238886",
      to: `whatsapp:${mobile}`
    });

    res.json({ success: true });

  } catch (err) {
    console.log(err);
    res.json({ success: false });
  }
});

/* VERIFY OTP */
router.post("/verify-otp", (req, res) => {
  const { mobile, otp } = req.body;

  if (otpStore[mobile] == otp) {
    delete otpStore[mobile];
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

module.exports = router;

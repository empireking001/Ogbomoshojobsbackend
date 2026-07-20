import express from "express";
import rateLimit from "express-rate-limit";
import User from "../models/User.js";
import { generateUniqueReferralCode, REFERRAL_POINTS, MILESTONES } from "../utils/referral.js";
import { evaluateFraud, statusForScore } from "../utils/fraud.js";

const router = express.Router();

const writeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  message: { error: "Too many attempts, please try again shortly." },
});

const ROLES = ["Student", "Graduate", "NYSC Member", "Job Seeker", "Employer", "Recruiter"];

// POST /api/waitlist
router.post("/", writeLimiter, async (req, res, next) => {
  try {
    const { fullName, email, phone, role, wantsUpdates, referredBy } = req.body;

    if (!fullName || !email || !role) {
      return res.status(400).json({ error: "Full name, email, and role are required" });
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: "This email is already on the waitlist" });
    }

    const ip = req.ip;
    const userAgent = req.headers["user-agent"] || "";
    const referralCode = await generateUniqueReferralCode();

    let referrer = null;
    let referralStatus = "approved";
    let fraudScore = 0;
    let fraudReasons = [];

    if (referredBy) {
      referrer = await User.findOne({ referralCode: referredBy });
      if (referrer) {
        const evalResult = await evaluateFraud({
          email: normalizedEmail,
          phone,
          ip,
          userAgent,
          referrerCode: referredBy,
        });
        fraudScore = evalResult.score;
        fraudReasons = evalResult.reasons;
        referralStatus = statusForScore(fraudScore);
      }
    }

    const user = await User.create({
      fullName: fullName.trim(),
      email: normalizedEmail,
      phone: phone?.trim() || "",
      role,
      wantsUpdates: wantsUpdates !== false,
      referralCode,
      referredBy: referrer ? referredBy : null,
      points: 100,
      referralStatus,
      fraudScore,
      fraudReasons,
      ip,
      userAgent,
    });

    // Only credit the referrer immediately if this referral was auto-approved.
    // Flagged/pending referrals are credited later once an admin approves them.
    if (referrer && referralStatus === "approved") {
      referrer.referralCount += 1;
      referrer.points += REFERRAL_POINTS;
      await referrer.save();
    }

    res.status(201).json({
      message: "Welcome to OgboJobs!",
      user: {
        id: user._id,
        fullName: user.fullName,
        referralCode: user.referralCode,
        points: user.points,
        referralCount: user.referralCount,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;

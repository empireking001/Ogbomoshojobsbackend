import express from "express";
import rateLimit from "express-rate-limit";
import User from "../models/User.js";
import Task from "../models/Task.js";
import Settings from "../models/Settings.js";
import Newsletter from "../models/Newsletter.js";

const router = express.Router();

const writeLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 8 });

const lookupLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: { error: "Too many attempts, please try again shortly." },
});

// GET /api/waitlist/lookup?email=... — returning users retrieve their own stats.
// Deliberately returns only referral/points data, never phone or internal fraud fields.
router.get("/waitlist/lookup", lookupLimiter, async (req, res, next) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ error: "No waitlist signup found for that email" });
    }

    res.json({
      fullName: user.fullName,
      referralCode: user.referralCode,
      points: user.points,
      referralCount: user.referralCount,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/count — total members + today's signups, for the live counter
router.get("/count", async (_req, res, next) => {
  try {
    const total = await User.countDocuments({ role: { $ne: "Employer" } });
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const today = await User.countDocuments({ createdAt: { $gte: startOfDay } });
    const settings = await Settings.findOne({ key: "site" });

    res.json({ total, today, goal: settings?.waitlistGoal || 2000 });
  } catch (err) {
    next(err);
  }
});

// GET /api/recent — latest signups for the "just joined" ticker (privacy-safe)
router.get("/recent", async (_req, res, next) => {
  try {
    const recent = await User.find({ role: { $ne: "Employer" } })
      .sort({ createdAt: -1 })
      .limit(8)
      .select("fullName role createdAt");

    res.json(
      recent.map((u) => ({
        firstName: u.fullName.trim().split(/\s+/)[0],
        role: u.role,
        createdAt: u.createdAt,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/leaderboard — top 10 by points
router.get("/leaderboard", async (_req, res, next) => {
  try {
    const top = await User.find({ referralStatus: { $ne: "rejected" } })
      .sort({ points: -1 })
      .limit(10)
      .select("fullName points referralCount");

    res.json(
      top.map((u, i) => ({
        rank: i + 1,
        name: maskName(u.fullName),
        points: u.points,
        referralCount: u.referralCount,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/tasks — active tasks only
router.get("/tasks", async (_req, res, next) => {
  try {
    const tasks = await Task.find({ active: true }).sort({ order: 1 });
    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

// GET /api/settings — landing page content
router.get("/settings", async (_req, res, next) => {
  try {
    const settings = await Settings.findOne({ key: "site" });
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

// POST /api/newsletter — subscribe
router.post("/newsletter", writeLimiter, async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const normalized = String(email).toLowerCase().trim();
    await Newsletter.updateOne({ email: normalized }, { $setOnInsert: { email: normalized } }, { upsert: true });

    res.status(201).json({ message: "Subscribed!" });
  } catch (err) {
    next(err);
  }
});

// Show only first name + masked surname initial for public leaderboard privacy
function maskName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

export default router;

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
      completedTaskIds: user.completedTasks.map((ct) => String(ct.task)),
    });
  } catch (err) {
    next(err);
  }
});

const completeTaskLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: { error: "Too many attempts, please try again shortly." },
});

// POST /api/waitlist/complete-task { email, taskId } — mark a task done and award its points.
// Idempotent: completing the same task twice never double-awards points.
router.post("/waitlist/complete-task", completeTaskLimiter, async (req, res, next) => {
  try {
    const { email, taskId } = req.body;
    if (!email || !taskId) return res.status(400).json({ error: "Email and taskId are required" });

    const [user, task] = await Promise.all([
      User.findOne({ email: String(email).toLowerCase().trim() }),
      Task.findOne({ _id: taskId, active: true }),
    ]);

    if (!user) return res.status(404).json({ error: "No waitlist signup found for that email" });
    if (!task) return res.status(404).json({ error: "Task not found or no longer active" });

    const alreadyDone = user.completedTasks.some((ct) => String(ct.task) === String(taskId));
    if (!alreadyDone) {
      user.completedTasks.push({ task: task._id, completedAt: new Date() });
      user.points += task.points;
      await user.save();
    }

    res.json({
      points: user.points,
      referralCount: user.referralCount,
      completedTaskIds: user.completedTasks.map((ct) => String(ct.task)),
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

    res.json({
      total,
      today,
      goal: settings?.waitlistGoal || 2000,
      showPublicCount: settings?.showPublicCount !== false,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/recent — latest activity (signups + task completions) for the ticker.
// Everything here is real activity that actually happened — nothing fabricated.
router.get("/recent", async (_req, res, next) => {
  try {
    const recentSignups = await User.find({ role: { $ne: "Employer" } })
      .sort({ createdAt: -1 })
      .limit(6)
      .select("fullName role createdAt");

    const recentCompletions = await User.aggregate([
      { $unwind: "$completedTasks" },
      { $sort: { "completedTasks.completedAt": -1 } },
      { $limit: 6 },
      {
        $lookup: {
          from: "tasks",
          localField: "completedTasks.task",
          foreignField: "_id",
          as: "taskInfo",
        },
      },
      { $unwind: "$taskInfo" },
      {
        $project: {
          _id: 0,
          fullName: 1,
          taskTitle: "$taskInfo.title",
          completedAt: "$completedTasks.completedAt",
        },
      },
    ]);

    const signupEvents = recentSignups.map((u) => ({
      type: "signup",
      firstName: u.fullName.trim().split(/\s+/)[0],
      role: u.role,
      at: u.createdAt,
    }));

    const taskEvents = recentCompletions.map((c) => ({
      type: "task",
      firstName: c.fullName.trim().split(/\s+/)[0],
      taskTitle: c.taskTitle,
      at: c.completedAt,
    }));

    const merged = [...signupEvents, ...taskEvents]
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 8);

    res.json(merged);
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

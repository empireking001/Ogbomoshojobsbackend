import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { Parser as CsvParser } from "json2csv";

import Admin from "../models/Admin.js";
import User from "../models/User.js";
import Task from "../models/Task.js";
import Settings from "../models/Settings.js";
import Newsletter from "../models/Newsletter.js";
import Employer from "../models/Employer.js";
import { requireAdmin } from "../middleware/auth.js";
import { REFERRAL_POINTS } from "../utils/referral.js";

const router = express.Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

/* ---------------------------- AUTH ---------------------------- */

// POST /api/admin/login
router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const admin = await Admin.findOne({ email: String(email).toLowerCase().trim() });
    if (!admin) return res.status(401).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: admin._id, email: admin.email }, process.env.JWT_SECRET, {
      expiresIn: "12h",
    });

    res.json({ token, admin: { name: admin.name, email: admin.email } });
  } catch (err) {
    next(err);
  }
});

/* All routes below require a valid admin session */
router.use(requireAdmin);

/* --------------------------- DASHBOARD --------------------------- */

// GET /api/admin/dashboard
router.get("/dashboard", async (_req, res, next) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      totalMembers,
      todaySignups,
      employers,
      students,
      graduates,
      nyscMembers,
      newsletterSubs,
      referralAgg,
    ] = await Promise.all([
      User.countDocuments({ role: { $ne: "Employer" } }),
      User.countDocuments({ createdAt: { $gte: startOfDay } }),
      Employer.countDocuments(),
      User.countDocuments({ role: "Student" }),
      User.countDocuments({ role: "Graduate" }),
      User.countDocuments({ role: "NYSC Member" }),
      Newsletter.countDocuments(),
      User.aggregate([{ $group: { _id: null, total: { $sum: "$referralCount" } } }]),
    ]);

    res.json({
      totalMembers,
      todaySignups,
      employers,
      students,
      graduates,
      nyscMembers,
      totalReferrals: referralAgg[0]?.total || 0,
      newsletterSubscribers: newsletterSubs,
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------ USER MANAGEMENT ------------------------ */

// GET /api/admin/users?search=&role=&status=&page=&limit=
router.get("/users", async (req, res, next) => {
  try {
    const { search = "", role = "", status = "", page = 1, limit = 25 } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { referralCode: { $regex: search, $options: "i" } },
      ];
    }
    if (role) filter.role = role;
    if (status) filter.referralStatus = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [users, count] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      User.countDocuments(filter),
    ]);

    res.json({ users, total: count, page: Number(page), pages: Math.ceil(count / Number(limit)) });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/users/export — CSV export
router.get("/users/export", async (_req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).lean();
    const fields = [
      "fullName",
      "email",
      "phone",
      "role",
      "referralCode",
      "referredBy",
      "referralCount",
      "points",
      "referralStatus",
      "createdAt",
    ];
    const csv = new CsvParser({ fields }).parse(users);
    res.header("Content-Type", "text/csv");
    res.attachment("ogbojobs-users.csv");
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/user/:id — edit user
router.put("/user/:id", async (req, res, next) => {
  try {
    const allowed = ["fullName", "email", "phone", "role", "wantsUpdates", "adminNote"];
    const updates = {};
    for (const key of allowed) if (key in req.body) updates[key] = req.body[key];

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/user/:id
router.delete("/user/:id", async (req, res, next) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User deleted" });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/user/:id/points  { delta: number }  — award or remove points
router.put("/user/:id/points", async (req, res, next) => {
  try {
    const { delta } = req.body;
    if (typeof delta !== "number") return res.status(400).json({ error: "delta must be a number" });

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $inc: { points: delta } },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

/* ---------------------------- FRAUD REVIEW ---------------------------- */

// GET /api/admin/fraud — pending & flagged referrals
router.get("/fraud", async (_req, res, next) => {
  try {
    const flagged = await User.find({ referralStatus: { $in: ["pending", "flagged"] } }).sort({
      fraudScore: -1,
    });

    // Attach referrer info for display
    const results = await Promise.all(
      flagged.map(async (u) => {
        const referrer = u.referredBy ? await User.findOne({ referralCode: u.referredBy }) : null;
        return {
          id: u._id,
          user: { fullName: u.fullName, email: u.email, phone: u.phone },
          referrer: referrer ? { fullName: referrer.fullName, referralCode: referrer.referralCode } : null,
          fraudScore: u.fraudScore,
          reasons: u.fraudReasons,
          ip: u.ip,
          device: u.userAgent,
          status: u.referralStatus,
          adminNote: u.adminNote,
          createdAt: u.createdAt,
        };
      })
    );

    res.json(results);
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/fraud/:id  { action: "approve"|"reject"|"fraud", note? }
router.put("/fraud/:id", async (req, res, next) => {
  try {
    const { action, note } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (note !== undefined) user.adminNote = note;

    if (action === "approve") {
      const alreadyApproved = user.referralStatus === "approved";
      user.referralStatus = "approved";
      // Credit the referrer now, only if not already credited
      if (!alreadyApproved && user.referredBy) {
        const referrer = await User.findOne({ referralCode: user.referredBy });
        if (referrer) {
          referrer.referralCount += 1;
          referrer.points += REFERRAL_POINTS;
          await referrer.save();
        }
      }
    } else if (action === "reject") {
      user.referralStatus = "rejected";
    } else if (action === "fraud") {
      user.referralStatus = "rejected";
      user.adminNote = note || user.adminNote || "Marked as fraud";
    } else {
      return res.status(400).json({ error: "action must be approve, reject, or fraud" });
    }

    await user.save();
    res.json(user);
  } catch (err) {
    next(err);
  }
});

/* --------------------------- TASK MANAGEMENT --------------------------- */

router.get("/tasks", async (_req, res, next) => {
  try {
    res.json(await Task.find().sort({ order: 1 }));
  } catch (err) {
    next(err);
  }
});

router.post("/tasks", async (req, res, next) => {
  try {
    const task = await Task.create(req.body);
    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
});

router.put("/tasks/:id", async (req, res, next) => {
  try {
    const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json(task);
  } catch (err) {
    next(err);
  }
});

router.delete("/tasks/:id", async (req, res, next) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json({ message: "Task deleted" });
  } catch (err) {
    next(err);
  }
});

/* --------------------------- LANDING PAGE SETTINGS --------------------------- */

router.get("/settings", async (_req, res, next) => {
  try {
    let settings = await Settings.findOne({ key: "site" });
    if (!settings) settings = await Settings.create({ key: "site" });
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

router.put("/settings", async (req, res, next) => {
  try {
    const settings = await Settings.findOneAndUpdate({ key: "site" }, req.body, {
      new: true,
      upsert: true,
    });
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

/* --------------------------- NEWSLETTER EXPORT --------------------------- */

router.get("/newsletter/export", async (_req, res, next) => {
  try {
    const subs = await Newsletter.find().sort({ createdAt: -1 }).lean();
    const csv = new CsvParser({ fields: ["email", "createdAt"] }).parse(subs);
    res.header("Content-Type", "text/csv");
    res.attachment("ogbojobs-newsletter.csv");
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

/* --------------------------- EMPLOYERS --------------------------- */

router.get("/employers", async (_req, res, next) => {
  try {
    res.json(await Employer.find().sort({ createdAt: -1 }));
  } catch (err) {
    next(err);
  }
});

export default router;

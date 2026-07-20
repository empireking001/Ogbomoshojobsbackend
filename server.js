import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";

import waitlistRoutes from "./routes/waitlist.js";
import employerRoutes from "./routes/employer.js";
import publicRoutes from "./routes/public.js";
import adminRoutes from "./routes/admin.js";

dotenv.config();

const app = express();

// Trust Render's proxy so req.ip reflects the real client IP (used for fraud checks)
app.set("trust proxy", 1);

app.use(express.json());
app.use(
  cors({
    origin: process.env.CLIENT_URL?.split(",") || "*",
    credentials: true,
  })
);

// Basic global rate limit; individual write routes apply stricter limits too
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "OgboJobs API" });
});

app.use("/api/waitlist", waitlistRoutes);
app.use("/api/employer", employerRoutes);
app.use("/api", publicRoutes); // /api/count, /api/leaderboard, /api/tasks, /api/r/:code
app.use("/api/admin", adminRoutes);

// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Central error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`OgboJobs API running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });

// One-off script to create the first admin account and default tasks.
// Run with: npm run seed
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import Admin from "../models/Admin.js";
import Task from "../models/Task.js";
import Settings from "../models/Settings.js";

dotenv.config();

const DEFAULT_TASKS = [
  { title: "Follow Facebook", points: 20, order: 1 },
  { title: "Follow X", points: 20, order: 2 },
  { title: "Follow Instagram", points: 20, order: 3 },
  { title: "Join WhatsApp Channel", points: 30, order: 4 },
  { title: "Invite a Friend", points: 100, order: 5 },
  { title: "Complete Profile", points: 20, order: 6 },
];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);

  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;

  if (!email || !password) {
    console.error("Set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD in .env before seeding");
    process.exit(1);
  }

  const existing = await Admin.findOne({ email });
  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 10);
    await Admin.create({ email, passwordHash, name: "OgboJobs Admin" });
    console.log(`Admin created: ${email}`);
  } else {
    console.log("Admin already exists, skipping");
  }

  for (const t of DEFAULT_TASKS) {
    await Task.updateOne({ title: t.title }, { $setOnInsert: t }, { upsert: true });
  }
  console.log("Default tasks ensured");

  await Settings.updateOne({ key: "site" }, { $setOnInsert: { key: "site" } }, { upsert: true });
  console.log("Settings document ensured");

  await mongoose.disconnect();
  console.log("Seed complete");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "site", unique: true },
    headline: { type: String, default: "The Job Platform Built for Ogbomoso." },
    subtitle: {
      type: String,
      default:
        "Stop relying on WhatsApp statuses and word of mouth to find jobs. OgboJobs helps students, graduates, NYSC members, professionals, artisans, and employers connect through one trusted platform.",
    },
    countdownDate: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    heroPrimaryCta: { type: String, default: "Become a Founding Member" },
    heroSecondaryCta: { type: String, default: "Join as Employer" },
    waitlistGoal: { type: Number, default: 2000 },
    faq: [
      {
        question: String,
        answer: String,
      },
    ],
    socialLinks: {
      facebook: { type: String, default: "" },
      x: { type: String, default: "" },
      instagram: { type: String, default: "" },
      whatsapp: { type: String, default: "" },
    },
    footerText: { type: String, default: "OgboJobs — connecting Ogbomoso to opportunity." },
  },
  { timestamps: true }
);

export default mongoose.model("Settings", settingsSchema);

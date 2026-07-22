import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    points: { type: Number, required: true, default: 10 },
    link: { type: String, default: "" },
    // When true, the frontend ignores `link` and instead uses each user's own referral
    // link — this is meant for exactly one task ("Invite a Friend"). Points for it are
    // awarded automatically by the referral system, never via manual claim.
    isReferralTask: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("Task", taskSchema);

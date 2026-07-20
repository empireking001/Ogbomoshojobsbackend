import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    role: {
      type: String,
      enum: ["Student", "Graduate", "NYSC Member", "Job Seeker", "Employer", "Recruiter"],
      required: true,
    },
    wantsUpdates: { type: Boolean, default: true },

    referralCode: { type: String, required: true, unique: true, index: true },
    referredBy: { type: String, default: null },
    referralCount: { type: Number, default: 0 },
    points: { type: Number, default: 100 },

    completedTasks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }],
    profileCompleted: { type: Boolean, default: false },

    referralStatus: {
      type: String,
      enum: ["approved", "pending", "flagged", "rejected"],
      default: "approved",
    },
    fraudScore: { type: Number, default: 0 },
    fraudReasons: [{ type: String }],
    ip: { type: String },
    userAgent: { type: String },
    adminNote: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);

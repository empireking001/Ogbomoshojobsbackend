import mongoose from "mongoose";

const employerSchema = new mongoose.Schema(
  {
    businessName: { type: String, required: true },
    industry: { type: String, required: true },
    contactPerson: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    phone: { type: String, required: true },
    hiringNeeds: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("Employer", employerSchema);

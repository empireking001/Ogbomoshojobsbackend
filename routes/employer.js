import express from "express";
import rateLimit from "express-rate-limit";
import Employer from "../models/Employer.js";

const router = express.Router();

const writeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  message: { error: "Too many attempts, please try again shortly." },
});

// POST /api/employer
router.post("/", writeLimiter, async (req, res, next) => {
  try {
    const { businessName, industry, contactPerson, email, phone, hiringNeeds } = req.body;

    if (!businessName || !industry || !contactPerson || !email || !phone) {
      return res.status(400).json({ error: "All fields except hiring needs are required" });
    }

    const employer = await Employer.create({
      businessName: businessName.trim(),
      industry: industry.trim(),
      contactPerson: contactPerson.trim(),
      email: String(email).toLowerCase().trim(),
      phone: phone.trim(),
      hiringNeeds: hiringNeeds?.trim() || "",
    });

    res.status(201).json({
      message: "Thanks! Our team will reach out before launch.",
      employer: { id: employer._id, businessName: employer.businessName },
    });
  } catch (err) {
    next(err);
  }
});

export default router;

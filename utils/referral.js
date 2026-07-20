import { customAlphabet } from "nanoid";
import User from "../models/User.js";

// Uppercase letters + digits, no ambiguous characters (0/O, 1/I) for easy sharing
const nanoid = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

/** Generate a referral code guaranteed to be unique in the users collection. */
export async function generateUniqueReferralCode() {
  let code;
  let exists = true;
  while (exists) {
    code = nanoid();
    exists = await User.exists({ referralCode: code });
  }
  return code;
}

export const REFERRAL_POINTS = 100;
export const MILESTONES = [5, 10, 25];

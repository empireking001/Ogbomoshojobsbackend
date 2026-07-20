import User from "../models/User.js";

// A small list of common disposable-email domains. Extend as needed.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "tempmail.com",
  "10minutemail.com",
  "guerrillamail.com",
  "yopmail.com",
  "trashmail.com",
  "throwawaymail.com",
]);

/**
 * Evaluate a new signup for referral fraud signals.
 * Returns { score, reasons } where higher score = more suspicious.
 * This NEVER blocks a signup — it only informs whether the referral
 * should be auto-approved or held for admin review.
 */
export async function evaluateFraud({ email, phone, ip, userAgent, referrerCode }) {
  const reasons = [];
  let score = 0;

  const domain = email.split("@")[1]?.toLowerCase();
  if (domain && DISPOSABLE_DOMAINS.has(domain)) {
    reasons.push("Disposable email domain");
    score += 40;
  }

  // Same IP used recently (last 24h) by other accounts
  if (ip) {
    const sinceIp = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sameIpCount = await User.countDocuments({ ip, createdAt: { $gte: sinceIp } });
    if (sameIpCount >= 3) {
      reasons.push(`${sameIpCount} signups from the same IP in 24h`);
      score += 30;
    } else if (sameIpCount >= 1) {
      reasons.push("Shares IP with an existing account");
      score += 10;
    }
  }

  // Same device/browser fingerprint (approximated via user agent) reused often
  if (userAgent) {
    const sinceUa = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sameUaCount = await User.countDocuments({ userAgent, createdAt: { $gte: sinceUa } });
    if (sameUaCount >= 5) {
      reasons.push("Same device used for many recent signups");
      score += 20;
    }
  }

  // Same phone already registered
  if (phone) {
    const dup = await User.findOne({ phone });
    if (dup) {
      reasons.push("Phone number already registered to another account");
      score += 25;
    }
  }

  // Self-referral: referrer's own email/phone matches the new signup (defense in depth;
  // primary check happens where the referrer document is loaded, since it has email access)
  if (referrerCode) {
    const referrer = await User.findOne({ referralCode: referrerCode });
    if (referrer) {
      if (referrer.email === email) {
        reasons.push("Self-referral attempt (same email as referrer)");
        score += 60;
      }
      if (phone && referrer.phone && referrer.phone === phone) {
        reasons.push("Self-referral attempt (same phone as referrer)");
        score += 60;
      }
      // Referrer accumulating unusually high referral volume very quickly
      if (referrer.referralCount >= 20) {
        reasons.push("Referrer has unusually high referral activity");
        score += 15;
      }
    }
  }

  // Rapid-fire signups in general (platform-wide burst) sharing IP+UA combo
  if (ip && userAgent) {
    const sinceBurst = new Date(Date.now() - 10 * 60 * 1000);
    const burstCount = await User.countDocuments({
      ip,
      userAgent,
      createdAt: { $gte: sinceBurst },
    });
    if (burstCount >= 2) {
      reasons.push("Multiple signups within a short period from this device/IP");
      score += 20;
    }
  }

  return { score, reasons };
}

/**
 * Given a fraud score, decide the referral's initial status.
 * Normal (low-risk) referrals are auto-approved so users are never made
 * aware they were checked. Only sufficiently suspicious signups are held.
 */
export function statusForScore(score) {
  if (score >= 50) return "flagged";
  if (score >= 25) return "pending";
  return "approved";
}

// Known university email domains
const UNIVERSITY_DOMAINS = [
  // Generic academic domains
  ".edu",
  ".ac.uk",
  ".ac.ng",
  ".edu.ng",
  ".ac.za",
  ".edu.gh",
  ".ac.ke",
  ".edu.au",
  ".ac.nz",
  ".edu.sg",
  ".ac.in",
  ".edu.pk",
  ".ac.tz",
  ".edu.et",
  ".ac.ug",
  ".edu.rw",
  ".ac.zw",
  ".edu.eg",
  ".ac.ma",
  // Add more as needed
];

/**
 * Returns true if the email looks like a university/academic email.
 * Falls back to allowing all emails if the domain isn't recognized,
 * so students with non-standard domains can still sign up (manual review).
 */
export function isUniversityEmail(email) {
  if (!email || !email.includes("@")) return false;
  const domain = email.split("@")[1].toLowerCase();
  return UNIVERSITY_DOMAINS.some((suffix) => domain.endsWith(suffix));
}

/**
 * Returns a warning message if the email is not a university domain,
 * or null if it looks fine.
 */
export function getEmailDomainWarning(email) {
  if (!email || !email.includes("@")) return null;
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  if (UNIVERSITY_DOMAINS.some((suffix) => domain.endsWith(suffix))) return null;
  return `"${domain}" doesn't look like a university email. You can still sign up, but your account may require manual verification.`;
}

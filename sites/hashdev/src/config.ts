export const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL
  ? process.env.NEXT_PUBLIC_FRONTEND_URL
  : process.env.NEXT_PUBLIC_VERCEL_URL
  ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
  : "http://localhost:3000";

export const SITE_DESCRIPTION =
  "Open-source resources and tools for" +
  " developers who want to build the future of decision-making with HASH";

export const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL
  ? process.env.NEXT_PUBLIC_FRONTEND_URL
  : process.env.NEXT_PUBLIC_VERCEL_URL
  ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
  : "http://localhost:3000";

export const FRONTEND_DOMAIN = new URL(FRONTEND_URL).hostname;

export const isUsingHttps = new URL(FRONTEND_URL).protocol === "https";

export const isProduction = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";

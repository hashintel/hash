import { frontendUrl } from "./environment.js";

// Whether this is a self-hosted instance, rather than the central HASH hosted instance
export const isSelfHostedInstance =
  process.env.SELF_HOSTED_HASH === "true" ||
  process.env.NEXT_PUBLIC_SELF_HOSTED_HASH === "true" ||
  ![
    "http://localhost:3000",
    "https://app.hash.ai",
    "https://hash.ai",
    "https://stage.hash.ai",
  ].includes(frontendUrl);

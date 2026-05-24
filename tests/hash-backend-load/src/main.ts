import { config } from "dotenv-flow";

import { monorepoRootDir } from "@local/hash-backend-utils/environment";

config({ silent: true, path: monorepoRootDir });

export { completeRegistration, signupUser } from "./authentication/registration";
export { refreshSessionToken } from "./authentication/session";
export { enterRequestSpan, exitRequestSpan } from "./tracing/request";
export { initializeTracing, tearDownTracing } from "./tracing/sdk";

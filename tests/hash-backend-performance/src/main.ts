import { monorepoRootDir } from "@local/hash-backend-utils/environment";
import { config } from "dotenv-flow";

config({ silent: true, path: monorepoRootDir });

export {
  completeRegistration,
  signupUser,
} from "./authentication/registration";
export { refreshSessionToken } from "./authentication/session";

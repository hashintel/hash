import { Strategy as PassportStrategy } from "passport-strategy";
import { rword } from "rword";

export const LOGIN_CODE_MAX_AGE = 1000 * 60 * 60;
export const LOGIN_CODE_MAX_ATTEMPTS = 5;

export class GraphQLPasswordlessStrategy extends PassportStrategy {
  /** generates a cryptographically secure memorable login code */
  static generateLoginCode = () => (rword.generate(4) as string[]).join("-");
}

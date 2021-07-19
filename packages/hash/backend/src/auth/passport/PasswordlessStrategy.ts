import { Strategy as PassportStrategy } from "passport-strategy";
import { rword } from "rword";

export class GraphQLPasswordlessStrategy extends PassportStrategy {
  /** generates a cryptographically secure memorable login code */
  static generateLoginCode = () => (rword.generate(4) as string[]).join("-");
}

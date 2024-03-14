import type {
  ImpureGraphFunction,
  PureGraphFunction,
} from "../../context-types";
import { getOrgByShortname } from "./org";
import { getUserByShortname } from "./user";

/** @todo: enable admins to expand upon restricted shortnames block list */
export const RESTRICTED_SHORTNAMES = [
  "-",
  ".well-known",
  "404.html",
  "422.html",
  "500.html",
  "502.html",
  "503.html",
  "abuse_reports",
  "admin",
  "ag",
  "api",
  "apple-touch-icon-precomposed.png",
  "apple-touch-icon.png",
  "assets",
  "autocomplete",
  "bh",
  "bhg",
  "dashboard",
  "deploy.html",
  "dw",
  "example",
  "explore",
  "favicon.ico",
  "favicon.png",
  "files",
  "groups",
  "health_check",
  "help",
  "import",
  "invites",
  "jwt",
  "local",
  "login",
  "new",
  "oauth",
  "org",
  "profile",
  "projects",
  "public",
  "robots.txt",
  "s",
  "search",
  "sent_notifications",
  "slash-command-logo.png",
  "snippets",
  "unsubscribes",
  "uploads",
  "user",
  "users",
  "v2",
];

// Validations for shortnames
/**
 * @todo revisit (simple) shortname validation to make use of data type
 *   constraints.
 *   https://app.asana.com/0/0/1202900021005257/f
 */
export const shortnameMinimumLength = 4;
export const shortnameMaximumLength = 24;

const ALLOWED_SHORTNAME_CHARS = /^[a-zA-Z0-9-_]+$/;

export const shortnameContainsInvalidCharacter: PureGraphFunction<
  { shortname: string },
  boolean
> = ({ shortname }) => {
  return !!shortname.search(ALLOWED_SHORTNAME_CHARS);
};

export const shortnameIsRestricted: PureGraphFunction<
  { shortname: string },
  boolean
> = ({ shortname }): boolean => {
  return RESTRICTED_SHORTNAMES.includes(shortname);
};

// TODO: Depending on the approached chosen outlined in `get*ByShortname` functions, this function may be changed
//       to use another function to determine existence of a shortname.
//   see https://linear.app/hash/issue/H-757
export const shortnameIsTaken: ImpureGraphFunction<
  { shortname: string },
  Promise<boolean>
> = async (ctx, authentication, params) => {
  /**
   * @todo this creates a circular dependencies between `org.ts` and `user.ts`
   * and this file.
   *
   * @see https://app.asana.com/0/1203363157432084/1203568198115111/f
   */
  return (
    (await getUserByShortname(ctx, authentication, params)) !== null ||
    (await getOrgByShortname(ctx, authentication, params)) !== null
  );
};

export const shortnameIsInvalid: PureGraphFunction<
  { shortname: string },
  boolean
> = (params): boolean => {
  return (
    params.shortname.length < shortnameMinimumLength ||
    params.shortname.length > shortnameMaximumLength ||
    params.shortname[0] === "-" ||
    shortnameContainsInvalidCharacter(params) ||
    shortnameIsRestricted(params)
  );
};

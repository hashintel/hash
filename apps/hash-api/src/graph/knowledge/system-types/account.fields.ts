import type {
  ImpureGraphFunction,
  PureGraphFunction,
} from "../../context-types";
import { getOrgByShortname } from "./org";
import { getUser } from "./user";

/** @todo: enable admins to expand upon restricted shortnames block list */
export const RESTRICTED_SHORTNAMES = [
  "-",
  "@",
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
  "apple-icon.png",
  "apple-touch-icon-precomposed.png",
  "apple-touch-icon.png",
  "assets",
  "autocomplete",
  "bh",
  "bhg",
  "dashboard",
  "deploy.html",
  "dw",
  "entities",
  "explore",
  "favicon.ico",
  "favicon.png",
  "favicon.svg",
  "files",
  "flows",
  "groups",
  "health_check",
  "help",
  "icon0.png",
  "icon0.svg",
  "icon1.png",
  "icon1.svg",
  "import",
  "inbox",
  "invites",
  "jwt",
  "local",
  "login",
  "log-in",
  "logout",
  "log-out",
  "manifest.json",
  "messages",
  "new",
  "notes",
  "notices",
  "notifications",
  "oauth",
  "org",
  "profile",
  "projects",
  "public",
  "register",
  "robots.txt",
  "s",
  "search",
  "sent_notifications",
  "sign-in",
  "sign-up",
  "signin",
  "signup",
  "site.webmanifest",
  "slash-command-logo.png",
  "snippets",
  "social-cover.png",
  "types",
  "unsubscribes",
  "uploads",
  "user",
  "users",
  "v2",
  "workers",
];

// Validations for shortnames
/**
 * @todo revisit (simple) shortname validation to make use of data type
 *   constraints.
 *   https://linear.app/hash/issue/H-2987
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
   * @see https://linear.app/hash/issue/H-2989
   */
  return (
    (await getUser(ctx, authentication, params)) !== null ||
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

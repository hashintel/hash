import { ImpureGraphFunction, PureGraphFunction } from "../..";
import { RESTRICTED_SHORTNAMES } from "../../util";
import { getOrgByShortname } from "./org";
import { getUserByShortname } from "./user";

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

export const shortnameIsTaken: ImpureGraphFunction<
  { shortname: string },
  Promise<boolean>
> = async (ctx, params) => {
  /**
   * @todo this creates a circular dependencies between `org.ts` and `user.ts`
   * and this file.
   *
   * @see https://app.asana.com/0/1203363157432084/1203568198115111/f
   */
  return (
    (await getUserByShortname(ctx, params)) !== null ||
    (await getOrgByShortname(ctx, params)) !== null
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

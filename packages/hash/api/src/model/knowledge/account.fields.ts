import { OrgModel, UserModel } from "..";
import { GraphApi } from "../../graph";
import { RESTRICTED_SHORTNAMES } from "../util";

// Validations for shortnames
/**
 * @todo revisit (simple) shortname validation to make use of data type
 *   constraints.
 *   https://app.asana.com/0/0/1202900021005257/f
 */
export const shortnameMinimumLength = 4;
export const shortnameMaximumLength = 24;

const ALLOWED_SHORTNAME_CHARS = /^[a-zA-Z0-9-_]+$/;

export const shortnameContainsInvalidCharacter = (
  shortname: string,
): boolean => {
  return !!shortname.search(ALLOWED_SHORTNAME_CHARS);
};

export const shortnameIsRestricted = (shortname: string): boolean => {
  return RESTRICTED_SHORTNAMES.includes(shortname);
};

export const shortnameIsTaken = async (
  graphApi: GraphApi,
  params: { shortname: string },
) => {
  /**
   * @todo currently these method calls create circular dependencies on the User
   *   and Org model classes. We should revisit model class interaction to see
   *   if we can get around this.
   *   https://app.asana.com/0/1202805690238892/1202890446280565/f
   */
  return (
    (await UserModel.getUserByShortname(graphApi, params)) !== null ||
    (await OrgModel.getOrgByShortname(graphApi, params)) !== null
  );
};

export const shortnameIsInvalid = (shortname: string): boolean => {
  return (
    shortname.length < shortnameMinimumLength ||
    shortname.length > shortnameMaximumLength ||
    shortname[0] === "-" ||
    shortnameContainsInvalidCharacter(shortname) ||
    shortnameIsRestricted(shortname)
  );
};

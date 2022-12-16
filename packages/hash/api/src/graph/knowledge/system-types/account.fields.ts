import { OrgModel } from "../../../model";
import { ImpureGraphFunction, PureGraphFunction } from "../..";
import { RESTRICTED_SHORTNAMES } from "../../../model/util";
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
   * @todo currently these method calls create circular dependencies on the User
   *   and Org model classes. We should revisit model class interaction to see
   *   if we can get around this.
   *   https://app.asana.com/0/1202805690238892/1202890446280565/f
   */
  return (
    (await getUserByShortname(ctx, params)) !== null ||
    (await OrgModel.getOrgByShortname(ctx, params)) !== null
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

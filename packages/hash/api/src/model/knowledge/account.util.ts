import { UserModel } from "..";
import { GraphApi } from "../../graph";
import {
  generateSchemaBaseUri,
  generateWorkspacePropertyTypeSchema,
  RESTRICTED_SHORTNAMES,
  workspaceTypesNamespaceUri,
} from "../util";

module AccountId {
  // Generate the schema for the account id property type
  export const accountIdPropertyType = generateWorkspacePropertyTypeSchema({
    title: "Account ID",
    possibleValues: [{ primitiveDataType: "Text" }],
  });

  export const accountIdBaseUri = generateSchemaBaseUri({
    namespaceUri: workspaceTypesNamespaceUri,
    kind: "propertyType",
    title: accountIdPropertyType.title,
  });
}

module Shortname {
  // Generate the schema for the shortname property type
  export const shortnamePropertyType = generateWorkspacePropertyTypeSchema({
    title: "Shortname",
    possibleValues: [{ primitiveDataType: "Text" }],
  });

  export const shortnameMinimumLength = 4;
  export const shortnameMaximumLength = 24;

  export const shortnameBaseUri = generateSchemaBaseUri({
    namespaceUri: workspaceTypesNamespaceUri,
    kind: "propertyType",
    title: shortnamePropertyType.title,
  });

  // Validations for shortnames
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
    /** @todo validate org model shortname */
    return (await UserModel.getUserByShortname(graphApi, params)) !== null;
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
}

export const AccountUtil = {
  ...AccountId,
  ...Shortname,
};

import {
  generateSchemaBaseUri,
  generateWorkspacePropertyTypeSchema,
  workspaceTypesNamespaceUri,
} from "../util";

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

export const AccountUtil = {
  accountIdPropertyType,
  accountIdBaseUri,

  shortnamePropertyType,
  shortnameMinimumLength,
  shortnameMaximumLength,
  shortnameBaseUri,
};

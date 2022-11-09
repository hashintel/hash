import { GraphApi } from "@hashintel/hash-graph-client";
import { ApolloError, UserInputError } from "apollo-server-express";
import { types } from "@hashintel/hash-shared/types";
import { VersionedUri } from "@blockprotocol/type-system-web";
import { SYSTEM_TYPES } from "../../../../graph/system-types";
import { AccountFields, EntityModel, UserModel } from "../../../../model";

const validateAccountShortname = async (
  graphApi: GraphApi,
  shortname: string,
) => {
  if (AccountFields.shortnameContainsInvalidCharacter(shortname)) {
    throw new UserInputError(
      "Shortname may only contain letters, numbers, - or _",
    );
  }
  if (shortname[0] === "-") {
    throw new UserInputError("Shortname cannot start with '-'");
  }

  if (
    AccountFields.shortnameIsRestricted(shortname) ||
    (await AccountFields.shortnameIsTaken(graphApi, { shortname }))
  ) {
    throw new ApolloError(`Shortname "${shortname}" taken`, "NAME_TAKEN");
  }

  /**
   * @todo: enable admins to have a shortname under 4 characters
   * @see https://app.asana.com/0/1201095311341924/1203285346775714/f
   */
  if (shortname.length < AccountFields.shortnameMinimumLength) {
    throw new UserInputError("Shortname must be at least 4 characters long.");
  }
  if (shortname.length > AccountFields.shortnameMaximumLength) {
    throw new UserInputError("Shortname cannot be longer than 24 characters");
  }
};

type BeforeUpdateEntityHookCallback = (params: {
  graphApi: GraphApi;
  entityModel: EntityModel;
  /**
   * @todo: use improved typing of the properties object
   * @see https://app.asana.com/0/1202805690238892/1203285029221334/f
   */
  updatedProperties: any;
}) => Promise<void>;

const userEntityHookCallback: BeforeUpdateEntityHookCallback = async ({
  entityModel,
  updatedProperties,
  graphApi,
}) => {
  const userModel = UserModel.fromEntityModel(entityModel);

  const currentShortname = userModel.getShortname();

  const updatedShortname: string | undefined =
    updatedProperties[SYSTEM_TYPES.propertyType.shortName.baseUri];

  if (currentShortname !== updatedShortname) {
    if (!updatedShortname) {
      throw new ApolloError("Cannot unset shortname");
    }

    await validateAccountShortname(graphApi, updatedShortname);
  }

  const currentPreferredName = userModel.getPreferredName();

  const updatedPreferredName: string | undefined =
    updatedProperties[SYSTEM_TYPES.propertyType.preferredName.baseUri];

  if (currentPreferredName !== updatedPreferredName) {
    if (!updatedPreferredName) {
      throw new ApolloError("Cannot unset preferred name");
    }
  }
};

type BeforeUpdateEntityHook = {
  entityTypeId: VersionedUri;
  callback: BeforeUpdateEntityHookCallback;
};

export const beforeUpdateEntityHooks: BeforeUpdateEntityHook[] = [
  {
    entityTypeId: types.entityType.user.entityTypeId,
    callback: userEntityHookCallback,
  },
];

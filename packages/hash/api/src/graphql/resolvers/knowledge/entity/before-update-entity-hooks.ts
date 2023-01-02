import { VersionedUri } from "@blockprotocol/type-system";
import { GraphApi } from "@hashintel/hash-graph-client";
import { types } from "@hashintel/hash-shared/ontology-types";
import { Entity, PropertyObject } from "@hashintel/hash-subgraph";
import { ApolloError, UserInputError } from "apollo-server-express";

import {
  shortnameContainsInvalidCharacter,
  shortnameIsRestricted,
  shortnameIsTaken,
  shortnameMaximumLength,
  shortnameMinimumLength,
} from "../../../../graph/knowledge/system-types/account.fields";
import {
  getUserFromEntity,
  updateUserKratosIdentityTraits,
} from "../../../../graph/knowledge/system-types/user";
import { SYSTEM_TYPES } from "../../../../graph/system-types";

const validateAccountShortname = async (
  graphApi: GraphApi,
  shortname: string,
) => {
  if (shortnameContainsInvalidCharacter({ shortname })) {
    throw new UserInputError(
      "Shortname may only contain letters, numbers, - or _",
    );
  }
  if (shortname[0] === "-") {
    throw new UserInputError("Shortname cannot start with '-'");
  }

  if (
    shortnameIsRestricted({ shortname }) ||
    (await shortnameIsTaken({ graphApi }, { shortname }))
  ) {
    throw new ApolloError(`Shortname "${shortname}" taken`, "NAME_TAKEN");
  }

  /**
   * @todo: enable admins to have a shortname under 4 characters
   * @see https://app.asana.com/0/1201095311341924/1203285346775714/f
   */
  if (shortname.length < shortnameMinimumLength) {
    throw new UserInputError("Shortname must be at least 4 characters long.");
  }
  if (shortname.length > shortnameMaximumLength) {
    throw new UserInputError("Shortname cannot be longer than 24 characters");
  }
};

type BeforeUpdateEntityHookCallback = (params: {
  graphApi: GraphApi;
  entity: Entity;
  updatedProperties: PropertyObject;
}) => Promise<void>;

const userEntityHookCallback: BeforeUpdateEntityHookCallback = async ({
  entity,
  updatedProperties,
  graphApi,
}) => {
  const user = getUserFromEntity({ entity });

  const currentShortname = user.shortname;

  const updatedShortname = updatedProperties[
    SYSTEM_TYPES.propertyType.shortName.metadata.editionId.baseId
  ] as string | undefined;

  if (currentShortname !== updatedShortname) {
    if (!updatedShortname) {
      throw new ApolloError("Cannot unset shortname");
    }

    await validateAccountShortname(graphApi, updatedShortname);
  }

  const currentPreferredName = user.preferredName;

  const updatedPreferredName = updatedProperties[
    SYSTEM_TYPES.propertyType.preferredName.metadata.editionId.baseId
  ] as string | undefined;

  if (currentPreferredName !== updatedPreferredName) {
    if (!updatedPreferredName) {
      throw new ApolloError("Cannot unset preferred name");
    }
  }

  const currentEmails = user.emails;

  const updatedEmails = updatedProperties[
    SYSTEM_TYPES.propertyType.email.metadata.editionId.baseId
  ] as string[];

  if (
    [...currentEmails].sort().join().toLowerCase() !==
    [...updatedEmails].sort().join().toLowerCase()
  ) {
    await updateUserKratosIdentityTraits(
      { graphApi },
      {
        user,
        updatedTraits: {
          emails: updatedEmails,
        },
      },
    );
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

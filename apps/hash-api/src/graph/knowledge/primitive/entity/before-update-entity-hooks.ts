import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { AccountId } from "@local/hash-subgraph";
import { ApolloError, UserInputError } from "apollo-server-express";

import { ImpureGraphContext } from "../../..";
import { SYSTEM_TYPES } from "../../../system-types";
import {
  shortnameContainsInvalidCharacter,
  shortnameIsRestricted,
  shortnameIsTaken,
  shortnameMaximumLength,
  shortnameMinimumLength,
} from "../../system-types/account.fields";
import {
  getUserFromEntity,
  updateUserKratosIdentityTraits,
} from "../../system-types/user";
import {
  UpdateEntityHook,
  UpdateEntityHookCallback,
} from "./update-entity-hooks";

const validateAccountShortname = async (
  context: ImpureGraphContext,
  authentication: { actorId: AccountId },
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
    (await shortnameIsTaken(context, authentication, { shortname }))
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

const userEntityHookCallback: UpdateEntityHookCallback = async ({
  entity,
  updatedProperties,
  context,
}) => {
  const user = getUserFromEntity({ entity });

  const currentShortname = user.shortname;

  const updatedShortname = updatedProperties[
    SYSTEM_TYPES.propertyType.shortname.metadata.recordId.baseUrl
  ] as string | undefined;

  if (currentShortname !== updatedShortname) {
    if (!updatedShortname) {
      throw new ApolloError("Cannot unset shortname");
    }

    await validateAccountShortname(
      context,
      { actorId: user.accountId },
      updatedShortname,
    );
  }

  const currentPreferredName = user.preferredName;

  const updatedPreferredName = updatedProperties[
    SYSTEM_TYPES.propertyType.preferredName.metadata.recordId.baseUrl
  ] as string | undefined;

  if (currentPreferredName !== updatedPreferredName) {
    if (!updatedPreferredName) {
      throw new ApolloError("Cannot unset preferred name");
    }
  }

  const currentEmails = user.emails;

  const updatedEmails = updatedProperties[
    SYSTEM_TYPES.propertyType.email.metadata.recordId.baseUrl
  ] as string[];

  if (
    [...currentEmails].sort().join().toLowerCase() !==
    [...updatedEmails].sort().join().toLowerCase()
  ) {
    await updateUserKratosIdentityTraits(
      context,
      { actorId: user.accountId },
      {
        user,
        updatedTraits: {
          emails: updatedEmails,
        },
      },
    );
  }
};

export const beforeUpdateEntityHooks: UpdateEntityHook[] = [
  {
    entityTypeId: types.entityType.user.entityTypeId,
    callback: userEntityHookCallback,
  },
];

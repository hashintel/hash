import {
  getDefinedPropertyFromPatchesGetter,
  isValueRemovedByPatches,
} from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";
import type { OwnedById } from "@local/hash-graph-types/web";
import type { UserProperties } from "@local/hash-isomorphic-utils/system-types/user";
import { ApolloError, UserInputError } from "apollo-server-express";

import { userHasAccessToHash } from "../../../../../shared/user-has-access-to-hash";
import type { ImpureGraphContext } from "../../../../context-types";
import { modifyWebAuthorizationRelationships } from "../../../../ontology/primitive/util";
import { systemAccountId } from "../../../../system-account";
import {
  shortnameContainsInvalidCharacter,
  shortnameIsRestricted,
  shortnameIsTaken,
  shortnameMaximumLength,
  shortnameMinimumLength,
} from "../../../system-types/account.fields";
import { getUserFromEntity } from "../../../system-types/user";
import type { BeforeUpdateEntityHookCallback } from "../update-entity-hooks";

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

  if (shortname.length < shortnameMinimumLength) {
    throw new UserInputError("Shortname must be at least 4 characters long.");
  }
  if (shortname.length > shortnameMaximumLength) {
    throw new UserInputError("Shortname cannot be longer than 24 characters");
  }
};

export const userBeforeEntityUpdateHookCallback: BeforeUpdateEntityHookCallback =
  async ({ previousEntity, propertyPatches, context }) => {
    const user = getUserFromEntity({ entity: previousEntity });

    const isShortnameRemoved = isValueRemovedByPatches<UserProperties>({
      baseUrl: "https://hash.ai/@hash/types/property-type/shortname/",
      propertyPatches,
    });
    if (isShortnameRemoved) {
      throw new UserInputError("Cannot unset shortname");
    }

    const isEmailRemoved = isValueRemovedByPatches<UserProperties>({
      baseUrl: "https://hash.ai/@hash/types/property-type/email/",
      propertyPatches,
    });
    if (isEmailRemoved) {
      throw new UserInputError("Cannot unset email");
    }

    const getNewValueForPath =
      getDefinedPropertyFromPatchesGetter<UserProperties>(propertyPatches);

    const currentEmails = user.emails;

    const updatedEmails = getNewValueForPath(
      "https://hash.ai/@hash/types/property-type/email/",
    );

    if (
      updatedEmails &&
      updatedEmails.sort().join(",") !== currentEmails.sort().join(",")
    ) {
      throw new UserInputError("Cannot change email");
    }

    const currentShortname = user.shortname;

    const updatedShortname = getNewValueForPath(
      "https://hash.ai/@hash/types/property-type/shortname/",
    );

    const updatedDisplayName = getNewValueForPath(
      "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/",
    );

    if (updatedShortname) {
      if (currentShortname && currentShortname !== updatedShortname) {
        throw new UserInputError("Cannot change shortname");
      }

      await validateAccountShortname(
        context,
        { actorId: user.accountId },
        updatedShortname,
      );
    }

    const isDisplayNameRemoved = isValueRemovedByPatches<UserProperties>({
      baseUrl:
        "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/",
      propertyPatches,
    });
    if (
      (updatedDisplayName !== undefined && !updatedDisplayName) ||
      isDisplayNameRemoved
    ) {
      throw new ApolloError("Cannot unset display name");
    }

    const isIncompleteUser = !user.isAccountSignupComplete;

    if (isIncompleteUser && updatedShortname && updatedDisplayName) {
      /**
       * If the user doesn't have access to the HASH instance,
       * we need to forbid them from completing account signup
       * and prevent them from receiving ownership of the web.
       */
      if (!userHasAccessToHash({ user })) {
        throw new Error(
          "The user does not have access to the HASH instance, and therefore cannot complete account signup.",
        );
      }

      // Now that the user has completed signup, we can transfer the ownership of the web
      // allowing them to create entities and types.
      await modifyWebAuthorizationRelationships(
        context,
        { actorId: systemAccountId },
        [
          {
            operation: "delete",
            relationship: {
              subject: {
                kind: "account",
                subjectId: systemAccountId,
              },
              resource: {
                kind: "web",
                resourceId: user.accountId as OwnedById,
              },
              relation: "owner",
            },
          },
          {
            operation: "create",
            relationship: {
              subject: {
                kind: "account",
                subjectId: user.accountId,
              },
              resource: {
                kind: "web",
                resourceId: user.accountId as OwnedById,
              },
              relation: "owner",
            },
          },
        ],
      );
    }
  };

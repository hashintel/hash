import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { UserV4Properties } from "@local/hash-isomorphic-utils/system-types/user";
import { AccountId, OwnedById } from "@local/hash-subgraph";
import { ApolloError, UserInputError } from "apollo-server-express";

import { userHasAccessToHash } from "../../../../../shared/user-has-access-to-hash";
import { ImpureGraphContext } from "../../../../context-types";
import { modifyWebAuthorizationRelationships } from "../../../../ontology/primitive/util";
import { systemAccountId } from "../../../../system-account";
import {
  shortnameContainsInvalidCharacter,
  shortnameIsRestricted,
  shortnameIsTaken,
  shortnameMaximumLength,
  shortnameMinimumLength,
} from "../../../system-types/account.fields";
import {
  getUserFromEntity,
  updateUserKratosIdentityTraits,
} from "../../../system-types/user";
import { UpdateEntityHookCallback } from "../update-entity-hooks";

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

export const userBeforeEntityUpdateHookCallback: UpdateEntityHookCallback =
  async ({ entity, updatedProperties, context }) => {
    const user = getUserFromEntity({ entity });

    const currentShortname = user.shortname;

    const {
      email: updatedEmails,
      shortname: updatedShortname,
      displayName: updatedDisplayName,
    } = simplifyProperties(updatedProperties as UserV4Properties);

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

    const currentDisplayName = user.displayName;

    if (currentDisplayName !== updatedDisplayName) {
      if (!updatedDisplayName) {
        throw new ApolloError("Cannot unset preferred name");
      }
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

    const currentEmails = user.emails;

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

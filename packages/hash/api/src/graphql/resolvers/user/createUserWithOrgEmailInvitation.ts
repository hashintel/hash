import { ApolloError } from "apollo-server-express";

import {
  MutationCreateUserWithOrgEmailInvitationArgs,
  Resolver,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { User, UnresolvedGQLEntity, Org } from "../../../model";

export const createUserWithOrgEmailInvitation: Resolver<
  Promise<UnresolvedGQLEntity>,
  {},
  GraphQLContext,
  MutationCreateUserWithOrgEmailInvitationArgs
> = async (
  _,
  { orgEntityId, invitationEmailToken },
  { dataSources, passport },
) =>
  dataSources.db.transaction(async (client) => {
    const org = await Org.getOrgById(client, { entityId: orgEntityId });

    if (!org) {
      const msg = `Org with entityId ${orgEntityId} not found in datastore`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    // Retrieve the valid email invitation with a matching token associated with the org.
    const emailInvitation = await org.getEmailInvitationWithToken(client, {
      invitationEmailToken,
      errorCodePrefix: "INVITATION_",
    });

    const { inviteeEmailAddress: email } = emailInvitation.properties;

    // Ensure the email address isn't already verified and associated with a user.
    if (await User.getUserByEmail(client, { email, verified: true })) {
      throw new ApolloError(
        `User with the email '${email}' already exists in the datastore`,
        "ALREADY_EXISTS",
      );
    }

    const danglingExistingUser = await User.getUserByEmail(client, {
      email,
      primary: true,
      verified: false,
    });

    // If an existing User entity was found with the primary un-verified email...
    if (danglingExistingUser) {
      // ...we can verify it now and re-use it instead of creating a new user entity.
      await danglingExistingUser.verifyExistingEmailAddress(client, email);
    }

    /**
     * @todo: instead of re-using dangling existing user entities, prune them
     * periodically from the datastore
     */
    const user =
      danglingExistingUser ||
      (await User.createUser(client, {
        emails: [{ address: email, primary: true, verified: true }],
        infoProvidedAtSignup: {},
        memberOf: [],
      }));

    await passport.login(user, {});

    return user.toGQLUnknownEntity();
  });

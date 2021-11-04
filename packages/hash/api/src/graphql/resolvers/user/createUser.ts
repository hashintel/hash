import { ApolloError } from "apollo-server-express";

import {
  MutationCreateUserArgs,
  Resolver,
  VerificationCodeMetadata,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { User } from "../../../model";

export const createUser: Resolver<
  Promise<VerificationCodeMetadata>,
  {},
  GraphQLContext,
  MutationCreateUserArgs
> = async (
  _,
  { email, magicLinkQueryParams },
  { dataSources, emailTransporter },
) =>
  dataSources.db.transaction(async (client) => {
    // Ensure the email address isn't already verified and associated with a user
    if (await User.getUserByEmail(client, { email, verified: true })) {
      throw new ApolloError(
        `User with the email '${email}' already exists in the datastore`,
        "ALREADY_EXISTS",
      );
    }

    /**
     * @todo: instead of re-using dangling existing user entities, prune them
     * periodically from the datastore
     */
    const user =
      // Either get an existing user with this primary un-verified email address, ...
      (await User.getUserByEmail(client, {
        email,
        primary: true,
        verified: false,
      })) ||
      // ...or create this user
      (await User.createUser(client, {
        emails: [{ address: email, primary: true, verified: false }],
        infoProvidedAtSignup: {},
        memberOf: [],
      }));

    /** @todo: rate limit creation of email verification codes */

    const verificationCode = await user.sendEmailVerificationCode(
      client,
      emailTransporter,
      {
        emailAddress: email,
        magicLinkQueryParams: magicLinkQueryParams || undefined,
      },
    );

    return verificationCode.toGQLVerificationCodeMetadata();
  });

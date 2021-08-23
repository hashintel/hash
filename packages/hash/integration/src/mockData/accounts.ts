import { GraphQLClient } from "graphql-request";

import { DBAdapter, PostgresAdapter } from "@hashintel/hash-backend/src/db";
import User from "@hashintel/hash-backend/src/model/user.model";
import {
  CreateOrgMutationVariables,
  CreateOrgMutation,
} from "../graphql/apiTypes.gen";
import { createOrg } from "../graphql/queries/org.queries";

type CreateUserArgs = {
  email: string;
  shortname: string;
  preferredName: string;
};

const createUser =
  (db: DBAdapter) =>
  ({ email, shortname }: CreateUserArgs) =>
    User.create(db)({
      emails: [{ address: email, primary: true, verified: true }],
      shortname,
    });

// Note, the email addresses of these users will automatically be verified
export const createUsers = async () => {
  const users: CreateUserArgs[] = [
    {
      email: "aj@hash.ai",
      shortname: "akash",
      preferredName: "Akash",
    },
    {
      email: "c@hash.ai",
      shortname: "ciaran",
      preferredName: "Ciaran",
    },
    {
      email: "d@hash.ai",
      shortname: "david",
      preferredName: "David",
    },
    {
      email: "ef@hash.ai",
      shortname: "eadan",
      preferredName: "Eaden",
    },
    {
      email: "nh@hash.ai",
      shortname: "nate",
      preferredName: "Nate",
    },
    {
      email: "mr@hash.ai",
      shortname: "marius",
      preferredName: "Marius",
    },
    {
      email: "bw@hash.ai",
      shortname: "ben",
      preferredName: "Ben",
    },
    {
      email: "vu@hash.ai",
      shortname: "valentino",
      preferredName: "Valentino",
    },
  ];

  const db = new PostgresAdapter();

  const userResults = await Promise.all(users.map(createUser(db)));

  await db.close();

  return userResults.map((user) => user.toGQLUser());
};

/**
 * Create additional orgs we might want as dummy/seed data
 * The HASH org is now created as part of migration, as it doubles up as the 'system' account.
 */
export const createOrgs = async (client: GraphQLClient) => {
  const orgs: CreateOrgMutationVariables[] = [];

  const orgResults = await Promise.all(
    orgs.map(
      async (org) => await client.request<CreateOrgMutation>(createOrg, org)
    )
  );

  return orgResults.map((org) => org.createOrg);
};

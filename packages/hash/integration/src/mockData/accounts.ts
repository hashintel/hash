import { DBAdapter } from "@hashintel/hash-backend/src/db";
import User from "@hashintel/hash-backend/src/model/user.model";
import Org from "@hashintel/hash-backend/src/model/org.model";
import {
  OrgProperties,
  Org as GQLOrg,
} from "../graphql/apiTypes.gen";

type CreateUserArgs = {
  email: string;
  shortname: string;
  preferredName: string;
};

// Note, the email addresses of these users will automatically be verified
export const createUsers = async (db: DBAdapter) => {
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
      preferredName: "Eadan",
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

  const userResults = await Promise.all(
    users.map(({ email, ...remainingProperties }) =>
      User.create(db)({
        emails: [{ address: email, primary: true, verified: true }],
        ...remainingProperties,
      })
    )
  );

  return userResults.map((user) => user.toGQLUser());
};

/**
 * Create additional orgs we might want as dummy/seed data
 * The HASH org is now created as part of migration, as it doubles up as the 'system' account.
 */
export const createOrgs = async (db: DBAdapter): Promise<GQLOrg[]> => {
  const orgs: OrgProperties[] = [];

  const orgResults = await Promise.all(orgs.map(Org.create(db)));

  return orgResults.map((org) => org.toGQLOrg());
};

import { DBAdapter } from "@hashintel/hash-api/src/db";
import { DBOrgProperties } from "@hashintel/hash-api/src/db/adapter";
import { User, Org } from "@hashintel/hash-api/src/model";
import { WayToUseHash } from "../graphql/apiTypes.gen";

type CreateUserArgs = {
  email: string;
  shortname: string;
  preferredName: string;
};

// Note, the email addresses of these users will automatically be verified
export const createUsers =
  (db: DBAdapter) =>
  async (org: Org): Promise<User[]> => {
    const createUserArgs: CreateUserArgs[] = [
      {
        email: "alice@example.com",
        shortname: "alice",
        preferredName: "Alice",
      },
      {
        email: "bob@example.com",
        shortname: "bob",
        preferredName: "Bob",
      },
      {
        email: "ak@hash.ai",
        shortname: "kachkaev",
        preferredName: "Alex",
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
      {
        email: "lp@hash.ai",
        shortname: "liana",
        preferredName: "Liana",
      },
    ];

    return Promise.all(
      createUserArgs.map(({ email, ...remainingProperties }) =>
        db.transaction(async (client) => {
          await org
            .acquireLock(client)
            .then(() => org.refetchLatestVersion(client));

          const user = await User.createUser(client, {
            emails: [{ address: email, primary: true, verified: true }],
            infoProvidedAtSignup: { usingHow: WayToUseHash.WithATeam },
            memberOf: [],
            ...remainingProperties,
          });

          await user.joinOrg(client, { org, responsibility: "Developer" });

          return user;
        }),
      ),
    );
  };

/**
 * Create additional orgs we might want as dummy/seed data
 * The HASH org is now created as part of migration, as it doubles up as the 'system' account.
 */
export const createOrgs = async (db: DBAdapter): Promise<Org[]> => {
  const orgs: { properties: DBOrgProperties; createdById: string }[] = [];

  return await Promise.all(orgs.map((params) => Org.createOrg(db, params)));
};

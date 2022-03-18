import { DbAdapter } from "@hashintel/hash-api/src/db";
import { DbOrgProperties } from "@hashintel/hash-api/src/db/adapter";
import { User, Org } from "@hashintel/hash-api/src/model";
import { WayToUseHash } from "../graphql/apiTypes.gen";

type CreateUserArgs = {
  email: string;
  shortname: string;
  preferredName: string;
};

// Note, the email addresses of these users will automatically be verified
export const createUsers =
  (db: DbAdapter) =>
  async (org: Org): Promise<User[]> => {
    const createUserArgs: CreateUserArgs[] = [
      {
        email: "alice@example.com",
        shortname: "alice",
        preferredName: "Alice Alison",
      },
      {
        email: "bob@example.com",
        shortname: "bob",
        preferredName: "Bob Bobson",
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
            ...remainingProperties,
          });

          await user.joinOrg(client, {
            updatedByAccountId: user.accountId,
            org,
            responsibility: "Developer",
          });

          return user;
        }),
      ),
    );
  };

/**
 * Create additional orgs we might want as dummy/seed data
 * The HASH org is now created as part of migration, as it doubles up as the 'system' account.
 */
export const createOrgs = async (db: DbAdapter): Promise<Org[]> => {
  const orgs: { properties: DbOrgProperties; createdByAccountId: string }[] =
    [];

  return await Promise.all(orgs.map((params) => Org.createOrg(db, params)));
};

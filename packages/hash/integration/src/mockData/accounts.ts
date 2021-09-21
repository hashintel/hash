import { DBAdapter } from "@hashintel/hash-backend/src/db";
import { User, Org } from "@hashintel/hash-backend/src/model";
import { OrgProperties, WayToUseHash } from "../graphql/apiTypes.gen";

type CreateUserArgs = {
  email: string;
  shortname: string;
  preferredName: string;
};

// Note, the email addresses of these users will automatically be verified
export const createUsers =
  (db: DBAdapter) =>
  async (org: Org): Promise<User[]> => {
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

    return Promise.all(
      users.map(({ email, ...remainingProperties }) =>
        User.createUser(db)({
          emails: [{ address: email, primary: true, verified: true }],
          infoProvidedAtSignup: { usingHow: WayToUseHash.WithATeam },
          memberOf: [
            {
              role: "Developer",
              org: {
                __linkedData: {
                  entityId: org.entityVersionId,
                  entityTypeId: org.entityType.entityId,
                },
              },
            },
          ],
          ...remainingProperties,
        })
      )
    );
  };

/**
 * Create additional orgs we might want as dummy/seed data
 * The HASH org is now created as part of migration, as it doubles up as the 'system' account.
 */
export const createOrgs = async (db: DBAdapter): Promise<Org[]> => {
  const orgs: { properties: OrgProperties; createdById: string }[] = [];

  return await Promise.all(orgs.map(Org.createOrg(db)));
};

import { MutationCreateOrgArgs, Resolver } from "../../apiTypes.gen";
import { Account, UnresolvedGQLEntity, Org } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";

export const createOrg: Resolver<
  Promise<UnresolvedGQLEntity>,
  {},
  LoggedInGraphQLContext,
  MutationCreateOrgArgs
> = async (_, { org: orgInput, responsibility }, { dataSources, user }) =>
  dataSources.db.transaction(async (client) => {
    const { shortname, name, orgSize } = orgInput;

    await user.acquireLock(client);

    await user.refetchLatestVersion(client);

    await Account.validateShortname(client, shortname);

    const org = await Org.createOrg(dataSources.db, {
      properties: {
        shortname,
        name,
        infoProvidedAtCreation: {
          orgSize,
        },
        memberships: [],
      },
      createdById: user.entityId,
    });

    await user.joinOrg(client, { org, responsibility });

    return org.toGQLUnknownEntity();
  });

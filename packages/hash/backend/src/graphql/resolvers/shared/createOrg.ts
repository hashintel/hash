import { MutationCreateOrgArgs, Resolver } from "../../apiTypes.gen";
import { Account, EntityWithIncompleteEntityType, Org } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";

export const createOrg: Resolver<
  Promise<EntityWithIncompleteEntityType>,
  {},
  LoggedInGraphQLContext,
  MutationCreateOrgArgs
> = async (_, { org: orgInput, role }, { dataSources, user }) =>
  dataSources.db.transaction(async (client) => {
    const { shortname, name, orgSize } = orgInput;

    await Account.validateShortname(client)(shortname);

    const org = await Org.createOrg(dataSources.db)({
      properties: {
        shortname,
        name,
        infoProvidedAtCreation: {
          orgSize,
        },
      },
      createdById: user.entityId,
    });

    await user.joinOrg(client)({ org, role });

    return org.toGQLUnknownEntity();
  });

import { MutationCreateOrgArgs, Resolver } from "../../apiTypes.gen";
import { Account, EntityWithIncompleteEntityType, Org } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";

export const createOrg: Resolver<
  Promise<EntityWithIncompleteEntityType>,
  {},
  LoggedInGraphQLContext,
  MutationCreateOrgArgs
> = async (_, { org: orgInput }, { dataSources, user }) =>
  dataSources.db.transaction(async (client) => {
    const { shortname, name, orgSizeLowerBound, orgSizeUpperBound } = orgInput;

    await Account.validateShortname(client)(shortname);

    const org = await Org.createOrg(dataSources.db)({
      properties: {
        shortname,
        name,
        infoProvidedAtCreation: {
          orgSize: {
            lowerBound: orgSizeLowerBound,
            upperBound: orgSizeUpperBound,
          },
        },
      },
      createdById: user.entityId,
    });

    /** @todo: make the user that created the org a member of the org  */

    return org.toGQLUnknownEntity();
  });

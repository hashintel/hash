import { MutationCreateOrgArgs, ResolverFn } from "../../apiTypes.gen";
import { Account, OrgModel } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";
import { mapOrgModelToGQL, UnresolvedGQLOrg } from "../user/util";

export const createOrg: ResolverFn<
  Promise<UnresolvedGQLOrg>,
  {},
  LoggedInGraphQLContext,
  MutationCreateOrgArgs
> = async (_, { org: orgInput, responsibility }, { dataSources, user }) =>
  dataSources.db.transaction(async (client) => {
    const { graphApi } = dataSources;
    const { shortname, name, orgSize } = orgInput;

    /** @todo: potentially deprecate these method calls depending on Graph API transaction implementation */
    await (user as any)
      .acquireLock(client)
      .then(() => (user as any).refetchLatestVersion(client));

    await Account.validateShortname(client, shortname);

    const org = await OrgModel.createOrg(graphApi, {
      providedInfo: {
        orgSize,
      },
      shortname,
      name,
    });

    /**
     * @todo: potentially deprecate these method calls depending on Graph API
     * transaction implementation (@see https://app.asana.com/0/1201095311341924/1202573572594586/f)
     */
    await (org as any)
      .acquireLock(client)
      .then(() => (org as any).refetchLatestVersion(client));

    await user.joinOrg(graphApi, {
      org,
      responsibility,
    });

    return mapOrgModelToGQL(org);
  });

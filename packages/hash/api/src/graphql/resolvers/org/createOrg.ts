import { ApolloError } from "apollo-server-errors";
import { MutationCreateOrgArgs, ResolverFn } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { UnresolvedGQLOrg } from "./util";

export const createOrg: ResolverFn<
  Promise<UnresolvedGQLOrg>,
  {},
  LoggedInGraphQLContext,
  MutationCreateOrgArgs
> = async (_, __, { dataSources }) =>
  dataSources.db.transaction(async (_client) => {
    throw new ApolloError("The joinOrg mutation is unimplemented");

    // const { graphApi } = dataSources;
    // const { shortname, name, orgSize } = orgInput;

    // /** @todo: potentially deprecate these method calls depending on Graph API transaction implementation */
    // await user
    //   .acquireLock(client)
    //   .then(() => user.refetchLatestVersion(client));

    // await Account.validateShortname(client, shortname);

    // const org = await OrgModel.createOrg(graphApi, {
    //   providedInfo: {
    //     orgSize,
    //   },
    //   shortname,
    //   name,
    // });

    // /**
    //  * @todo: potentially deprecate these method calls depending on Graph API
    //  * transaction implementation (@see https://app.asana.com/0/1201095311341924/1202573572594586/f)
    //  */
    // await org
    //   .acquireLock(client)
    //   .then(() => org.refetchLatestVersion(client));

    // await user.joinOrg(graphApi, {
    //   org,
    //   responsibility,
    // });

    // return mapOrgModelToGQL(org);
  });

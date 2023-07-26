import { getLinearUserSecretByLinearOrgId } from "../../../../graph/knowledge/system-types/linear-user-secret";
import { listTeams } from "../../../../integrations/linear";
import {
  LinearTeam,
  QueryLinearTeamsArgs,
  ResolverFn,
} from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";

export const linearTeamsResolver: ResolverFn<
  Promise<LinearTeam[]>,
  {},
  LoggedInGraphQLContext,
  QueryLinearTeamsArgs
> = async (_, params, { dataSources, user, vault }) => {
  const linearSecretEntity = await getLinearUserSecretByLinearOrgId(
    dataSources,
    {
      userAccountId: user.accountId,
      linearOrgId: params.linearOrgId,
    },
  );

  if (!vault) {
    throw new Error("No vault available.");
  }

  const vaultSecret = await vault.read<{ value: string }>({
    secretMountPath: "secret",
    path: linearSecretEntity.vaultPath,
  });

  const teams = await listTeams({ apiKey: vaultSecret.data.value });

  return teams.map(
    ({ id, name, description, color, icon, private: _private }) => ({
      id,
      name,
      description,
      color,
      icon,
      private: _private,
    }),
  );
};

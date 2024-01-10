import { getLinearUserSecretByLinearOrgId } from "../../../../graph/knowledge/system-types/linear-user-secret";
import { getOrganization, listTeams } from "../../../../integrations/linear";
import type {
  LinearOrganization,
  QueryGetLinearOrganizationArgs,
  ResolverFn,
} from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";

export const getLinearOrganizationResolver: ResolverFn<
  Promise<LinearOrganization>,
  {},
  LoggedInGraphQLContext,
  QueryGetLinearOrganizationArgs
> = async (_, params, { dataSources, authentication, user, vault }) => {
  const linearSecretEntity = await getLinearUserSecretByLinearOrgId(
    dataSources,
    authentication,
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

  const apiKey = vaultSecret.data.value;

  const [organization, teams] = await Promise.all([
    getOrganization({ apiKey }),
    listTeams({ apiKey }),
  ]);

  return {
    id: organization.id,
    logoUrl: organization.logoUrl,
    name: organization.name,
    teams: teams.map(
      ({ id, name, description, color, icon, private: _private }) => ({
        id,
        name,
        description,
        color,
        icon,
        private: _private,
      }),
    ),
  };
};

import { AccountId, EntityId } from "@local/hash-subgraph";
import { Auth } from "googleapis";

import { ImpureGraphFunction } from "../../../graph/context-types";
import type { VaultClient } from "../../../vault";
import { getSecretEntitiesForAccount } from "./get-secret-entities-for-account";

export const getTokensForAccount: ImpureGraphFunction<
  {
    userAccountId: AccountId;
    googleAccountEntityId: EntityId;
    vaultClient: VaultClient;
  },
  Promise<Auth.Credentials | null>
> = async (
  context,
  authentication,
  { userAccountId, googleAccountEntityId, vaultClient },
) => {
  const secretAndLinkPairs = await getSecretEntitiesForAccount(
    context,
    authentication,
    {
      userAccountId,
      googleAccountEntityId,
    },
  );

  if (!secretAndLinkPairs[0]) {
    return null;
  }

  console.log(JSON.stringify(secretAndLinkPairs, null, 2));

  const { userSecret } = secretAndLinkPairs[0];

  const vaultPath =
    userSecret.properties[
      "https://hash.ai/@hash/types/property-type/vault-path/"
    ];

  try {
    const vaultResponse = await vaultClient.read<Auth.Credentials>({
      secretMountPath: "secret",
      path: vaultPath,
      userAccountId,
    });
    return vaultResponse.data;
  } catch (err) {
    console.log(err);
    return null;
  }
};

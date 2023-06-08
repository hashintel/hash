import { systemUserShortname } from "@local/hash-isomorphic-utils/environment";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import {
  entityIdFromOwnedByIdAndEntityUuid,
  EntityUuid,
  OwnedById,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { useEffect, useMemo, useState } from "react";

import { useBlockProtocolGetEntity } from "./block-protocol-functions/knowledge/use-block-protocol-get-entity";
import { useWorkspaceByShortname } from "./use-workspace-by-shortname";

export const useWorkspaceShortnameByEntityUuid = (params: {
  entityUuid: EntityUuid;
  disabled?: boolean;
}): { workspaceShortname?: string; loading: boolean } => {
  const { entityUuid, disabled } = params;

  const [workspaceShortname, setWorkspaceShortname] = useState<string>();
  const [loading, setLoading] = useState<boolean>(false);

  const { getEntity } = useBlockProtocolGetEntity();

  const {
    workspace: systemUserWorkspace,
    loading: loadingSystemUserWorkspace,
  } = useWorkspaceByShortname(systemUserShortname);

  const systemUserOwnedById = useMemo(
    () => systemUserWorkspace?.accountId as OwnedById | undefined,
    [systemUserWorkspace],
  );

  useEffect(() => {
    let cancelled = false;
    if (systemUserOwnedById && !disabled) {
      void (async () => {
        setLoading(true);

        const entityId = entityIdFromOwnedByIdAndEntityUuid(
          systemUserOwnedById,
          entityUuid,
        );

        const { data: subgraph } = await getEntity({
          data: {
            entityId,
            graphResolveDepths: {
              constrainsLinkDestinationsOn: { outgoing: 0 },
              constrainsLinksOn: { outgoing: 0 },
              constrainsValuesOn: { outgoing: 0 },
              constrainsPropertiesOn: { outgoing: 0 },
              isOfType: { outgoing: 0 },
              inheritsFrom: { outgoing: 0 },
              hasLeftEntity: { incoming: 0, outgoing: 0 },
              hasRightEntity: { incoming: 0, outgoing: 0 },
            },
          },
        });

        if (!subgraph) {
          throw new Error(
            `Could not get workspace entity with entity ID "${entityId}"`,
          );
        }

        const entity = getRoots(subgraph)[0]!;

        const shortname =
          entity.properties[
            extractBaseUrl(types.propertyType.shortName.propertyTypeId)
          ];

        if (!shortname) {
          throw Error(
            `Could not get shortname of workspace with entityUuid "${entityUuid}"`,
          );
        }

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- false-positive (because of await)
        if (!cancelled) {
          setWorkspaceShortname(shortname as string);
          setLoading(false);
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [entityUuid, getEntity, systemUserOwnedById, disabled]);

  return { workspaceShortname, loading: loadingSystemUserWorkspace || loading };
};

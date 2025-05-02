import type { EntityType } from "@blockprotocol/type-system";
import {
  compareOntologyTypeVersions,
  extractBaseUrl,
  extractVersion,
} from "@blockprotocol/type-system";
import { TypeCard } from "@hashintel/design-system";
/* eslint-disable no-restricted-imports */
import { blockProtocolEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { useFormContext, useWatch } from "react-hook-form";

import { useEntityTypesOptions } from "../../shared/entity-types-options-context";
import type { EntityTypeEditorFormData } from "../../shared/form-types";
import { useIsReadonly } from "../../shared/read-only-context";
import { Link } from "../shared/link";
import { useTypeVersions } from "../shared/use-type-versions";

export const InheritedTypeCard = ({
  onRemove,
  entityType,
}: {
  entityType: Pick<EntityType, "$id" | "title">;
  onRemove: () => void;
}) => {
  const { $id, title } = entityType;
  const { entityTypes } = useEntityTypesOptions();

  const [currentVersion, latestVersion] = useTypeVersions($id, entityTypes);
  const newVersion =
    compareOntologyTypeVersions(currentVersion, latestVersion) < 0
      ? latestVersion
      : undefined;

  const isReadOnly = useIsReadonly();

  const { control, setValue } = useFormContext<EntityTypeEditorFormData>();
  const directParentEntityTypeIds = useWatch({
    control,
    name: "allOf",
  });

  const upgradeToVersion = () => {
    if (!newVersion) {
      return;
    }

    setValue(
      "allOf",
      directParentEntityTypeIds.map((id) => {
        const targetBaseUrl = extractBaseUrl(id);

        if (targetBaseUrl === extractBaseUrl($id)) {
          return `${targetBaseUrl}v/${newVersion.toString()}` as const;
        }
        return id;
      }),
      { shouldDirty: true },
    );
  };

  /** @todo H-3363 take account of inheritance by using closed schema */
  const isLink = directParentEntityTypeIds.includes(
    blockProtocolEntityTypes.link.entityTypeId,
  );

  return (
    <TypeCard
      onDelete={isReadOnly ? undefined : onRemove}
      isLink={isLink}
      LinkComponent={Link}
      newVersionConfig={
        !isReadOnly && newVersion
          ? {
              newVersion,
              onUpdateVersion: upgradeToVersion,
            }
          : undefined
      }
      title={title}
      url={$id}
      version={extractVersion($id)}
    />
  );
};

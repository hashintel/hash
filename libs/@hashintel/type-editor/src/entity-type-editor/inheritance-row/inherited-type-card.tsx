import { extractVersion } from "@blockprotocol/graph";
import { EntityType, extractBaseUrl } from "@blockprotocol/type-system/slim";
import { TypeCard } from "@hashintel/design-system";
import { useFormContext, useWatch } from "react-hook-form";

import { useEntityTypesOptions } from "../../shared/entity-types-options-context";
import { EntityTypeEditorFormData } from "../../shared/form-types";
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
  const newVersion = currentVersion < latestVersion ? latestVersion : undefined;

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
          return `${targetBaseUrl}v/${newVersion}` as const;
        }
        return id;
      }),
      { shouldDirty: true },
    );
  };

  return (
    <TypeCard
      onDelete={isReadOnly ? undefined : onRemove}
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

import type { VersionedUrl } from "@blockprotocol/type-system";
import type { EntityType } from "@blockprotocol/type-system/slim";
import { Chip } from "@hashintel/design-system";

import { useEntityTypesOptions } from "../../shared/entity-types-options-context";
import { useTypeVersions } from "../shared/use-type-versions";
import { TypeChipLabel } from "./type-chip-label";

export const DestinationEntityType = ({
  updateVersion,
  onDelete,
  entityTypeSchema,
}: {
  updateVersion?: (newVersion: VersionedUrl) => void;
  onDelete?: () => void;
  entityTypeSchema: EntityType;
}) => {
  const { entityTypes } = useEntityTypesOptions();

  const [currentVersion, latestVersion, baseUrl] = useTypeVersions(
    entityTypeSchema.$id,
    entityTypes,
  );

  return (
    <Chip
      key={entityTypeSchema.$id}
      sx={{ m: 0.25 }}
      tabIndex={-1}
      onDelete={onDelete}
      color="blue"
      label={
        <TypeChipLabel
          currentVersion={currentVersion}
          latestVersion={latestVersion}
          onUpdate={
            updateVersion
              ? () => updateVersion(`${baseUrl}v/${latestVersion}`)
              : undefined
          }
          versionedUrl={entityTypeSchema.$id}
        >
          {entityTypeSchema.title}
        </TypeChipLabel>
      }
    />
  );
};

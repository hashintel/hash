import { VersionedUrl } from "@blockprotocol/type-system";
import { EntityType } from "@blockprotocol/type-system/slim";
import { Chip } from "@hashintel/design-system";

import { useEntityTypesOptions } from "../../shared/entity-types-options-context";
import { useTypeVersions } from "../shared/use-type-versions";
import { TypeChipLabel } from "./type-chip-label";

export const DestinationEntityType = ({
  updateVersion,
  onDelete,
  entityType,
}: {
  updateVersion?: (newVersion: VersionedUrl) => void;
  onDelete?: () => void;
  entityType: EntityType;
}) => {
  const { entityTypes } = useEntityTypesOptions();

  const [currentVersion, latestVersion, baseUrl] = useTypeVersions(
    entityType.$id,
    entityTypes,
  );

  return (
    <Chip
      key={entityType.$id}
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
          versionedUrl={entityType.$id}
        >
          {entityType.title}
        </TypeChipLabel>
      }
    />
  );
};

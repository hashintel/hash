import { TableCell } from "@mui/material";

import { useEntityTypesOptions } from "../../shared/entity-types-options-context";
import {
  EntityTypeTableRow,
  EntityTypeTableTitleCellText,
} from "../shared/entity-type-table";
import { InheritedIcon } from "../shared/inherited-icon";
import { Link } from "../shared/link";
import {
  MultipleValuesCellSummary,
  MultipleValuesControlContainer,
} from "../shared/multiple-values-cell";
import { TypeMenuCell } from "../shared/type-menu-cell";
import { InheritedValues } from "../shared/use-inherited-values";
import { AnythingChip } from "./anything-chip";
import { DestinationEntityType } from "./destination-entity-type";
import { DestinationTypeContainer } from "./destination-type-container";

export const InheritedLinkRow = ({
  inheritedLinkData,
}: {
  inheritedLinkData: InheritedValues["links"][0];
}) => {
  const {
    $id,
    entityTypes: destinationEntityTypes,

    minValue,
    maxValue,
    infinity,
  } = inheritedLinkData;

  const { entityTypes, linkTypes } = useEntityTypesOptions();
  const linkSchema = linkTypes[$id];

  if (!linkSchema) {
    throw new Error(`Inherited property type ${$id} not found`);
  }

  return (
    <EntityTypeTableRow inherited>
      <TableCell>
        <EntityTypeTableTitleCellText>
          <InheritedIcon sx={{ mr: 1 }} />
          <Link href={$id} style={{ color: "inherit", fontWeight: 600 }}>
            {linkSchema.title}
          </Link>
        </EntityTypeTableTitleCellText>
      </TableCell>
      <TableCell sx={{ py: "0 !important" }}>
        <DestinationTypeContainer>
          {destinationEntityTypes.length ? (
            destinationEntityTypes.map((entityTypeId) => {
              const entityType = entityTypes[entityTypeId];

              if (!entityType) {
                throw new Error(
                  `Destination entity type ${entityTypeId} not found in options`,
                );
              }

              return (
                <DestinationEntityType
                  key={entityTypeId}
                  entityType={entityType}
                />
              );
            })
          ) : (
            <AnythingChip />
          )}
        </DestinationTypeContainer>
      </TableCell>
      <TableCell sx={{ p: "0 !important" }}>
        <MultipleValuesControlContainer
          canToggle={false}
          menuOpen={false}
          isReadOnly
          showSummary
        >
          <MultipleValuesCellSummary
            show
            infinity={infinity}
            min={minValue}
            max={maxValue}
          />
        </MultipleValuesControlContainer>
      </TableCell>
      <TypeMenuCell editable={false} typeId={$id} variant="link" />
    </EntityTypeTableRow>
  );
};

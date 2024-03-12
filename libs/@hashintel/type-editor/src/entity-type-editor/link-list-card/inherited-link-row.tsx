import { fluidFontClassName } from "@hashintel/design-system/theme";
import { TableCell, Tooltip } from "@mui/material";

import { useEntityTypesOptions } from "../../shared/entity-types-options-context";
import { ArrowTurnDownRightIcon } from "../shared/arrow-turn-down-right-icon";
import {
  EntityTypeTableRow,
  EntityTypeTableTitleCellText,
} from "../shared/entity-type-table";
import { generateReadonlyMessage } from "../shared/generate-readonly-message";
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
    inheritanceChain,
    minValue,
    maxValue,
    infinity,
  } = inheritedLinkData;

  const { entityTypes, linkTypes } = useEntityTypesOptions();
  const linkSchema = linkTypes[$id]?.schema;

  if (!linkSchema) {
    throw new Error(`Inherited property type ${$id} not found`);
  }

  const readonlyMessage = generateReadonlyMessage({
    inheritanceChain,
  });

  return (
    <EntityTypeTableRow inherited>
      <TableCell>
        <EntityTypeTableTitleCellText>
          <ArrowTurnDownRightIcon sx={{ mr: 1 }} />
          <Link href={$id} style={{ color: "inherit", fontWeight: 500 }}>
            {linkSchema.title}
          </Link>
        </EntityTypeTableTitleCellText>
      </TableCell>
      <Tooltip
        placement="top"
        classes={{ popper: fluidFontClassName }}
        title={readonlyMessage}
      >
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
                    entityTypeSchema={entityType.schema}
                  />
                );
              })
            ) : (
              <AnythingChip />
            )}
          </DestinationTypeContainer>
        </TableCell>
      </Tooltip>
      <Tooltip
        placement="top"
        classes={{ popper: fluidFontClassName }}
        title={readonlyMessage}
      >
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
      </Tooltip>

      <TypeMenuCell editable={false} typeId={$id} variant="link" />
    </EntityTypeTableRow>
  );
};

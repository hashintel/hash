import { EntityType, PropertyType } from "@blockprotocol/graph";
import { faClose } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/design-system";
import { Box, Stack } from "@mui/material";
import { useFormContext } from "react-hook-form";

import { useReadonlyContext } from "../readonly-context";
import { FormValues } from "../types";
import { ChainOperatorSelector } from "./filter-row/chain-operator-selector";
import { EntityTypeSelector } from "./filter-row/entity-type-selector";
import { OperatorSelector } from "./filter-row/operator-selector";
import { PropertyTypeSelector } from "./filter-row/property-type-selector";
import { SelectorGroupWrapper } from "./filter-row/selector-group-wrapper";
import { TypeSelector } from "./filter-row/type-selector";
import { fieldOperators } from "./filter-row/utils";
import { ValueInput } from "./filter-row/value-input";

interface FilterRowProps {
  index: number;
  onRemove: () => void;
  entityTypes: EntityType[];
  propertyTypes: PropertyType[];
}

export const FilterRow = ({
  onRemove,
  index,
  entityTypes,
  propertyTypes,
}: FilterRowProps) => {
  const readonly = useReadonlyContext();
  const { watch } = useFormContext<FormValues>();

  const chainOperator = watch("operator");
  const chainOperatorText = chainOperator === "AND" ? "and" : "or";

  const isFirstOne = index === 0;
  const isSecondOne = index === 1;

  const watchedType = watch(`filters.${index}.type`);
  const watchedOperator = watch(`filters.${index}.operator`);

  const watchedOperatorHasValue = fieldOperators[watchedType].find(
    (op) => op.operator === watchedOperator,
  )?.hasValue;

  return (
    <Stack
      direction="row"
      gap={1.5}
      sx={{ alignItems: "center", fontSize: 14, maxWidth: "100%" }}
    >
      <Box>
        {isFirstOne ? (
          "Where"
        ) : isSecondOne ? (
          <ChainOperatorSelector />
        ) : (
          chainOperatorText
        )}
      </Box>

      <SelectorGroupWrapper>
        <TypeSelector index={index} />
        {watchedType === "Property" && (
          <PropertyTypeSelector index={index} propertyTypes={propertyTypes} />
        )}
        <OperatorSelector index={index} />
        {watchedOperatorHasValue &&
          (watchedType === "Type" ? (
            <EntityTypeSelector index={index} entityTypes={entityTypes} />
          ) : (
            <ValueInput index={index} />
          ))}
      </SelectorGroupWrapper>

      {!readonly && (
        <IconButton onClick={onRemove}>
          <FontAwesomeIcon icon={faClose} />
        </IconButton>
      )}
    </Stack>
  );
};

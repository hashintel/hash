import { faClose } from "@fortawesome/free-solid-svg-icons";
import { Box, Select, Stack, styled } from "@mui/material";
import { FieldArrayWithId, useFormContext } from "react-hook-form";

import { faAsterisk } from "../../fa-icons/fa-asterisk";
import { faDiagramSubtask } from "../../fa-icons/fa-diagram-subtask";
import { FontAwesomeIcon } from "../../fontawesome-icon";
import { IconButton } from "../../icon-button";
import { MenuItem } from "../../menu-item";
import { FormValues } from "../types";
import { RHFSelect } from "./rhf-select";

const StyledIcon = styled(FontAwesomeIcon)({
  marginRight: "8px !important",
});

interface FilterRowProps {
  index: number;
  onRemove: () => void;
  value: FieldArrayWithId<FormValues, "filters", "id">;
}

export const FilterRow = ({ value, onRemove, index }: FilterRowProps) => {
  const form = useFormContext<FormValues>();

  const operator = form.watch("operator");
  const operatorText = operator === "AND" ? "and" : "or";

  const isFirstOne = index === 0;
  const isSecondOne = index === 1;

  const operatorSelector = (
    <RHFSelect name="operator" control={form.control}>
      <MenuItem value="AND">and</MenuItem>
      <MenuItem value="OR">or</MenuItem>
    </RHFSelect>
  );

  return (
    <Stack direction="row" gap={1.5}>
      <Box sx={{ width: 80 }}>
        {isFirstOne ? "Where" : isSecondOne ? operatorSelector : operatorText}
      </Box>

      <Stack direction="row">
        <Select
          value="type"
          onChange={() => alert("change")}
          displayEmpty
          size="xs"
        >
          <MenuItem value="type">
            <StyledIcon icon={{ icon: faAsterisk }} />
            Type
          </MenuItem>
          <MenuItem value="property">
            <StyledIcon icon={{ icon: faDiagramSubtask }} />
            Property
          </MenuItem>
        </Select>

        <Box>Type</Box>
        <Box>{value.operator} 123</Box>
        <Box>Saas Company</Box>
      </Stack>

      <IconButton onClick={onRemove}>
        <FontAwesomeIcon icon={faClose} />
      </IconButton>
    </Stack>
  );
};

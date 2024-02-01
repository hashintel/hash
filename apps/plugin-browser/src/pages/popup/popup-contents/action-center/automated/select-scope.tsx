import { VersionedUrl } from "@blockprotocol/graph";
import { Button, ButtonProps, PlusIcon } from "@hashintel/design-system";
import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";

import { LocalStorage } from "../../../../../shared/storage";
import {
  borderColors,
  darkModeBorderColor,
  darkModeInputBackgroundColor,
  darkModeInputColor,
  lightModeBorderColor,
} from "../../../../shared/style-values";
import { CircleExclamationIcon } from "./select-scope/circle-exclamation-icon";
import { RowsByLocation } from "./select-scope/rows-by-location";
import { RowsByType } from "./select-scope/rows-by-type";
import { SelectGrouping } from "./select-scope/select-grouping";
import { CommonRowsProps } from "./select-scope/shared/common-rows-props";

const AddTypeButton = ({
  disabled,
  label,
  onClick,
}: {
  disabled: boolean;
  label: string;
  onClick: ButtonProps["onClick"];
}) => (
  <Button
    disabled={disabled}
    onClick={onClick}
    size="xs"
    sx={{ fontSize: 12, mr: 2, px: 1.2, py: 1, whiteSpace: "nowrap" }}
  >
    <PlusIcon
      sx={{
        fill: ({ palette }) => palette.blue[40],
        fontSize: 16,

        mr: 1,
      }}
    />{" "}
    {label}
  </Button>
);

const NoTypesSelectedMessage = () => (
  <Stack alignItems="center" direction="row" sx={{ mb: 1 }}>
    <CircleExclamationIcon
      sx={{
        fill: ({ palette }) => palette.error.main,
        fontSize: 15,
        mr: 0.8,
      }}
    />
    <Typography
      sx={{
        color: ({ palette }) => palette.error.main,
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      No types yet selected
    </Typography>
  </Stack>
);

export const SelectScope = ({
  inferenceConfig,
  setInferenceConfig,
}: {
  inferenceConfig: LocalStorage["automaticInferenceConfig"];
  setInferenceConfig: (
    config: LocalStorage["automaticInferenceConfig"],
  ) => void;
}) => {
  const { displayGroupedBy, rules } = inferenceConfig;

  const anyTypesSelected = rules.length > 0;

  const [draftRule, setDraftRule] = useState<{
    entityTypeId?: VersionedUrl;
    restrictToDomains: string[];
  } | null>(anyTypesSelected ? null : { restrictToDomains: [] });

  const [showTable, setShowTable] = useState(anyTypesSelected);

  const uniqueDomainsUsed = useMemo(
    () =>
      Array.from(
        new Set(
          [...rules, draftRule ?? { restrictToDomains: [] }].flatMap(
            ({ restrictToDomains }) => restrictToDomains,
          ),
        ),
      ),
    [rules, draftRule],
  );

  if (!anyTypesSelected && !showTable) {
    return (
      <Box>
        <NoTypesSelectedMessage />
        <Stack
          alignItems="center"
          direction="row"
          sx={({ palette }) => ({
            background: palette.gray[5],
            border: `1px solid ${lightModeBorderColor}`,
            px: 2,
            py: 1.5,
            "@media (prefers-color-scheme: dark)": {
              background: darkModeInputBackgroundColor,
              borderColor: darkModeBorderColor,
            },
          })}
        >
          <AddTypeButton
            disabled={false}
            onClick={() => setShowTable(true)}
            label="SELECT TYPE"
          />
          <Typography sx={{ fontSize: 14 }}>
            You must select at least one type to use auto-inference
          </Typography>
        </Stack>
      </Box>
    );
  }

  const rowsComponentProps: CommonRowsProps = {
    domainOptions: uniqueDomainsUsed,
    draftRule,
    setDraftRule,
    inferenceConfig,
    setInferenceConfig,
  };

  return (
    <Box>
      {!anyTypesSelected && <NoTypesSelectedMessage />}
      <Table
        sx={{
          borderRadius: 1,
          borderStyle: "solid",
          borderWidth: 1,
          ...borderColors,
          th: {
            background: "#F2F5FA",
            color: ({ palette }) => palette.gray[90],
            fontSize: 13,
            fontWeight: 600,
            px: 1.5,
            "@media (prefers-color-scheme: dark)": {
              background: darkModeInputBackgroundColor,
              color: darkModeInputColor,
            },
          },
          td: {
            px: 1,
          },
          "th, td": {
            py: 0.8,
            borderStyle: "solid",
            borderWidth: 1,
            borderRadius: 1,
            ...borderColors,
            "&:first-child": {
              width: 180,
            },
          },
        }}
      >
        <TableHead>
          <TableRow>
            <TableCell colSpan={3}>
              <Stack alignItems="center" direction="row" spacing={0.8}>
                <Typography
                  sx={({ palette }) => ({
                    color: palette.gray[90],
                    fontWeight: 600,
                  })}
                >
                  Permitted Access
                </Typography>
                <Typography
                  sx={({ palette }) => ({
                    color: palette.gray[70],
                    fontWeight: 600,
                  })}
                >
                  grouped by
                </Typography>
                <SelectGrouping
                  selectedGrouping={displayGroupedBy}
                  setSelectedGrouping={(newGrouping) => {
                    setInferenceConfig({
                      ...inferenceConfig,
                      displayGroupedBy: newGrouping,
                    });
                  }}
                />
              </Stack>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>
              <Typography sx={{ fontWeight: 600 }}>
                {displayGroupedBy === "type" ? "Target" : "Location"}
              </Typography>
            </TableCell>
            <TableCell colSpan={2}>
              <Typography sx={{ fontWeight: 600 }}>
                {displayGroupedBy === "type" ? "Location" : "Target"}
              </Typography>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {displayGroupedBy === "type" ? (
            <RowsByType {...rowsComponentProps} />
          ) : (
            <RowsByLocation {...rowsComponentProps} />
          )}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3}>
              <AddTypeButton
                disabled={!!draftRule}
                onClick={() => setDraftRule({ restrictToDomains: [] })}
                label="ADD ANOTHER"
              />
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </Box>
  );
};

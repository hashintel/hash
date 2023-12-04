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
import { useState } from "react";

import { LocalStorage } from "../../../../../shared/storage";
import { borderColors } from "../../../../shared/style-values";
import { EntityTypeSelector } from "../one-off/infer-entities-action/entity-type-selector";
import { CircleExclamationIcon } from "./select-scope/circle-exclamation-icon";
import { SelectDomains } from "./select-scope/select-domains";

const AddTypeButton = ({
  label,
  onClick,
}: {
  label: string;
  onClick: ButtonProps["onClick"];
}) => (
  <Button
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
  const { rules } = inferenceConfig;

  const anyTypesSelected = rules.length > 0;

  const [showTable, setShowTable] = useState(anyTypesSelected);
  const [showAddType, setShowAddType] = useState(!anyTypesSelected);

  const allDomainsUsed = rules.flatMap(
    ({ restrictToDomains }) => restrictToDomains || [],
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
            borderRadius: 1,
            borderStyle: "solid",
            borderWidth: 1,
            ...borderColors,
            px: 2,
            py: 1.5,
          })}
        >
          <AddTypeButton
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
          },
          "th, td": {
            px: 1.5,
            py: 1,
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
            <TableCell>
              <Typography
                sx={{
                  color: ({ palette }) => palette.gray[90],
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Types to find
              </Typography>
            </TableCell>
            <TableCell>
              <Typography
                sx={{
                  color: ({ palette }) => palette.gray[90],
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Look for this type on...
              </Typography>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {[
            ...rules,
            ...(showAddType
              ? [{ entityTypeId: null, restrictToDomains: [] }]
              : []),
          ].map(({ entityTypeId, restrictToDomains }) => {
            return (
              <TableRow key={entityTypeId ?? "new-type"}>
                <TableCell>
                  <EntityTypeSelector
                    multiple={false}
                    setTargetEntityTypeIds={(newTargetIds) =>
                      setInferenceConfig({
                        ...inferenceConfig,
                        rules: rules.map((rule) =>
                          rule.entityTypeId === entityTypeId
                            ? { ...rule, entityTypeId: newTargetIds[0] }
                            : rule,
                        ),
                      })
                    }
                    targetEntityTypeIds={entityTypeId ? [entityTypeId] : []}
                  />
                </TableCell>
                <TableCell>
                  <SelectDomains
                    options={allDomainsUsed}
                    selectedDomains={restrictToDomains}
                    setSelectedDomains={(domains) =>
                      setInferenceConfig({
                        ...inferenceConfig,
                        rules: entityTypeId
                          ? [{ entityTypeId, restrictToDomains: domains }]
                          : rules,
                      })
                    }
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2}>
              <AddTypeButton
                onClick={() => setShowAddType(true)}
                label="ADD ANOTHER"
              />
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </Box>
  );
};

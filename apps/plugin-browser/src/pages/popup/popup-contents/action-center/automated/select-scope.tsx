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

import { borderColors } from "../../../../shared/style-values";
import { useEntityTypes } from "../../../../shared/use-entity-types";
import { useLocalStorage } from "../../../../shared/use-storage-sync";
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
    sx={{ fontSize: 12, mr: 2, px: 1.2, py: 1 }}
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
        fontSize: 16,
        mr: 0.8,
      }}
    />
    <Typography
      sx={{
        color: ({ palette }) => palette.error.main,
        fontWeight: 600,
      }}
    >
      No types yet selected
    </Typography>
  </Stack>
);

export const SelectScope = () => {
  const [inferenceConfig, setInferenceConfig] = useLocalStorage(
    "automaticInference",
    { createAs: "draft", enabled: false, rules: [] },
  );

  const entityTypes = useEntityTypes();

  const { rules } = inferenceConfig;

  const anyTypesSelected = rules.length > 0;

  const [showTable, setShowTable] = useState(anyTypesSelected);

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
        }}
      >
        <TableHead>
          <TableRow>
            <TableCell>
              <Typography
                sx={{
                  color: ({ palette }) => palette.gray[50],
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Types to find
              </Typography>
            </TableCell>
            <TableCell>
              <Typography
                sx={{
                  color: ({ palette }) => palette.gray[50],
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Create as
              </Typography>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rules.map(({ entityTypeId, restrictToDomains }) => {
            const entityType = entityTypes.find(
              (type) => type.schema.$id === entityTypeId,
            );

            if (!entityType) {
              throw new Error("Could not find entity type in options");
            }

            return (
              <TableRow key={entityTypeId}>
                <TableCell>
                  <Typography
                    sx={{
                      fontSize: 14,
                      fontWeight: 500,
                    }}
                  >
                    {entityType.schema.title}
                  </Typography>
                </TableCell>
                <TableCell>
                  <SelectDomains
                    options={allDomainsUsed}
                    selectedDomains={restrictToDomains}
                    setSelectedDomains={(domains) =>
                      setInferenceConfig({
                        ...inferenceConfig,
                        rules: [{ entityTypeId, restrictToDomains: domains }],
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
                onClick={() => setShowTable(true)}
                label="ADD ANOTHER"
              />
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </Box>
  );
};

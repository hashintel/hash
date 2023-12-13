import { VersionedUrl } from "@blockprotocol/graph";
import {
  Button,
  ButtonProps,
  CloseIcon,
  IconButton,
  PlusIcon,
} from "@hashintel/design-system";
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
import { useCallback, useMemo, useState } from "react";

import { LocalStorage } from "../../../../../shared/storage";
import {
  borderColors,
  darkModeBorderColor,
  darkModeInputBackgroundColor,
  darkModeInputColor,
  lightModeBorderColor,
} from "../../../../shared/style-values";
import { EntityTypeSelector } from "../shared/entity-type-selector";
import { CircleExclamationIcon } from "./select-scope/circle-exclamation-icon";
import { SelectDomains } from "./select-scope/select-domains";

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
  const { rules } = inferenceConfig;

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

  const updateOrAddRule = useCallback(
    ({
      targetEntityTypeId,
      previousEntityTypeId,
      restrictToDomains = [],
    }: {
      targetEntityTypeId?: VersionedUrl;
      previousEntityTypeId?: VersionedUrl;
      restrictToDomains: string[];
    }) => {
      const rulesByType = rules.reduce<
        Record<
          VersionedUrl,
          LocalStorage["automaticInferenceConfig"]["rules"][0]
        >
      >(
        (acc, rule) => ({
          ...acc,
          [rule.entityTypeId]: rule,
        }),
        {},
      );

      if (!previousEntityTypeId && !targetEntityTypeId) {
        // This is a draft rule – we don't have a type set yet so can't take it out of draft, just update the domains
        setDraftRule({
          restrictToDomains,
        });
        return;
      }

      if (
        targetEntityTypeId &&
        previousEntityTypeId &&
        targetEntityTypeId !== previousEntityTypeId
      ) {
        delete rulesByType[previousEntityTypeId];
      }

      if (!targetEntityTypeId) {
        throw new Error("Cannot update a rule without a target entity type");
      }

      /**
       * If we're switching the type for the rule, check for an existing rule for that type and merge them
       */
      const duplicateRuleForType =
        targetEntityTypeId !== previousEntityTypeId
          ? rulesByType[targetEntityTypeId]
          : undefined;

      rulesByType[targetEntityTypeId] = {
        entityTypeId: targetEntityTypeId,
        restrictToDomains: Array.from(
          new Set([
            ...restrictToDomains,
            ...(duplicateRuleForType?.restrictToDomains ?? []),
          ]),
        ),
      };

      setInferenceConfig({
        ...inferenceConfig,
        rules: Object.values(rulesByType),
      });
    },
    [inferenceConfig, setInferenceConfig, rules],
  );

  const removeRule = ({
    targetEntityTypeId,
  }: {
    targetEntityTypeId: VersionedUrl;
  }) => {
    const rulesByType = rules.reduce<
      Record<VersionedUrl, LocalStorage["automaticInferenceConfig"]["rules"][0]>
    >((acc, rule) => {
      if (rule.entityTypeId !== targetEntityTypeId) {
        acc[rule.entityTypeId] = rule;
      }
      return acc;
    }, {});

    setInferenceConfig({
      ...inferenceConfig,
      rules: Object.values(rulesByType),
    });
  };

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
            "@media (prefers-color-scheme: dark)": {
              background: darkModeInputBackgroundColor,
              color: darkModeInputColor,
            },
          },
          "th, td": {
            px: 1,
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
            <TableCell>
              <Typography>Type</Typography>
            </TableCell>
            <TableCell colSpan={2}>
              <Typography>Where</Typography>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {[...rules, ...(draftRule ? [draftRule] : [])].map(
            ({ entityTypeId, restrictToDomains }) => {
              return (
                <TableRow key={entityTypeId ?? "draft-rule"}>
                  <TableCell>
                    <EntityTypeSelector
                      inputHeight={44}
                      multiple={false}
                      setTargetEntityTypeIds={(newTargetIds) => {
                        const targetEntityTypeId = newTargetIds[0];
                        updateOrAddRule({
                          targetEntityTypeId,
                          previousEntityTypeId: entityTypeId,
                          restrictToDomains,
                        });

                        // If this was the draft rule (no entityTypeId), we can reset the draft state now
                        if (!entityTypeId) {
                          setDraftRule(null);
                        }
                      }}
                      targetEntityTypeIds={entityTypeId ? [entityTypeId] : []}
                    />
                  </TableCell>
                  <TableCell>
                    <SelectDomains
                      options={uniqueDomainsUsed}
                      selectedDomains={restrictToDomains}
                      setSelectedDomains={(newDomains) => {
                        updateOrAddRule({
                          previousEntityTypeId: entityTypeId,
                          targetEntityTypeId: entityTypeId,
                          restrictToDomains: newDomains,
                        });
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ width: 20, p: `4px !important` }}>
                    {entityTypeId && (
                      <IconButton
                        onClick={() =>
                          removeRule({ targetEntityTypeId: entityTypeId })
                        }
                        size="small"
                      >
                        <CloseIcon />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              );
            },
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

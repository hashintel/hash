import { VersionedUrl } from "@blockprotocol/graph";
import { CloseIcon, IconButton } from "@hashintel/design-system";
import { TableCell, TableRow } from "@mui/material";
import { useCallback } from "react";

import { LocalStorage } from "../../../../../../shared/storage";
import { EntityTypeSelector } from "../../shared/entity-type-selector";
import { SelectDomains } from "./select-domains";
import { RowProps } from "./shared/row-props";

export const RowByType = (props: RowProps) => {
  const {
    domainOptions,
    setDraftRule,
    rule,
    inferenceConfig,
    setInferenceConfig,
  } = props;

  const { rules } = inferenceConfig;

  const { entityTypeId, restrictToDomains: ruleDomains } = rule;

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
        (acc, existingRule) => ({
          ...acc,
          [existingRule.entityTypeId]: existingRule,
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
    [inferenceConfig, setInferenceConfig, setDraftRule, rules],
  );

  const removeRule = ({
    targetEntityTypeId,
  }: {
    targetEntityTypeId: VersionedUrl;
  }) => {
    const rulesByType = rules.reduce<
      Record<VersionedUrl, LocalStorage["automaticInferenceConfig"]["rules"][0]>
    >((acc, existingRule) => {
      if (existingRule.entityTypeId !== targetEntityTypeId) {
        acc[existingRule.entityTypeId] = existingRule;
      }
      return acc;
    }, {});

    setInferenceConfig({
      ...inferenceConfig,
      rules: Object.values(rulesByType),
    });
  };

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
              restrictToDomains: ruleDomains,
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
          options={domainOptions}
          selectedDomains={ruleDomains}
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
            onClick={() => removeRule({ targetEntityTypeId: entityTypeId })}
            size="small"
          >
            <CloseIcon />
          </IconButton>
        )}
      </TableCell>
    </TableRow>
  );
};

import { VersionedUrl } from "@blockprotocol/graph";
import { CloseIcon, IconButton } from "@hashintel/design-system";
import { TableCell, TableRow } from "@mui/material";
import { useCallback } from "react";

import { LocalStorage } from "../../../../../../shared/storage";
import { EntityTypeSelector } from "../../shared/entity-type-selector";
import { SelectDomains } from "./select-domains";
import { CommonRowsProps } from "./shared/common-rows-props";

type RuleByType = {
  entityTypeId?: VersionedUrl;
  restrictToDomains: string[];
};

const RowByType = (
  props: Omit<CommonRowsProps, "draftRule"> & { rule: RuleByType },
) => {
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
      newEntityTypeId,
      restrictToDomains = [],
    }: {
      newEntityTypeId?: VersionedUrl;
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

      if (!entityTypeId && !newEntityTypeId) {
        // This is a draft rule – we don't have a type set yet so can't take it out of draft, just update the domains
        setDraftRule({
          restrictToDomains,
        });
        return;
      }

      if (newEntityTypeId && entityTypeId && newEntityTypeId !== entityTypeId) {
        delete rulesByType[entityTypeId];
      }

      if (!newEntityTypeId) {
        throw new Error("Cannot update a rule without a target entity type");
      }

      /**
       * If we're switching the type for the rule, check for an existing rule for that type and merge them
       */
      const duplicateRuleForType =
        newEntityTypeId !== entityTypeId
          ? rulesByType[newEntityTypeId]
          : undefined;

      rulesByType[newEntityTypeId] = {
        entityTypeId: newEntityTypeId,
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
    [entityTypeId, inferenceConfig, setInferenceConfig, setDraftRule, rules],
  );

  const removeRule = () => {
    const rulesByType = rules.reduce<
      Record<VersionedUrl, LocalStorage["automaticInferenceConfig"]["rules"][0]>
    >((acc, existingRule) => {
      if (existingRule.entityTypeId !== entityTypeId) {
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
    <TableRow>
      <TableCell>
        <EntityTypeSelector
          inputHeight={44}
          multiple={false}
          setTargetEntityTypeIds={(newTargetIds) => {
            const newEntityTypeId = newTargetIds[0];
            updateOrAddRule({
              newEntityTypeId,
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
          multiple
          options={domainOptions}
          selectedDomains={ruleDomains}
          setSelectedDomains={(newDomains) => {
            updateOrAddRule({
              newEntityTypeId: entityTypeId,
              restrictToDomains: newDomains,
            });
          }}
        />
      </TableCell>
      <TableCell sx={{ width: 20, p: `4px !important` }}>
        {entityTypeId && (
          <IconButton onClick={() => removeRule()} size="small">
            <CloseIcon />
          </IconButton>
        )}
      </TableCell>
    </TableRow>
  );
};

export const RowsByType = (props: CommonRowsProps) => {
  const {
    domainOptions,
    draftRule,
    setDraftRule,
    inferenceConfig,
    setInferenceConfig,
  } = props;

  const { rules } = inferenceConfig;

  return (
    <>
      {[...rules, ...(draftRule ? [draftRule] : [])]
        .sort((a, b) => {
          // Keep the draft at the bottom
          if (!a.entityTypeId) {
            return 1;
          }
          if (!b.entityTypeId) {
            return -1;
          }

          return a.entityTypeId > b.entityTypeId ? 1 : -1;
        })
        .map((rule) => (
          <RowByType
            domainOptions={domainOptions}
            key={rule.entityTypeId ?? "draft-rule"}
            inferenceConfig={inferenceConfig}
            setInferenceConfig={setInferenceConfig}
            rule={rule}
            setDraftRule={setDraftRule}
          />
        ))}
    </>
  );
};

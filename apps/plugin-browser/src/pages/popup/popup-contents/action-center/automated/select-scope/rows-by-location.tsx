import { VersionedUrl } from "@blockprotocol/graph";
import { CloseIcon, IconButton } from "@hashintel/design-system";
import { TableCell, TableRow } from "@mui/material";
import { useCallback, useMemo } from "react";

import { LocalStorage } from "../../../../../../shared/storage";
import { EntityTypeSelector } from "../../shared/entity-type-selector";
import { SelectDomains } from "./select-domains";
import { CommonRowsProps } from "./shared/common-rows-props";

type RuleByLocation = {
  entityTypeIds: VersionedUrl[];
  restrictToDomain?: string;
};

const RowByLocation = (
  props: Omit<CommonRowsProps, "draftRule"> & { rule: RuleByLocation },
) => {
  const {
    domainOptions,
    setDraftRule,
    rule,
    inferenceConfig,
    setInferenceConfig,
  } = props;

  const { rules } = inferenceConfig;

  const { restrictToDomain, entityTypeIds } = rule;

  const updateDomain = useCallback(
    (newDomain: string) => {
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

      if (entityTypeIds.length === 0) {
        // This is a draft rule that must remain draft, as there's no entityTypeId set
        const ruleForDomain = rules.find((rle) =>
          rle.restrictToDomains.includes(newDomain),
        );
        if (ruleForDomain) {
          // We've already got a rule including this domain, so we can just remove the draft rule
          setDraftRule(null);
        } else {
          // Update the domain
          setDraftRule({
            restrictToDomains: newDomain ? [newDomain] : [],
          });
        }
        return;
      }

      for (const existingRule of rules) {
        if (!entityTypeIds.includes(existingRule.entityTypeId)) {
          // This rule relates to an entityTypeId that this domain isn't applied to
          rulesByType[existingRule.entityTypeId] = existingRule;
          continue;
        }

        if (!restrictToDomain && existingRule.restrictToDomains.length === 0) {
          // We've changed the domain from 'anywhere' to 'somewhere': add 'somewhere' to the rules that had anywhere
          rulesByType[existingRule.entityTypeId] = {
            ...existingRule,
            restrictToDomains: [newDomain],
          };
          continue;
        }

        if (!newDomain) {
          // We've changed the domain from 'somewhere' to 'anywhere' – remove domains from the rule
          rulesByType[existingRule.entityTypeId] = {
            ...existingRule,
            restrictToDomains: [],
          };
          continue;
        }

        // We've changed the domain from 'somewhere' to 'somewhere else'
        const newDomains = existingRule.restrictToDomains.filter(
          (domain) => domain !== restrictToDomain,
        );
        newDomains.push(newDomain);
        rulesByType[existingRule.entityTypeId] = {
          ...existingRule,
          restrictToDomains: newDomains,
        };
      }
      setInferenceConfig({
        ...inferenceConfig,
        rules: Object.values(rulesByType),
      });
    },
    [
      entityTypeIds,
      restrictToDomain,
      inferenceConfig,
      setInferenceConfig,
      setDraftRule,
      rules,
    ],
  );

  const updateEntityTypeIds = useCallback(
    (newEntityTypeIds: VersionedUrl[]) => {
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

      for (const existingRule of rules) {
        if (
          !newEntityTypeIds.includes(existingRule.entityTypeId) &&
          !entityTypeIds.includes(existingRule.entityTypeId)
        ) {
          // This rule relates to an entityTypeId that wasn't and isn't affected by this change
          rulesByType[existingRule.entityTypeId] = existingRule;
          continue;
        }

        if (
          newEntityTypeIds.includes(existingRule.entityTypeId) &&
          !entityTypeIds.includes(existingRule.entityTypeId)
        ) {
          // The domain has been applied to this rule
          const newDomains = restrictToDomain
            ? [...existingRule.restrictToDomains, restrictToDomain]
            : // If we've added a type to the 'anywhere' rule, we wipe its previous domains
              [];

          rulesByType[existingRule.entityTypeId] = {
            ...existingRule,
            restrictToDomains: newDomains,
          };
          continue;
        }

        if (
          !newEntityTypeIds.includes(existingRule.entityTypeId) &&
          entityTypeIds.includes(existingRule.entityTypeId)
        ) {
          if (!restrictToDomain) {
            // We removed the type from the 'anywhere' domain, and therefore the type is no longer being sought
            delete rulesByType[existingRule.entityTypeId];
            continue;
          }

          // The domain has been removed from this rule
          const newDomains = existingRule.restrictToDomains.filter(
            (domain) => domain !== restrictToDomain,
          );
          rulesByType[existingRule.entityTypeId] = {
            ...existingRule,
            restrictToDomains: newDomains,
          };
        }
      }

      for (const newTypeId of newEntityTypeIds) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (rulesByType[newTypeId]) {
          continue;
        }

        // We're adding a new rule
        rulesByType[newTypeId] = {
          entityTypeId: newTypeId,
          restrictToDomains: restrictToDomain ? [restrictToDomain] : [],
        };
      }

      setInferenceConfig({
        ...inferenceConfig,
        rules: Object.values(rulesByType),
      });

      if (entityTypeIds.length === 0) {
        // This was previously the draft rule, we can set it to null now
        setDraftRule(null);
      }
    },
    [
      entityTypeIds,
      restrictToDomain,
      inferenceConfig,
      setInferenceConfig,
      rules,
      setDraftRule,
    ],
  );

  const removeRule = () => {
    const rulesByType = rules.reduce<
      Record<VersionedUrl, LocalStorage["automaticInferenceConfig"]["rules"][0]>
    >((acc, existingRule) => {
      if (entityTypeIds.includes(existingRule.entityTypeId)) {
        if (!restrictToDomain) {
          // This type had 'anywhere' as a destination, and should be removed entirely now;
          return acc;
        }

        const newDomains = existingRule.restrictToDomains.filter(
          (domain) => domain !== restrictToDomain,
        );
        acc[existingRule.entityTypeId] = {
          ...existingRule,
          restrictToDomains: newDomains,
        };
      } else {
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
        <SelectDomains
          multiple={false}
          options={domainOptions}
          selectedDomains={restrictToDomain ? [restrictToDomain] : []}
          setSelectedDomains={(newDomains) => {
            updateDomain(newDomains[0]);
          }}
        />
      </TableCell>
      <TableCell>
        <EntityTypeSelector
          inputHeight="auto"
          multiple
          setTargetEntityTypeIds={(newTargetIds) => {
            updateEntityTypeIds(newTargetIds);
          }}
          targetEntityTypeIds={entityTypeIds}
        />
      </TableCell>
      <TableCell sx={{ width: 20, p: `4px !important` }}>
        {entityTypeIds.length > 0 && (
          <IconButton onClick={() => removeRule()} size="small">
            <CloseIcon />
          </IconButton>
        )}
      </TableCell>
    </TableRow>
  );
};

export const RowsByLocation = (props: CommonRowsProps) => {
  const {
    domainOptions,
    draftRule,
    setDraftRule,
    inferenceConfig,
    setInferenceConfig,
  } = props;

  const { rules } = inferenceConfig;

  const rulesByLocation = useMemo<RuleByLocation[]>(() => {
    const sortedRules: RuleByLocation[] = [];

    for (const rule of rules) {
      for (const domain of rule.restrictToDomains.length > 0
        ? rule.restrictToDomains
        : [""]) {
        const existingRule = sortedRules.find(
          (rle) => rle.restrictToDomain === domain,
        );
        if (existingRule) {
          existingRule.entityTypeIds.push(rule.entityTypeId);
          existingRule.entityTypeIds.sort();
        } else {
          sortedRules.push({
            entityTypeIds: [rule.entityTypeId],
            restrictToDomain: domain,
          });
        }
      }
    }

    if (draftRule) {
      sortedRules.push({
        entityTypeIds: [],
        restrictToDomain: draftRule.restrictToDomains[0] ?? "",
      });
    }

    sortedRules.sort((a, b) => {
      // Keep the draft at the bottom
      if (a.entityTypeIds.length === 0) {
        return 1;
      }
      if (b.entityTypeIds.length === 0) {
        return -1;
      }

      return (a.restrictToDomain ?? "") > (b.restrictToDomain ?? "") ? 1 : -1;
    });

    return sortedRules;
  }, [draftRule, rules]);

  return (
    <>
      {rulesByLocation.map((rule) => (
        <RowByLocation
          domainOptions={domainOptions}
          key={
            rule.restrictToDomain
              ? rule.restrictToDomain
              : rule.entityTypeIds.length
                ? "anywhere-saved-rule"
                : "draft-rule-no-domain"
          }
          inferenceConfig={inferenceConfig}
          setInferenceConfig={setInferenceConfig}
          rule={rule}
          setDraftRule={setDraftRule}
        />
      ))}
    </>
  );
};

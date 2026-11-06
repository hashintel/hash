import { Box } from "@mui/material";

import { Button, Menu } from "@hashintel/ds-components";

import { ConstraintRow } from "./constraints-field/constraint-row";
import {
  clearConstraintValue,
  constraintKindLabels,
  constraintKindsByPrimitive,
  constraintValueEquals,
  formatConstraintValue,
  kindHasValue,
  summarizeTypeTitles,
  visibleConstraintKinds,
} from "./shared/constraint-config";

import type {
  ConstraintKind,
  ConstraintPrimitive,
  ConstraintValues,
  InheritedConstraints,
} from "./shared/constraint-config";

export type ConstraintsState = {
  /** The kinds the edited type sets itself, shown even while still empty */
  activeKinds: ConstraintKind[];
  values: ConstraintValues;
};

type ConstraintsFieldProps = {
  primitive: ConstraintPrimitive;
  inherited: InheritedConstraints;
  state: ConstraintsState;
  onChange: (state: ConstraintsState) => void;
  readonly?: boolean;
};

/**
 * The "Add constraint" dropdown of the kinds the primitive still allows —
 * rendered inside the card, and standalone under the Type card while no
 * constraint is set or inherited. Renders nothing once every kind is in use.
 */
export const AddConstraintMenu = ({
  primitive,
  inherited,
  state,
  onChange,
  readonly,
}: ConstraintsFieldProps) => {
  const availableKinds = constraintKindsByPrimitive[primitive];
  const { activeKinds } = state;

  if (readonly) {
    return null;
  }

  const visibleKinds = visibleConstraintKinds({
    primitive,
    activeKinds,
    inheritedValues: inherited.values,
  });

  // A type's own permitted-values set replaces its other own constraints, so
  // the two stay mutually exclusive in the menu. Kinds left over from a
  // previously-selected primitive don't conflict.
  const relevantActiveKinds = activeKinds.filter((kind) =>
    availableKinds.includes(kind),
  );
  const ownEnumActive = relevantActiveKinds.includes("enum");
  const otherOwnActive = relevantActiveKinds.some((kind) => kind !== "enum");

  const menuItems = availableKinds
    .filter((kind) => !visibleKinds.includes(kind))
    .map((kind) => ({
      text: constraintKindLabels[kind],
      disabled:
        primitive !== "array" &&
        (kind === "enum" ? otherOwnActive : ownEnumActive),
      onClick: () =>
        onChange({ ...state, activeKinds: [...activeKinds, kind] }),
    }));

  if (menuItems.length === 0) {
    return null;
  }

  return (
    <Box>
      <Menu
        items={menuItems}
        trigger={
          <Button variant="subtle" size="sm" iconName="plus">
            Add constraint
          </Button>
        }
      />
    </Box>
  );
};

export const ConstraintsField = ({
  primitive,
  inherited,
  state,
  onChange,
  childTypeTitles,
  readonly,
}: ConstraintsFieldProps & {
  /** Types extending the edited type, which its constraints also bind */
  childTypeTitles: string[];
}) => {
  const { activeKinds, values } = state;

  const childTypesSummary =
    childTypeTitles.length > 0 ? summarizeTypeTitles(childTypeTitles) : null;

  const visibleKinds = visibleConstraintKinds({
    primitive,
    activeKinds,
    inheritedValues: inherited.values,
  });

  const setKindValues = (kind: ConstraintKind, partial: ConstraintValues) => {
    const nextValues = { ...values, ...partial };

    // An override that lands back on the inherited value is no override at
    // all — drop it rather than duplicating the parent's constraint
    if (
      kindHasValue(inherited.values, kind) &&
      constraintValueEquals(kind, nextValues, inherited.values)
    ) {
      onChange({
        activeKinds: activeKinds.filter((active) => active !== kind),
        values: clearConstraintValue(nextValues, kind),
      });
      return;
    }

    onChange({
      activeKinds: activeKinds.includes(kind)
        ? activeKinds
        : [...activeKinds, kind],
      values: nextValues,
    });
  };

  const removeKind = (kind: ConstraintKind) =>
    onChange({
      activeKinds: activeKinds.filter((active) => active !== kind),
      values: clearConstraintValue(values, kind),
    });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75 }}>
      {visibleKinds.map((kind) => {
        const isOwn = activeKinds.includes(kind);
        const source = inherited.sources[kind];

        return (
          <ConstraintRow
            key={kind}
            kind={kind}
            primitive={primitive}
            values={isOwn ? values : inherited.values}
            inheritedFromTitle={source?.title ?? null}
            inheritedValueLabel={
              source ? formatConstraintValue(kind, inherited.values) : null
            }
            overridden={isOwn && !!source}
            childTypesSummary={childTypesSummary}
            readonly={readonly}
            onValuesChange={(partial) => setKindValues(kind, partial)}
            onRemove={isOwn && !readonly ? () => removeKind(kind) : null}
          />
        );
      })}
    </Box>
  );
};

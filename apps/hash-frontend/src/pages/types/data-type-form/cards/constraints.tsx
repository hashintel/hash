import { Box } from "@mui/material";

import { Button, Menu } from "@hashintel/ds-components";

import {
  clearConstraintValue,
  constraintKindLabels,
  constraintKindsByPrimitive,
  constraintValueEquals,
  formatConstraintValue,
  kindHasValue,
  summarizeTypeTitles,
  visibleConstraintKinds,
} from "../constraint-util";
import { ConstraintRow } from "./constraints/constraint-row";
import { DataTypeCard, SectionCard } from "./data-type-card";

import type {
  ConstraintKind,
  ConstraintPrimitive,
  ConstraintValues,
  InheritedConstraints,
} from "../constraint-util";

export type ConstraintsState = {
  /** The kinds the edited type sets itself, shown even while still empty */
  activeKinds: ConstraintKind[];
  values: ConstraintValues;
};

type ConstraintsCardProps = {
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
  trigger,
}: ConstraintsCardProps & {
  /** Replaces the default labelled button as the menu trigger */
  trigger?: React.ReactElement;
}) => {
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
          trigger ?? (
            <Button variant="subtle" size="sm" iconName="plus">
              Add constraint
            </Button>
          )
        }
      />
    </Box>
  );
};

/**
 * The constraint rows without the card frame, label or add-action — for
 * hosts with their own card chrome, like the list-item editors. The full
 * `ConstraintsCard` below wraps these in the standard section card.
 */
export const ConstraintRows = ({
  primitive,
  inherited,
  state,
  onChange,
  childTypeTitles,
  readonly,
}: ConstraintsCardProps & {
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
    // One grid across every row so the labels and values stay aligned
    // whatever the longest label is
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "max-content 1fr",
        gridAutoRows: "minmax(28px, auto)",
        columnGap: 1.5,
        rowGap: 0.625,
        alignItems: "center",
      }}
    >
      {visibleKinds.map((kind) => {
        const isOwn = activeKinds.includes(kind);
        const source = inherited.sources[kind];

        return (
          <ConstraintRow
            key={kind}
            kind={kind}
            primitive={primitive}
            values={isOwn ? values : inherited.values}
            inheritedValues={inherited.values}
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

/**
 * The framed Constraints card: the constraint rows with the add-constraint
 * menu in the card header, and an inheritance note naming the types anything
 * set here also applies to.
 */
export const ConstraintsCard = ({
  childTypeTitles,
  error,
  ...rowProps
}: {
  childTypeTitles: string[];
  error?: string;
} & ConstraintsCardProps) => (
  <SectionCard>
    <Box sx={{ padding: "16px 18px 18px" }}>
      <DataTypeCard
        label="Constraints"
        description={
          childTypeTitles.length > 0
            ? `Types extending this one inherit its constraints, so anything set here also applies to ${summarizeTypeTitles(childTypeTitles)}.`
            : undefined
        }
        errors={error ? [error] : undefined}
        actions={<AddConstraintMenu {...rowProps} />}
      >
        <ConstraintRows childTypeTitles={childTypeTitles} {...rowProps} />
      </DataTypeCard>
    </Box>
  </SectionCard>
);

import { use, useState } from "react";

import {
  Button,
  Icon,
  Menu,
  SegmentedControl,
  Select,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { standInConstraints } from "../../react/controller-prototype/controllers";
import { SDCPNContext } from "../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../react/state/use-is-read-only";
import {
  createMetricKindGroups,
  getMetricKindIcon,
  MODEL_METRIC_VALUE_PREFIX,
} from "../views/Editor/panels/SimulateView/metrics/metric-picker-options";

import type {
  Controller,
  GoalDirection,
} from "../../react/controller-prototype/controllers";
import type { MenuItem } from "@hashintel/ds-components";

const headingStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  color: "neutral.s120",
  marginBottom: "2",
});

const mutedTextStyle = css({ fontSize: "sm", color: "neutral.s100" });

const constraintRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minHeight: "[28px]",
  paddingLeft: "2.5",
  paddingRight: "1",
  marginBottom: "1",
  fontSize: "sm",
  color: "neutral.s120",
  backgroundColor: "neutral.s20",
  borderRadius: "md",
});

const constraintNameStyle = css({ minWidth: "0" });

const removeButtonStyle = css({ marginLeft: "auto" });

const alwaysTagStyle = css({ fontSize: "xs", color: "neutral.s90" });

const addButtonStyle = css({ marginLeft: "0" });

const goalRowStyle = css({ display: "flex", gap: "2", alignItems: "center" });

const goalMetricStyle = css({ flex: "1", minWidth: "0" });

const metricItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
});

// The labels and order experiments use for an objective's direction.
const directionItems: { value: GoalDirection; label: string }[] = [
  { value: "maximise", label: "Maximize" },
  { value: "minimise", label: "Minimize" },
];

type Update = (update: (current: Controller) => Controller) => void;

export const ConstraintsSection: React.FC<{
  controller: Controller;
  update: Update;
}> = ({ controller, update }) => {
  const isReadOnly = useIsReadOnly();
  const chosenIds = controller.constraintIds ?? [];
  const chosen = standInConstraints.filter(({ id }) => chosenIds.includes(id));

  const setChosen = (id: string, on: boolean) =>
    update((current) => ({
      ...current,
      constraintIds: standInConstraints
        .map((constraint) => constraint.id)
        .filter((candidate) =>
          candidate === id
            ? on
            : (current.constraintIds ?? []).includes(candidate),
        ),
    }));

  const menuItems = [
    {
      id: "net-constraints",
      label: "The net's constraints",
      items: standInConstraints.map(
        ({ id, name }): MenuItem => ({
          id,
          text: name,
          selectedStyle: "checkbox",
          keepOpenOnSelect: true,
          suffix: <span className={alwaysTagStyle}>always</span>,
          selected: chosenIds.includes(id),
          onClick: () => setChosen(id, !chosenIds.includes(id)),
        }),
      ),
    },
  ];

  return (
    <div>
      <div className={headingStyle}>Constraints</div>
      {chosen.length === 0 ? (
        <div className={mutedTextStyle}>No constraints</div>
      ) : (
        chosen.map(({ id, name }) => (
          <div key={id} className={constraintRowStyle}>
            <span className={constraintNameStyle}>{name}</span>
            <span className={alwaysTagStyle}>always</span>
            {isReadOnly ? null : (
              <Button
                size="xs"
                variant="ghost"
                iconName="close"
                className={removeButtonStyle}
                aria-label={`Remove ${name}`}
                onClick={() => setChosen(id, false)}
              />
            )}
          </div>
        ))
      )}
      {isReadOnly ? null : (
        <Menu
          items={menuItems}
          position="left-start"
          trigger={
            <Button
              size="xs"
              variant="ghost"
              iconName="plus"
              className={addButtonStyle}
            >
              Add constraint
            </Button>
          }
        />
      )}
    </div>
  );
};

export const GoalSection: React.FC<{
  controller: Controller;
  update: Update;
}> = ({ controller, update }) => {
  const isReadOnly = useIsReadOnly();
  const { petriNetDefinition } = use(SDCPNContext);
  const metrics = petriNetDefinition.metrics ?? [];
  const [pendingDirection, setPendingDirection] =
    useState<GoalDirection>("maximise");
  const direction = controller.goal?.direction ?? pendingDirection;
  // The model-metric group of the experiment metric picker, so a goal and an
  // experiment objective offer the same list.
  const metricGroups = createMetricKindGroups(petriNetDefinition, {
    includeBuiltIn: false,
  }).filter((group) => group.id === "model");

  return (
    <div>
      <div className={headingStyle}>Goal</div>
      {metrics.length === 0 ? (
        <div className={mutedTextStyle}>The net has no metrics</div>
      ) : (
        <div className={goalRowStyle}>
          <Select
            size="sm"
            className={goalMetricStyle}
            aria-label="Goal metric"
            disabled={isReadOnly}
            placeholder="Choose a metric"
            value={
              controller.goal
                ? `${MODEL_METRIC_VALUE_PREFIX}${controller.goal.metricId}`
                : null
            }
            items={metricGroups}
            renderItem={(value) => {
              const icon = getMetricKindIcon(value);
              const text = metricGroups
                .flatMap((group) => group.items)
                .find((item) => item.value === value)?.text;
              return (
                <span className={metricItemStyle}>
                  {icon ? <Icon name={icon} size="xs" /> : null}
                  {text ?? value}
                </span>
              );
            }}
            onChange={(value) => {
              if (value) {
                const metricId = value.slice(MODEL_METRIC_VALUE_PREFIX.length);
                update((current) => ({
                  ...current,
                  goal: { direction, metricId },
                }));
              }
            }}
          />
          <SegmentedControl
            size="xs"
            aria-label="Direction"
            items={directionItems}
            value={direction}
            disabled={isReadOnly}
            onChange={(next) => {
              setPendingDirection(next);
              update((current) =>
                current.goal
                  ? { ...current, goal: { ...current.goal, direction: next } }
                  : current,
              );
            }}
          />
        </div>
      )}
    </div>
  );
};

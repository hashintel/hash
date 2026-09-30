import { use, useState } from "react";

import { Button, Menu, Select } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { standInConstraints } from "../../react/controller-prototype/controllers";
import { SDCPNContext } from "../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../react/state/use-is-read-only";

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

const directionItems = [
  { value: "maximise", text: "Maximise" },
  { value: "minimise", text: "Minimise" },
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

  return (
    <div>
      <div className={headingStyle}>Goal</div>
      {metrics.length === 0 ? (
        <div className={mutedTextStyle}>The net has no metrics</div>
      ) : (
        <div className={goalRowStyle}>
          <Select
            required
            size="sm"
            disabled={isReadOnly}
            value={direction}
            items={directionItems}
            onChange={(value: string) => {
              const next = value as GoalDirection;
              setPendingDirection(next);
              if (controller.goal) {
                update((current) =>
                  current.goal
                    ? { ...current, goal: { ...current.goal, direction: next } }
                    : current,
                );
              }
            }}
          />
          <Select
            size="sm"
            disabled={isReadOnly}
            placeholder="Choose a metric"
            value={controller.goal?.metricId ?? null}
            items={metrics.map((metric) => ({
              value: metric.id,
              text: metric.name,
            }))}
            onChange={(metricId) => {
              if (metricId) {
                update((current) => ({
                  ...current,
                  goal: { direction, metricId },
                }));
              }
            }}
          />
        </div>
      )}
    </div>
  );
};

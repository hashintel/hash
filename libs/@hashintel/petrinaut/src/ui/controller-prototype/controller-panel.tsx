import { createContext, use, useState } from "react";

import { Checkbox, Form, Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import { validateDisplayName } from "@hashintel/petrinaut-core";

import {
  competingTransitionIds,
  leverAnchorKind,
  leverKindLabel,
  leverName,
  rateExpression,
  tokenFieldPlaces,
  toggleInitialTokenField,
  toggleTokenField,
  typedPlace,
} from "../../react/controller-prototype/controllers";
import { useControllers } from "../../react/controller-prototype/use-controllers";
import { SimulationContext } from "../../react/simulation/context";
import { SDCPNContext } from "../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../react/state/use-is-read-only";
import { DraftFieldInput } from "../components/draft-field-input";
import { VerticalSubViewsContainer } from "../components/sub-view/vertical/vertical-sub-views-container";
import {
  PlaceFilledIcon,
  TransitionFilledIcon,
} from "../constants/entity-icons";
import { UI_MESSAGES } from "../constants/ui-messages";
import { ConstraintsSection, GoalSection } from "./constraints-goal";
import { LeverRowIcon } from "./lever-glyph";

import type {
  Controller,
  Lever,
  TokenFieldPlace,
} from "../../react/controller-prototype/controllers";
import type { SubView } from "../components/sub-view/types";
import type { SDCPN } from "@hashintel/petrinaut-core";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  minHeight: "[0]",
});

const sectionStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "4",
  paddingY: "3",
});

const headingStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  color: "neutral.s120",
  marginBottom: "2",
});

const bodyTextStyle = css({
  fontSize: "sm",
  color: "neutral.s100",
});

const kindCardStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "3",
  border: "1px solid",
  borderColor: "neutral.a30",
  borderRadius: "lg",
  marginBottom: "2",
});

const kindLabelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  letterSpacing: "[0.02em]",
  textTransform: "uppercase",
  color: "neutral.s90",
});

const leverHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  width: "[100%]",
  padding: "0",
  border: "none",
  background: "[transparent]",
  cursor: "pointer",
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
  textAlign: "left",
  borderRadius: "sm",
  _focusVisible: {
    outline: "[2px solid {colors.blue.s60}]",
    outlineOffset: "[2px]",
  },
});

const nodeIconStyle = css({
  display: "flex",
  flexShrink: "0",
  color: "[#9ca3af]",
});

const chevronStyle = css({
  display: "flex",
  flexShrink: "0",
  color: "neutral.s110",
  transition: "[transform 150ms ease-out]",
});

const leverBodyStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
  paddingLeft: "5",
  fontSize: "sm",
  color: "neutral.s100",
});

const choiceRowStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.5",
});

const choiceLabelStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  color: "neutral.s120",
});

const staysStochasticStyle = css({
  fontSize: "xs",
  color: "neutral.s100",
  paddingLeft: "[42px]",
});

const mutedStyle = css({ color: "neutral.s100" });

const todayRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flexWrap: "wrap",
});

const codeChipStyle = css({
  fontFamily: "mono",
  fontSize: "xs",
  color: "neutral.s120",
  backgroundColor: "neutral.s20",
  borderRadius: "sm",
  paddingX: "1.5",
  paddingY: "0.5",
});

const missingStyle = css({
  fontSize: "sm",
  color: "red.s100",
});

type NetLike = Pick<SDCPN, "places" | "transitions" | "types">;

const nodeName = (net: NetLike, id: string): string =>
  net.transitions.find((t) => t.id === id)?.name ??
  net.places.find((p) => p.id === id)?.name ??
  "Missing node";

const leverTitle = (net: NetLike, lever: Lever): string => {
  const name = leverName(net, lever) ?? "Missing node";
  if (lever.kind === "choice") {
    const count = competingTransitionIds(net, lever.placeId).length;
    return `${name} · ${count} transition${count === 1 ? "" : "s"}`;
  }
  return name;
};

const ChoiceBody: React.FC<{
  net: NetLike;
  lever: Extract<Lever, { kind: "choice" }>;
  onToggle: (transitionId: string, controlled: boolean) => void;
}> = ({ net, lever, onToggle }) => {
  const isReadOnly = useIsReadOnly();
  const competing = competingTransitionIds(net, lever.placeId);

  return (
    <>
      {competing.map((transitionId) => {
        const controlled = lever.transitionIds.includes(transitionId);
        return (
          <div key={transitionId} className={choiceRowStyle}>
            <Checkbox
              size="sm"
              value={controlled}
              disabled={isReadOnly}
              onChange={(checked) => onToggle(transitionId, checked)}
              label={
                <span
                  className={cx(choiceLabelStyle, !controlled && mutedStyle)}
                >
                  <span className={nodeIconStyle}>
                    <TransitionFilledIcon size={10} />
                  </span>
                  {nodeName(net, transitionId)}
                </span>
              }
            />
            {controlled ? null : (
              <span className={staysStochasticStyle}>Stays stochastic</span>
            )}
          </div>
        );
      })}
    </>
  );
};

const placeDotStyle = css({
  width: "[8px]",
  height: "[8px]",
  borderRadius: "full",
  flexShrink: "0",
});

const fieldNameStyle = css({ fontFamily: "mono", fontSize: "xs" });

const fieldTypeStyle = css({ fontSize: "xs", color: "neutral.s90" });

const fieldLabelStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  color: "neutral.s120",
});

const summaryRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minWidth: "0",
});

const summaryPlaceStyle = css({ flexShrink: "0" });

const summaryChipStyle = css({
  minWidth: "0",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const placeGroupStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
});

const fieldListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
  paddingLeft: "3.5",
});

const PlaceFieldRows: React.FC<{
  place: TokenFieldPlace;
  chosen: string[];
  onToggle: (elementId: string, on: boolean) => void;
  leading?: React.ReactNode;
}> = ({ place, chosen, onToggle, leading }) => {
  const isReadOnly = useIsReadOnly();

  return (
    <div className={placeGroupStyle}>
      <span className={choiceLabelStyle}>
        <span
          className={placeDotStyle}
          style={{ backgroundColor: place.displayColor }}
        />
        {place.placeName}
        <span className={fieldTypeStyle}>{place.typeName}</span>
      </span>
      <div className={fieldListStyle}>
        {leading}
        {place.fields.map((field) => (
          <Checkbox
            key={field.elementId}
            size="sm"
            value={chosen.includes(field.elementId)}
            disabled={isReadOnly}
            onChange={(checked) => onToggle(field.elementId, checked)}
            label={
              <span className={fieldLabelStyle}>
                <span
                  className={cx(
                    fieldNameStyle,
                    !chosen.includes(field.elementId) && mutedStyle
                  )}
                >
                  {field.name}
                </span>
                <span className={fieldTypeStyle}>{field.type}</span>
              </span>
            }
          />
        ))}
      </div>
    </div>
  );
};

const TokenFieldChecklist: React.FC<{
  net: NetLike;
  lever: Extract<Lever, { kind: "tokenField" }>;
  onToggle: (placeId: string, elementId: string, on: boolean) => void;
}> = ({ net, lever, onToggle }) => (
  <>
    {tokenFieldPlaces(net, lever.transitionId).map((place) => (
      <PlaceFieldRows
        key={place.placeId}
        place={place}
        chosen={
          lever.places.find((entry) => entry.placeId === place.placeId)
            ?.elementIds ?? []
        }
        onToggle={(elementId, on) => onToggle(place.placeId, elementId, on)}
      />
    ))}
  </>
);

const LeverBody: React.FC<{
  net: NetLike;
  lever: Lever;
  onToggleChoice: (transitionId: string, controlled: boolean) => void;
  onToggleField: (placeId: string, elementId: string, on: boolean) => void;
  onToggleInitialField: (elementId: string, on: boolean) => void;
  open: boolean;
}> = ({
  net,
  lever,
  onToggleChoice,
  onToggleField,
  onToggleInitialField,
  open,
}) => {
  const { initialMarking, selectedScenarioId } = use(SimulationContext);
  const { petriNetDefinition } = use(SDCPNContext);

  switch (lever.kind) {
    case "choice":
      return <ChoiceBody net={net} lever={lever} onToggle={onToggleChoice} />;

    case "rate": {
      const transition = net.transitions.find(
        (t) => t.id === lever.transitionId
      );
      if (!transition) {
        return null;
      }
      const expression = rateExpression(transition.lambdaCode);
      return (
        <div className={todayRowStyle}>
          {transition.lambdaType === "predicate" ? (
            <span>Replaces the predicate</span>
          ) : expression ? (
            <>
              <span>Replaces</span>
              <code className={codeChipStyle}>{expression}</code>
            </>
          ) : (
            <span>Replaces the Firing Time code</span>
          )}
        </div>
      );
    }

    case "initialTokens": {
      const marking = initialMarking[lever.placeId];
      const count =
        typeof marking === "number"
          ? marking
          : Array.isArray(marking)
          ? marking.length
          : 0;
      const source =
        petriNetDefinition.scenarios?.find(
          (scenario) => scenario.id === selectedScenarioId
        )?.name ?? "now";
      const place = typedPlace(net, lever.placeId);
      const chosen = lever.elementIds ?? [];
      if (place && open) {
        return (
          <PlaceFieldRows
            place={place}
            chosen={chosen}
            onToggle={onToggleInitialField}
            leading={
              <Checkbox
                size="sm"
                value
                disabled
                onChange={() => {}}
                label={
                  <span className={fieldLabelStyle}>
                    <span className={fieldNameStyle}>count</span>
                    <span className={fieldTypeStyle}>
                      {count} in {source}
                    </span>
                  </span>
                }
              />
            }
          />
        );
      }
      const chosenNames = place
        ? place.fields
            .filter((field) => chosen.includes(field.elementId))
            .map((field) => field.name)
        : [];
      return (
        <div className={todayRowStyle}>
          <span>Count</span>
          {place ? (
            chosenNames.length > 0 ? (
              <code className={codeChipStyle}>{chosenNames.join(", ")}</code>
            ) : null
          ) : (
            <span className={mutedStyle}>
              {count} in {source}
            </span>
          )}
        </div>
      );
    }

    case "tokenField": {
      if (open) {
        return (
          <TokenFieldChecklist
            net={net}
            lever={lever}
            onToggle={onToggleField}
          />
        );
      }
      const shown = lever.places.flatMap((entry) => {
        const place = net.places.find((p) => p.id === entry.placeId);
        const type = net.types.find((t) => t.id === place?.colorId);
        const names = entry.elementIds.flatMap(
          (id) => type?.elements.find((e) => e.elementId === id)?.name ?? []
        );
        return place && names.length > 0
          ? [{ placeId: place.id, placeName: place.name, names }]
          : [];
      });
      if (shown.length === 0) {
        return <span className={bodyTextStyle}>No fields</span>;
      }
      return (
        <>
          {shown.map((entry) => (
            <div key={entry.placeId} className={summaryRowStyle}>
              <span className={summaryPlaceStyle}>{entry.placeName}</span>
              <code
                className={cx(codeChipStyle, summaryChipStyle)}
                title={entry.names.join(", ")}
              >
                {entry.names.join(", ")}
              </code>
            </div>
          ))}
        </>
      );
    }
  }
};

const LeverRow: React.FC<{
  net: NetLike;
  lever: Lever;
  defaultOpen: boolean;
  onToggleChoice: (transitionId: string, controlled: boolean) => void;
  onToggleField: (placeId: string, elementId: string, on: boolean) => void;
  onToggleInitialField: (elementId: string, on: boolean) => void;
}> = ({
  net,
  lever,
  defaultOpen,
  onToggleChoice,
  onToggleField,
  onToggleInitialField,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const NodeIcon =
    leverAnchorKind(lever) === "place" ? PlaceFilledIcon : TransitionFilledIcon;
  const missing = leverName(net, lever) === null;
  const expandable =
    lever.kind === "choice" ||
    lever.kind === "tokenField" ||
    (lever.kind === "initialTokens" && typedPlace(net, lever.placeId) !== null);

  return (
    <>
      <button
        type="button"
        className={leverHeaderStyle}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className={nodeIconStyle}>
          <NodeIcon size={10} />
        </span>
        <span className={missing ? missingStyle : undefined}>
          {leverTitle(net, lever)}
        </span>
        {expandable ? (
          <span
            className={chevronStyle}
            style={{ transform: open ? "rotate(90deg)" : undefined }}
          >
            <Icon name="chevronRight" size="xs" />
          </span>
        ) : null}
      </button>
      {!missing && (open || lever.kind !== "choice") ? (
        <div className={leverBodyStyle}>
          <LeverBody
            net={net}
            lever={lever}
            onToggleChoice={onToggleChoice}
            onToggleField={onToggleField}
            onToggleInitialField={onToggleInitialField}
            open={open}
          />
        </div>
      ) : null}
    </>
  );
};

const ControllerMainFields: React.FC<{ controller: Controller }> = ({
  controller,
}) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { updateControllers } = useControllers();
  const isReadOnly = useIsReadOnly();

  const updateThis = (update: (current: Controller) => Controller) =>
    updateControllers((all) =>
      all.map((candidate) =>
        candidate.id === controller.id ? update(candidate) : candidate
      )
    );

  const toggleChoice =
    (leverId: string) => (transitionId: string, controlled: boolean) =>
      updateThis((current) => ({
        ...current,
        levers: current.levers.map((lever) =>
          lever.id === leverId && lever.kind === "choice"
            ? {
                ...lever,
                transitionIds: controlled
                  ? [...lever.transitionIds, transitionId]
                  : lever.transitionIds.filter((id) => id !== transitionId),
              }
            : lever
        ),
      }));

  const toggleField =
    (lever: Lever) => (placeId: string, elementId: string, on: boolean) =>
      lever.kind === "tokenField" &&
      updateThis((current) =>
        toggleTokenField(
          petriNetDefinition,
          current,
          lever.transitionId,
          placeId,
          elementId,
          on,
          () => lever.id
        )
      );

  return (
    <div className={sectionStyle}>
      <Form.Section>
        <DraftFieldInput
          label="Name"
          sourceId={controller.id}
          sourceValue={controller.name}
          validate={validateDisplayName}
          onCommit={(name) => updateThis((current) => ({ ...current, name }))}
          disabled={isReadOnly}
          tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
      </Form.Section>

      <div>
        <div className={headingStyle}>Levers</div>
        {controller.levers.length === 0 ? (
          <div className={bodyTextStyle}>No levers yet.</div>
        ) : (
          controller.levers.map((lever) => (
            <div key={lever.id} className={kindCardStyle}>
              <div className={kindLabelStyle}>{leverKindLabel[lever.kind]}</div>
              <LeverRow
                net={petriNetDefinition}
                lever={lever}
                defaultOpen={lever.kind === "choice"}
                onToggleChoice={toggleChoice(lever.id)}
                onToggleField={toggleField(lever)}
                onToggleInitialField={(elementId, on) =>
                  updateThis((current) =>
                    toggleInitialTokenField(
                      petriNetDefinition,
                      current,
                      lever.id,
                      elementId,
                      on
                    )
                  )
                }
              />
            </div>
          ))
        )}
      </div>

      <ConstraintsSection controller={controller} update={updateThis} />

      <GoalSection controller={controller} update={updateThis} />

      <div>
        <div className={headingStyle}>Fallback</div>
        <div className={bodyTextStyle}>
          When you simulate, the net&apos;s own code runs
        </div>
      </div>
    </div>
  );
};

const ControllerContext = createContext<Controller | null>(null);

const ControllerMainContent: React.FC = () => {
  const controller = use(ControllerContext);
  if (!controller) {
    throw new Error(
      "ControllerMainContent must be used within ControllerProperties"
    );
  }
  return <ControllerMainFields controller={controller} />;
};

export const ControllerProperties: React.FC<{ controllerId: string }> = ({
  controllerId,
}) => {
  const { controllers } = useControllers();
  const controller = controllers.find(
    (candidate) => candidate.id === controllerId
  );
  if (!controller) {
    return null;
  }

  const subViews: SubView[] = [
    {
      id: "controller-main-content",
      title: `Controller ${controller.name}`,
      icon: LeverRowIcon,
      main: true,
      component: ControllerMainContent,
    },
  ];

  return (
    <div className={containerStyle}>
      <ControllerContext value={controller}>
        <VerticalSubViewsContainer
          key={controller.id}
          name="controller-properties"
          subViews={subViews}
        />
      </ControllerContext>
    </div>
  );
};

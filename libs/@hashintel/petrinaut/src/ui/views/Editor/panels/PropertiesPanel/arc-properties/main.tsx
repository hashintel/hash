import { createContext, use } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { Button } from "../../../../../components/button";

const ArcIcon = () => <Icon name="scribble" />;
import { parseArcId, type SDCPN } from "@hashintel/petrinaut-core";

import { EditorContext } from "../../../../../../react/state/editor-context";
import { useIsReadOnly } from "../../../../../../react/state/use-is-read-only";
import { NumberInput } from "../../../../../components/number-input";
import { Section, SectionList } from "../../../../../components/section";
import { Select } from "../../../../../components/select";
import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { UI_MESSAGES } from "../../../../../constants/ui-messages";

import type { PetrinautMutations } from "../../../../../../react";
import type { SubView } from "../../../../../components/sub-view/types";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  minHeight: "[0]",
});

const readOnlyFieldStyle = css({
  fontSize: "sm",
  color: "neutral.s110",
  padding: "1",
});

interface ArcPropertiesData {
  arcId: string;
  transitionId: string;
  placeId: string;
  arcDirection: "input" | "output";
  sourceName: string;
  targetName: string;
  weight: number;
  type: "standard" | "inhibitor";
  updateArcWeight: PetrinautMutations["updateArcWeight"];
  updateArcType: PetrinautMutations["updateArcType"];
  removeArc: PetrinautMutations["removeArc"];
}

const ArcPropertiesContext = createContext<ArcPropertiesData | null>(null);

function useArcPropertiesContext() {
  const ctx = use(ArcPropertiesContext);
  if (!ctx) {
    throw new Error(
      "useArcPropertiesContext must be used within ArcProperties",
    );
  }
  return ctx;
}

const ArcMainContent: React.FC = () => {
  const {
    transitionId,
    placeId,
    arcDirection,
    sourceName,
    targetName,
    weight,
    type,
    updateArcWeight,
    updateArcType,
  } = useArcPropertiesContext();
  const isReadOnly = useIsReadOnly();

  return (
    <SectionList>
      <Section title="Source">
        <div className={readOnlyFieldStyle}>{sourceName}</div>
      </Section>
      <Section title="Target">
        <div className={readOnlyFieldStyle}>{targetName}</div>
      </Section>
      {arcDirection === "input" && (
        <Section title="Type">
          <Select
            value={type}
            onValueChange={(value) => {
              updateArcType({
                transitionId,
                placeId,
                type: value as "inhibitor" | "standard",
              });
            }}
            options={[
              { value: "standard", label: "Standard" },
              { value: "inhibitor", label: "Inhibitor" },
            ]}
            disabled={isReadOnly}
            tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
          />
        </Section>
      )}
      <Section title="Weight">
        <NumberInput
          size="sm"
          min={1}
          step={1}
          value={weight}
          onChange={(event) => {
            const value = Number.parseInt(
              (event.target as HTMLInputElement).value,
              10,
            );
            if (value > 0) {
              updateArcWeight({
                transitionId,
                arcDirection,
                placeId,
                weight: value,
              });
            }
          }}
          disabled={isReadOnly}
        />
      </Section>
    </SectionList>
  );
};

const DeleteArcAction: React.FC = () => {
  const { transitionId, placeId, arcDirection, removeArc } =
    useArcPropertiesContext();
  const { clearSelection } = use(EditorContext);
  const isReadOnly = useIsReadOnly();

  return (
    <Button
      aria-label="Delete"
      size="xs"
      variant="ghost"
      tone="error"
      iconName="trash"
      onClick={() => {
        removeArc({ transitionId, arcDirection, placeId });
        clearSelection();
      }}
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Delete"}
      tooltipDisplay="inline"
    />
  );
};

const arcMainContentSubView: SubView = {
  id: "arc-main-content",
  title: "Arc",
  icon: ArcIcon,
  main: true,
  component: ArcMainContent,
  renderHeaderAction: () => <DeleteArcAction />,
  alwaysShowHeaderAction: true,
};

const subViews: SubView[] = [arcMainContentSubView];

interface ArcPropertiesProps {
  arcId: string;
  petriNetDefinition: SDCPN;
  updateArcWeight: PetrinautMutations["updateArcWeight"];
  updateArcType: PetrinautMutations["updateArcType"];
  removeArc: PetrinautMutations["removeArc"];
}

export const ArcProperties: React.FC<ArcPropertiesProps> = ({
  arcId,
  petriNetDefinition,
  updateArcWeight,
  updateArcType,
  removeArc,
}) => {
  const parsed = parseArcId(arcId);
  if (!parsed) {
    return null;
  }

  const { sourceId, targetId } = parsed;

  const sourcePlace = petriNetDefinition.places.find(
    (pl) => pl.id === sourceId,
  );
  const targetPlace = petriNetDefinition.places.find(
    (pl) => pl.id === targetId,
  );
  const sourceTransition = petriNetDefinition.transitions.find(
    (tr) => tr.id === sourceId,
  );
  const targetTransition = petriNetDefinition.transitions.find(
    (tr) => tr.id === targetId,
  );

  let data: ArcPropertiesData;

  if (sourcePlace && targetTransition) {
    const arc = targetTransition.inputArcs.find(
      (ia) => ia.placeId === sourcePlace.id,
    );
    data = {
      arcId,
      transitionId: targetTransition.id,
      placeId: sourcePlace.id,
      arcDirection: "input",
      sourceName: sourcePlace.name,
      targetName: targetTransition.name,
      weight: arc?.weight ?? 1,
      type: arc?.type ?? "standard",
      updateArcWeight,
      updateArcType,
      removeArc,
    };
  } else if (sourceTransition && targetPlace) {
    const arc = sourceTransition.outputArcs.find(
      (oa) => oa.placeId === targetPlace.id,
    );
    data = {
      arcId,
      transitionId: sourceTransition.id,
      placeId: targetPlace.id,
      arcDirection: "output",
      sourceName: sourceTransition.name,
      targetName: targetPlace.name,
      weight: arc?.weight ?? 1,
      type: "standard",
      updateArcWeight,
      updateArcType,
      removeArc,
    };
  } else {
    return null;
  }

  return (
    <div className={containerStyle}>
      <ArcPropertiesContext value={data}>
        <VerticalSubViewsContainer name="arc-properties" subViews={subViews} />
      </ArcPropertiesContext>
    </div>
  );
};

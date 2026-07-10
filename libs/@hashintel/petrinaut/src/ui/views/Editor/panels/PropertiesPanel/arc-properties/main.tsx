import { createContext, use } from "react";

import {
  Button,
  Icon,
  NumberInput,
  Select,
  Tooltip,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  arcMatchesEndpoint,
  parseArcId,
  parseArcEndpointKey,
  placeArcEndpoint,
  type ArcEndpoint,
  type InputArc,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { EditorContext } from "../../../../../../react/state/editor-context";
import { useIsReadOnly } from "../../../../../../react/state/use-is-read-only";
import { Section, SectionList } from "../../../../../components/section";
import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { UI_MESSAGES } from "../../../../../constants/ui-messages";

import type { PetrinautMutations } from "../../../../../../react";
import type { SubView } from "../../../../../components/sub-view/types";

const ArcIcon = () => <Icon name="scribble" />;

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
  endpoint: ArcEndpoint;
  arcDirection: "input" | "output";
  sourceName: string;
  targetName: string;
  weight: number;
  type: InputArc["type"];
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
    endpoint,
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
          <Tooltip
            content={UI_MESSAGES.READ_ONLY_MODE}
            disableTooltip={!isReadOnly}
          >
            <Select
              required
              value={type}
              size="sm"
              onChange={(nextType: InputArc["type"]) => {
                updateArcType({
                  transitionId,
                  endpoint,
                  type: nextType,
                });
              }}
              items={[
                { value: "standard" as const, text: "Standard" },
                { value: "read" as const, text: "Read" },
                { value: "inhibitor" as const, text: "Inhibitor" },
              ]}
              disabled={isReadOnly}
            />
          </Tooltip>
        </Section>
      )}
      <Section title="Weight">
        <NumberInput
          size="sm"
          min={1}
          value={weight}
          onChange={(nextWeight) => {
            if (nextWeight !== null && nextWeight > 0) {
              updateArcWeight({
                transitionId,
                arcDirection,
                endpoint,
                weight: nextWeight,
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
  const { transitionId, endpoint, arcDirection, removeArc } =
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
        removeArc({ transitionId, arcDirection, endpoint });
        clearSelection();
      }}
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Delete"}
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
  fullSdcpn: SDCPN;
  updateArcWeight: PetrinautMutations["updateArcWeight"];
  updateArcType: PetrinautMutations["updateArcType"];
  removeArc: PetrinautMutations["removeArc"];
}

export const ArcProperties: React.FC<ArcPropertiesProps> = ({
  arcId,
  petriNetDefinition,
  fullSdcpn,
  updateArcWeight,
  updateArcType,
  removeArc,
}) => {
  const parsed = parseArcId(arcId);
  if (!parsed) {
    return null;
  }

  const { sourceId, targetId } = parsed;

  const endpointFromId = (id: string): ArcEndpoint | null => {
    const parsedEndpoint = parseArcEndpointKey(id);
    if (parsedEndpoint) {
      return parsedEndpoint;
    }
    return petriNetDefinition.places.some((place) => place.id === id)
      ? placeArcEndpoint(id)
      : null;
  };

  const endpointName = (endpoint: ArcEndpoint): string => {
    if (endpoint.kind === "place") {
      return (
        petriNetDefinition.places.find((place) => place.id === endpoint.placeId)
          ?.name ?? "Unknown place"
      );
    }

    const instance = (petriNetDefinition.componentInstances ?? []).find(
      ({ id }) => id === endpoint.componentInstanceId,
    );
    const subnet = (fullSdcpn.subnets ?? []).find(
      ({ id }) => id === instance?.subnetId,
    );
    const port = subnet?.places.find(
      (place) => place.id === endpoint.portPlaceId,
    );
    return `${instance?.name ?? "Unknown component"}.${
      port?.name ?? "Unknown port"
    }`;
  };

  const sourceEndpoint = endpointFromId(sourceId);
  const targetEndpoint = endpointFromId(targetId);
  const sourceTransition = petriNetDefinition.transitions.find(
    (tr) => tr.id === sourceId,
  );
  const targetTransition = petriNetDefinition.transitions.find(
    (tr) => tr.id === targetId,
  );

  let data: ArcPropertiesData;

  if (sourceEndpoint && targetTransition) {
    const arc = targetTransition.inputArcs.find((ia) =>
      arcMatchesEndpoint(ia, sourceEndpoint),
    );
    data = {
      arcId,
      transitionId: targetTransition.id,
      endpoint: sourceEndpoint,
      arcDirection: "input",
      sourceName: endpointName(sourceEndpoint),
      targetName: targetTransition.name,
      weight: arc?.weight ?? 1,
      type: arc?.type ?? "standard",
      updateArcWeight,
      updateArcType,
      removeArc,
    };
  } else if (sourceTransition && targetEndpoint) {
    const arc = sourceTransition.outputArcs.find((oa) =>
      arcMatchesEndpoint(oa, targetEndpoint),
    );
    data = {
      arcId,
      transitionId: sourceTransition.id,
      endpoint: targetEndpoint,
      arcDirection: "output",
      sourceName: sourceTransition.name,
      targetName: endpointName(targetEndpoint),
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

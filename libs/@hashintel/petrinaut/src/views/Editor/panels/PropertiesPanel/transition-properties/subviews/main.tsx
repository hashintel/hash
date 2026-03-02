import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";
import { TbTrash } from "react-icons/tb";

import { IconButton } from "../../../../../../components/icon-button";
import { Input } from "../../../../../../components/input";
import { Section, SectionList } from "../../../../../../components/section";
import type { SubView } from "../../../../../../components/sub-view/types";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { SDCPNContext } from "../../../../../../state/sdcpn-context";
import { useTransitionPropertiesContext } from "../context";
import { ArcItem } from "../sortable-arc-item";

const emptyArcMessageStyle = css({
  fontSize: "[12px]",
  color: "[#999]",
});

const arcListContainerStyle = css({
  border: "[1px solid rgba(0, 0, 0, 0.1)]",
  borderRadius: "[6px]",
  overflow: "hidden",
});

const TransitionMainContent: React.FC = () => {
  const {
    transition,
    places,
    isReadOnly,
    updateTransition,
    onArcWeightUpdate,
  } = useTransitionPropertiesContext();

  const handleDeleteInputArc = (placeId: string) => {
    updateTransition(transition.id, (existingTransition) => {
      const index = existingTransition.inputArcs.findIndex(
        (arc) => arc.placeId === placeId,
      );
      if (index !== -1) {
        existingTransition.inputArcs.splice(index, 1);
      }
    });
  };

  const handleDeleteOutputArc = (placeId: string) => {
    updateTransition(transition.id, (existingTransition) => {
      const index = existingTransition.outputArcs.findIndex(
        (arc) => arc.placeId === placeId,
      );
      if (index !== -1) {
        existingTransition.outputArcs.splice(index, 1);
      }
    });
  };

  return (
    <SectionList>
      <Section title="Name">
        <Input
          value={transition.name}
          onChange={(event) => {
            updateTransition(transition.id, (existingTransition) => {
              existingTransition.name = event.target.value;
            });
          }}
          disabled={isReadOnly}
          tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
      </Section>

      <Section title="Input Arcs" collapsible>
        {transition.inputArcs.length === 0 ? (
          <div className={emptyArcMessageStyle}>
            Connect inputs to the transition's left side.
          </div>
        ) : (
          <div className={arcListContainerStyle}>
            {transition.inputArcs.map((arc) => {
              const place = places.find(
                (placeItem) => placeItem.id === arc.placeId,
              );
              return (
                <ArcItem
                  key={arc.placeId}
                  placeName={place?.name ?? arc.placeId}
                  weight={arc.weight}
                  disabled={isReadOnly}
                  tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
                  onWeightChange={(weight) => {
                    onArcWeightUpdate(
                      transition.id,
                      "input",
                      arc.placeId,
                      weight,
                    );
                  }}
                  onDelete={() => handleDeleteInputArc(arc.placeId)}
                />
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Output Arcs" collapsible>
        {transition.outputArcs.length === 0 ? (
          <div className={emptyArcMessageStyle}>
            Connect outputs to the transition's right side.
          </div>
        ) : (
          <div className={arcListContainerStyle}>
            {transition.outputArcs.map((arc) => {
              const place = places.find(
                (placeItem) => placeItem.id === arc.placeId,
              );
              return (
                <ArcItem
                  key={arc.placeId}
                  placeName={place?.name ?? arc.placeId}
                  weight={arc.weight}
                  disabled={isReadOnly}
                  tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
                  onWeightChange={(weight) => {
                    onArcWeightUpdate(
                      transition.id,
                      "output",
                      arc.placeId,
                      weight,
                    );
                  }}
                  onDelete={() => handleDeleteOutputArc(arc.placeId)}
                />
              );
            })}
          </div>
        )}
      </Section>
    </SectionList>
  );
};

const DeleteTransitionAction: React.FC = () => {
  const { transition, isReadOnly } = useTransitionPropertiesContext();
  const { removeTransition } = use(SDCPNContext);

  return (
    <IconButton
      aria-label="Delete"
      variant="danger"
      onClick={() => {
        if (
          // eslint-disable-next-line no-alert
          window.confirm(
            `Are you sure you want to delete "${transition.name}"? All arcs connected to this transition will also be removed.`,
          )
        ) {
          removeTransition(transition.id);
        }
      }}
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Delete"}
    >
      <TbTrash size={16} />
    </IconButton>
  );
};

export const transitionMainContentSubView: SubView = {
  id: "transition-main-content",
  title: "Transition",
  main: true,
  component: TransitionMainContent,
  renderHeaderAction: () => <DeleteTransitionAction />,
};

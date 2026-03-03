/* eslint-disable id-length */
/* eslint-disable curly */
import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";
import { TbDotsVertical, TbSparkles, TbTrash } from "react-icons/tb";

import { IconButton } from "../../../../components/icon-button";
import { Input } from "../../../../components/input";
import { Menu } from "../../../../components/menu";
import { SegmentGroup } from "../../../../components/segment-group";
import { InfoIconTooltip, Tooltip } from "../../../../components/tooltip";
import { UI_MESSAGES } from "../../../../constants/ui-messages";
import {
  generateDefaultLambdaCode,
  generateDefaultTransitionKernelCode,
} from "../../../../core/default-codes";
import type { Color, Place, Transition } from "../../../../core/types/sdcpn";
import { CodeEditor } from "../../../../monaco/code-editor";
import { getDocumentUri } from "../../../../monaco/editor-paths";
import { EditorContext } from "../../../../state/editor-context";
import { SDCPNContext } from "../../../../state/sdcpn-context";
import { useIsReadOnly } from "../../../../state/use-is-read-only";
import { ArcItem } from "./sortable-arc-item";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[12px]",
});

const headerContainerStyle = css({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "[8px]",
});

const headerTitleStyle = css({
  fontWeight: "semibold",
  fontSize: "[16px]",
});

const fieldLabelStyle = css({
  fontWeight: "medium",
  fontSize: "[12px]",
  marginBottom: "[4px]",
});

const sectionContainerStyle = css({
  marginTop: "[20px]",
});

const emptyArcMessageStyle = css({
  fontSize: "[12px]",
  color: "[#999]",
});

const arcListContainerStyle = css({
  border: "[1px solid rgba(0, 0, 0, 0.1)]",
  borderRadius: "[6px]",
  overflow: "hidden",
});

const segmentGroupContainerStyle = css({
  marginTop: "[8px]",
});

const infoBoxStyle = css({
  fontSize: "[12px]",
  color: "[#666]",
  backgroundColor: "[rgba(0, 0, 0, 0.03)]",
  padding: "[8px]",
  borderRadius: "[4px]",
  lineHeight: "[1.5]",
});

const codeHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "[4px]",
  height: "[30px]",
});

const codeHeaderLabelStyle = css({
  fontWeight: "medium",
  fontSize: "[12px]",
});

const menuButtonStyle = css({
  background: "[transparent]",
  border: "none",
  cursor: "pointer",
  padding: "[4px]",
  display: "flex",
  alignItems: "center",
  fontSize: "[18px]",
  color: "[rgba(0, 0, 0, 0.6)]",
});

const aiMenuItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
});

const aiIconStyle = css({
  fontSize: "[16px]",
});

const sectionTitleStyle = css({
  fontWeight: "medium",
  fontSize: "[13px]",
});

const resultsHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "[4px]",
  marginTop: "[20px]",
  height: "[30px]",
});

const noOutputTypesBoxStyle = css({
  backgroundColor: "[rgba(0, 0, 0, 0.03)]",
  border: "[1px solid rgba(0, 0, 0, 0.1)]",
  borderRadius: "[4px]",
  padding: "[12px]",
  fontSize: "[12px]",
  color: "[#666]",
  lineHeight: "[1.5]",
  marginTop: "[20px]",
});

const noOutputTitleStyle = css({
  fontWeight: "medium",
  marginBottom: "[4px]",
});

const spacerStyle = css({
  height: "[40px]",
});

interface TransitionPropertiesProps {
  transition: Transition;
  places: Place[];
  types: Color[];
  updateTransition: (
    id: string,
    updateFn: (existingTransition: Transition) => void,
  ) => void;
  onArcWeightUpdate: (
    transitionId: string,
    arcType: "input" | "output",
    placeId: string,
    weight: number,
  ) => void;
}

export const TransitionProperties: React.FC<TransitionPropertiesProps> = ({
  transition,
  places,
  types,
  updateTransition,
  onArcWeightUpdate,
}) => {
  const isReadOnly = useIsReadOnly();
  const { globalMode } = use(EditorContext);

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

  const hasOutputPlaceWithType = transition.outputArcs.some((arc) => {
    const place = places.find((p) => p.id === arc.placeId);
    return place && place.colorId;
  });

  const { removeTransition } = use(SDCPNContext);

  return (
    <div className={containerStyle}>
      <div>
        <div className={headerContainerStyle}>
          <div className={headerTitleStyle}>Transition</div>
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
        </div>
      </div>

      <div>
        <div className={fieldLabelStyle}>Name</div>
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
      </div>

      <div className={sectionContainerStyle}>
        <div className={fieldLabelStyle}>Input Arcs</div>
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
      </div>

      <div>
        <div className={fieldLabelStyle}>Output Arcs</div>
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
      </div>

      <div className={sectionContainerStyle}>
        <div className={sectionTitleStyle}>
          Firing time
          <InfoIconTooltip tooltip="Define the rate at or conditions under which this will transition will fire, optionally based on each set of input tokens' data (where input tokens have types)." />
        </div>
        <div className={segmentGroupContainerStyle}>
          <SegmentGroup
            value={transition.lambdaType}
            options={[
              { value: "predicate", label: "Predicate" },
              { value: "stochastic", label: "Stochastic Rate" },
            ]}
            onChange={(value) => {
              updateTransition(transition.id, (existingTransition) => {
                existingTransition.lambdaType = value as
                  | "predicate"
                  | "stochastic";
              });
            }}
            disabled={isReadOnly}
            tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
          />
        </div>
      </div>

      <div>
        <div className={infoBoxStyle}>
          {transition.lambdaType === "predicate"
            ? "For a simple predicate firing check, define a boolean guard condition that must be satisfied. The transition will fire when the function returns true, enabling discrete control flow."
            : "For a stochastic firing rate, return a value that represents the average rate per second at which the transition will fire."}
        </div>
      </div>

      <div>
        <div className={codeHeaderStyle}>
          <div className={codeHeaderLabelStyle}>
            {transition.lambdaType === "predicate"
              ? "Predicate Firing Code"
              : "Stochastic Firing Rate Code"}
          </div>
          {globalMode === "edit" && (
            <Menu
              trigger={
                <button type="button" className={menuButtonStyle}>
                  <TbDotsVertical />
                </button>
              }
              items={[
                {
                  id: "load-default",
                  label: "Load default template",
                  onClick: () => {
                    updateTransition(transition.id, (existingTransition) => {
                      existingTransition.lambdaCode = generateDefaultLambdaCode(
                        existingTransition.lambdaType,
                      );
                    });
                  },
                },
                {
                  id: "generate-ai",
                  label: (
                    <Tooltip
                      content={UI_MESSAGES.AI_FEATURE_COMING_SOON}
                      display="inline"
                    >
                      <div className={aiMenuItemStyle}>
                        <TbSparkles className={aiIconStyle} />
                        Generate with AI
                      </div>
                    </Tooltip>
                  ),
                  disabled: true,
                  onClick: () => {
                    // TODO: Implement AI generation
                  },
                },
              ]}
            />
          )}
        </div>
        <CodeEditor
          path={getDocumentUri("transition-lambda", transition.id)}
          key={`lambda-${transition.lambdaType}-${transition.inputArcs
            .map((a) => `${a.placeId}:${a.weight}`)
            .join("-")}`}
          language="typescript"
          value={transition.lambdaCode || ""}
          height={340}
          onChange={(value) => {
            updateTransition(transition.id, (existingTransition) => {
              existingTransition.lambdaCode = value ?? "";
            });
          }}
          options={{ readOnly: isReadOnly }}
          tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
      </div>

      {/* Only show Transition Results if at least one output place has a type */}
      {hasOutputPlaceWithType ? (
        <div>
          <div className={resultsHeaderStyle}>
            <div className={sectionTitleStyle}>
              Transition Results
              <InfoIconTooltip tooltip="This function determines the data for output tokens, optionally based on the input token data and any global parameters defined." />
            </div>
            {globalMode === "edit" && (
              <Menu
                trigger={
                  <button type="button" className={menuButtonStyle}>
                    <TbDotsVertical />
                  </button>
                }
                items={[
                  {
                    id: "load-default",
                    label: "Load default template",
                    onClick: () => {
                      // Build input and output arc information for code generation
                      const inputs = transition.inputArcs
                        .map((arc) => {
                          const place = places.find(
                            (p) => p.id === arc.placeId,
                          );
                          if (!place || !place.colorId) return null;
                          const type = types.find(
                            (t) => t.id === place.colorId,
                          );
                          if (!type) return null;
                          return {
                            placeName: place.name,
                            type,
                            weight: arc.weight,
                          };
                        })
                        .filter((i) => i !== null);

                      const outputs = transition.outputArcs
                        .map((arc) => {
                          const place = places.find(
                            (p) => p.id === arc.placeId,
                          );
                          if (!place || !place.colorId) return null;
                          const type = types.find(
                            (t) => t.id === place.colorId,
                          );
                          if (!type) return null;
                          return {
                            placeName: place.name,
                            type,
                            weight: arc.weight,
                          };
                        })
                        .filter((o) => o !== null);

                      updateTransition(transition.id, (existingTransition) => {
                        existingTransition.transitionKernelCode =
                          generateDefaultTransitionKernelCode(inputs, outputs);
                      });
                    },
                  },
                  {
                    id: "generate-ai",
                    label: (
                      <Tooltip
                        content={UI_MESSAGES.AI_FEATURE_COMING_SOON}
                        display="inline"
                      >
                        <div className={aiMenuItemStyle}>
                          <TbSparkles className={aiIconStyle} />
                          Generate with AI
                        </div>
                      </Tooltip>
                    ),
                    disabled: true,
                    onClick: () => {
                      // TODO: Implement AI generation
                    },
                  },
                ]}
              />
            )}
          </div>
          <CodeEditor
            path={getDocumentUri("transition-kernel", transition.id)}
            language="typescript"
            value={transition.transitionKernelCode || ""}
            height={400}
            onChange={(value) => {
              updateTransition(transition.id, (existingTransition) => {
                existingTransition.transitionKernelCode = value ?? "";
              });
            }}
            options={{ readOnly: isReadOnly }}
            tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
          />
        </div>
      ) : (
        <div className={noOutputTypesBoxStyle}>
          <div className={noOutputTitleStyle}>Transition Results</div>
          <div>
            The Transition Results section is not available because none of the
            output places have a type defined. To enable this feature, assign a
            type to at least one output place.
          </div>
        </div>
      )}

      <div className={spacerStyle} />
    </div>
  );
};

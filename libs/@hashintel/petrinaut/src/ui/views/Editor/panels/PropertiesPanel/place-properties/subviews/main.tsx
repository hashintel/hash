import { use } from "react";

import {
  Button,
  Checkbox,
  Form,
  HelpTooltip,
  NumberInput,
  Select,
  Toggle,
  Tooltip,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { validateEntityName } from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../../react";
import { ActiveNetContext } from "../../../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { DescriptionField } from "../../../../../../components/description-field";
import { DraftFieldInput } from "../../../../../../components/draft-field-input";
import { PropertyValue } from "../../../../../../components/property-value";
import { Section, SectionList } from "../../../../../../components/section";
import { PlaceIcon } from "../../../../../../constants/entity-icons";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { useCodeWorkspace } from "../../../../../../monaco/code-workspace";
import { getDocumentUri } from "../../../../../../monaco/editor-paths";
import { usePlacePropertiesContext } from "../context";

import type { SubView } from "../../../../../../components/sub-view/types";

const fieldsSectionStyle = css({
  paddingY: "3",
});

const relatedActionsStyle = css({
  display: "flex",
  justifyContent: "flex-end",
  flexWrap: "wrap",
  gap: "1",
});

const optionRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
});

const hintTextStyle = css({
  fontSize: "[12px]",
  color: "neutral.s95",
});

const typeColorDotStyle = css({
  width: "3",
  height: "3",
  borderRadius: "full",
  flexShrink: 0,
});

const arcStyle = css({
  display: "flex",
  gap: "2",
  alignItems: "center",
});

/**
 * Main content section for the Place properties panel.
 * Rendered as a headerless SubView at the top of the proportional layout.
 */
const PlaceMainContent: React.FC = () => {
  const codeWorkspace = useCodeWorkspace();
  const { place, types, isReadOnly, updatePlace } = usePlacePropertiesContext();
  const { selectItem } = use(EditorContext);

  const { extensions } = use(SDCPNContext);
  const {
    activeNet: { differentialEquations, types: availableTypes },
  } = use(ActiveNetContext);

  const placeTypeName =
    types.find((candidate) => candidate.id === place.colorId)?.name ?? "None";

  // Filter differential equations by place type
  const availableDiffEqs = place.colorId
    ? differentialEquations.filter((eq) => eq.colorId === place.colorId)
    : [];

  return (
    <SectionList>
      <Form.Section className={fieldsSectionStyle}>
        <DraftFieldInput
          label="Name"
          sourceId={place.id}
          sourceValue={place.name}
          validate={validateEntityName}
          onCommit={(name) =>
            updatePlace({ placeId: place.id, update: { name } })
          }
          disabled={isReadOnly}
          tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
        <DescriptionField
          sourceId={place.id}
          sourceValue={place.description}
          onCommit={(description) =>
            updatePlace({ placeId: place.id, update: { description } })
          }
          disabled={isReadOnly}
          tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
      </Form.Section>

      {extensions.colors && (
        <Section
          title="Accepted token type"
          tooltip={`If tokens in this place should carry data ("colour"), assign a data type here.${
            availableTypes.length === 0
              ? " You must create a data type in the left-hand sidebar first."
              : ""
          } Tokens in places don't have to carry data, but they need one to enable dynamics (token data changing over time when in a place).`}
        >
          <PropertyValue text={placeTypeName}>
            <Tooltip
              content={UI_MESSAGES.READ_ONLY_MODE}
              disableTooltip={!isReadOnly}
            >
              <Select
                aria-label="Accepted token type"
                required
                size="sm"
                value={place.colorId ?? ""}
                onChange={(colorId) => {
                  const nextColorId = colorId === "" ? null : colorId;
                  updatePlace({
                    placeId: place.id,
                    update: {
                      colorId: nextColorId,
                      dynamicsEnabled:
                        nextColorId === null && place.dynamicsEnabled
                          ? false
                          : place.dynamicsEnabled,
                    },
                  });
                }}
                items={[
                  { value: "", text: "None" },
                  ...types.map((type) => ({
                    value: type.id,
                    text: type.name,
                  })),
                ]}
                renderItem={(value) => {
                  const type = types.find((tp) => tp.id === value);
                  return (
                    <div className={arcStyle}>
                      {type?.displayColor && (
                        <div
                          className={typeColorDotStyle}
                          style={{ backgroundColor: type.displayColor }}
                        />
                      )}
                      {type?.name ?? "None"}
                    </div>
                  );
                }}
                disabled={isReadOnly}
              />
            </Tooltip>
          </PropertyValue>

          {place.colorId && (
            <div className={relatedActionsStyle}>
              <Button
                variant="ghost"
                tone="neutral"
                size="xs"
                onClick={() => {
                  if (place.colorId) {
                    selectItem({ type: "type", id: place.colorId });
                  }
                }}
                iconName="arrowRight"
                iconPosition="right"
              >
                View type
              </Button>
            </div>
          )}
        </Section>
      )}

      {extensions.colors && extensions.dynamics && (
        <Section
          title="Dynamics"
          tooltip="Token data can dynamically change over time when tokens remain in a place, governed by a differential equation."
          renderHeaderAction={() => {
            const dynamicsTooltip = isReadOnly
              ? UI_MESSAGES.READ_ONLY_MODE
              : place.colorId === null
                ? UI_MESSAGES.DYNAMICS_REQUIRES_TYPE
                : availableDiffEqs.length === 0
                  ? "Create a differential equation for this type first"
                  : undefined;

            return (
              <Tooltip
                content={dynamicsTooltip}
                disableTooltip={!dynamicsTooltip}
              >
                <Toggle
                  aria-label="Dynamics"
                  size="sm"
                  tone="success"
                  value={!!place.colorId && place.dynamicsEnabled}
                  disabled={
                    isReadOnly ||
                    place.colorId === null ||
                    availableDiffEqs.length === 0
                  }
                  onChange={(checked) => {
                    const update: {
                      dynamicsEnabled: boolean;
                      differentialEquationId?: string | null;
                    } = { dynamicsEnabled: checked };

                    if (checked) {
                      // Auto-select first available diff eq if none selected or previous no longer exists
                      const currentIsValid = availableDiffEqs.some(
                        (eq) => eq.id === place.differentialEquationId,
                      );
                      if (!currentIsValid && availableDiffEqs.length > 0) {
                        update.differentialEquationId = availableDiffEqs[0]!.id;
                      }
                    }

                    updatePlace({
                      placeId: place.id,
                      update,
                    });
                  }}
                />
              </Tooltip>
            );
          }}
        >
          {place.colorId === null ? (
            <div className={hintTextStyle}>
              {availableTypes.length === 0
                ? "Create a type in the left-hand sidebar first, then select it to enable dynamics."
                : "Select a type to enable dynamics"}
            </div>
          ) : availableDiffEqs.length === 0 ? (
            <div className={hintTextStyle}>
              Create a differential equation for the selected type in the
              left-hand sidebar first
            </div>
          ) : (
            place.dynamicsEnabled && (
              <>
                <Tooltip
                  content={UI_MESSAGES.READ_ONLY_MODE}
                  disableTooltip={!isReadOnly}
                >
                  <Select
                    aria-label="Differential equation"
                    required
                    value={place.differentialEquationId ?? ""}
                    size="sm"
                    onChange={(differentialEquationId) => {
                      if (differentialEquationId) {
                        updatePlace({
                          placeId: place.id,
                          update: { differentialEquationId },
                        });
                      }
                    }}
                    items={availableDiffEqs.map((eq) => ({
                      value: eq.id,
                      text: eq.name,
                    }))}
                    disabled={isReadOnly}
                  />
                </Tooltip>

                {place.differentialEquationId && (
                  <div className={relatedActionsStyle}>
                    <Button
                      variant="ghost"
                      tone="neutral"
                      size="xs"
                      onClick={() => {
                        if (place.differentialEquationId) {
                          selectItem({
                            type: "differentialEquation",
                            id: place.differentialEquationId,
                          });
                        }
                      }}
                      iconName="arrowRight"
                      iconPosition="right"
                    >
                      View equation
                    </Button>
                    {codeWorkspace.enabled && (
                      <Button
                        size="xs"
                        variant="ghost"
                        iconName="code"
                        onClick={() => {
                          if (place.differentialEquationId)
                            codeWorkspace.open(
                              getDocumentUri(
                                "differential-equation",
                                place.differentialEquationId,
                              ),
                            );
                        }}
                      >
                        Open equation code
                      </Button>
                    )}
                  </div>
                )}
              </>
            )
          )}
        </Section>
      )}
      <Section title="Options">
        <div className={optionRowStyle}>
          <Checkbox
            size="xs"
            label="Component port"
            value={!!place.isPort}
            disabled={isReadOnly}
            onChange={(checked) =>
              updatePlace({ placeId: place.id, update: { isPort: checked } })
            }
          />
          <HelpTooltip content="Expose this place as an arc endpoint when its subnet is used as a component." />
        </div>
        <div className={optionRowStyle}>
          <Checkbox
            size="xs"
            label="Token capacity"
            value={place.capacity !== undefined && place.capacity !== null}
            disabled={isReadOnly}
            onChange={(checked) =>
              updatePlace({
                placeId: place.id,
                update: { capacity: checked ? 1 : null },
              })
            }
          />
          <HelpTooltip content="Limit how many tokens this place can hold. Transitions that would exceed this limit cannot fire." />
        </div>
        {place.capacity !== undefined && place.capacity !== null && (
          <Form.Field label="Maximum tokens" size="sm" disabled={isReadOnly}>
            <NumberInput
              size="sm"
              min={0}
              max={4294967294}
              value={place.capacity}
              onChange={(nextCapacity) => {
                if (
                  nextCapacity !== null &&
                  nextCapacity >= 0 &&
                  nextCapacity <= 4294967294
                ) {
                  updatePlace({
                    placeId: place.id,
                    update: { capacity: Math.floor(nextCapacity) },
                  });
                }
              }}
              disabled={isReadOnly}
            />
          </Form.Field>
        )}
        <div className={optionRowStyle}>
          <Checkbox
            size="xs"
            label="Default starting place"
            value={!!place.showAsInitialState}
            disabled={isReadOnly}
            onChange={(checked) =>
              updatePlace({
                placeId: place.id,
                update: { showAsInitialState: checked },
              })
            }
          />
          <HelpTooltip content="Pre-select this place when creating a scenario so you can define its initial tokens." />
        </div>
      </Section>
    </SectionList>
  );
};

const DeletePlaceAction: React.FC = () => {
  const { place, isReadOnly } = usePlacePropertiesContext();
  const { removePlace } = usePetrinautMutations();

  return (
    <Button
      aria-label="Delete place"
      size="sm"
      variant="ghost"
      tone="error"
      iconName="trash"
      onClick={() => removePlace({ placeId: place.id })}
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Delete place"}
    />
  );
};

export const placeMainContentSubView: SubView = {
  id: "place-main-content",
  title: "Place",
  icon: PlaceIcon,
  main: true,
  component: PlaceMainContent,
  renderHeaderAction: () => <DeletePlaceAction />,
  headerActionMutates: true,
  alwaysShowHeaderAction: true,
};

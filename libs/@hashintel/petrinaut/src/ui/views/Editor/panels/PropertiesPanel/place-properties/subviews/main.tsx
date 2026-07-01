import { use, useEffect, useRef, useState } from "react";

import {
  Button,
  Checkbox,
  Icon,
  Select,
  TextInput,
  Toggle,
  Tooltip,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { validateEntityName } from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../../react";
import { ActiveNetContext } from "../../../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { Section, SectionList } from "../../../../../../components/section";
import { PlaceIcon } from "../../../../../../constants/entity-icons";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { useDraftField } from "../../../../../../hooks/use-draft-field";
import { usePlacePropertiesContext } from "../context";

import type { SubView } from "../../../../../../components/sub-view/types";

const errorMessageStyle = css({
  fontSize: "xs",
  color: "red.s100",
});

const jumpButtonContainerStyle = css({
  textAlign: "right",
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
  const { place, types, isReadOnly, updatePlace } = usePlacePropertiesContext();
  const { selectItem } = use(EditorContext);

  const { getItemType, extensions } = use(SDCPNContext);
  const {
    activeNet: { differentialEquations, types: availableTypes },
  } = use(ActiveNetContext);

  const nameField = useDraftField({
    sourceId: place.id,
    sourceValue: place.name,
  });
  const [isNameInputFocused, setIsNameInputFocused] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const rootDivRef = useRef<HTMLDivElement>(null);

  // Handle clicks outside when name input is focused
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isNameInputFocused &&
        rootDivRef.current &&
        !rootDivRef.current.contains(event.target as Node)
      ) {
        // Click is outside the root div and input is focused
        event.stopPropagation();
        event.preventDefault();
        event.stopImmediatePropagation();
        nameInputRef.current?.blur();
      }
    };

    if (isNameInputFocused) {
      // Use capture phase to catch the event before it propagates
      document.addEventListener("click", handleClickOutside, true);
      return () => {
        document.removeEventListener("click", handleClickOutside, true);
      };
    }
  }, [isNameInputFocused]);

  const handleNameBlur = () => {
    const result = validateEntityName(nameField.value);

    if (!result.valid) {
      nameField.setError(result.error);
      return;
    }

    nameField.setError(null);
    if (result.name !== place.name) {
      updatePlace({
        placeId: place.id,
        update: { name: result.name },
      });
    }
  };

  // Filter differential equations by place type
  const availableDiffEqs = place.colorId
    ? differentialEquations.filter((eq) => eq.colorId === place.colorId)
    : [];

  return (
    <div ref={rootDivRef}>
      <SectionList>
        <Section title="Name">
          <Tooltip
            content={UI_MESSAGES.READ_ONLY_MODE}
            disableTooltip={!isReadOnly}
          >
            <TextInput
              size="sm"
              inputRef={nameInputRef}
              value={nameField.value}
              onChange={(name) => {
                nameField.setValue(name);
                if (nameField.error) {
                  nameField.setError(null);
                }
              }}
              onFocus={() => setIsNameInputFocused(true)}
              onBlur={() => {
                setIsNameInputFocused(false);
                handleNameBlur();
              }}
              disabled={isReadOnly}
              invalid={!!nameField.error}
            />
          </Tooltip>
          {nameField.error && (
            <div className={errorMessageStyle}>{nameField.error}</div>
          )}
        </Section>

        {extensions.colors && (
          <Section
            title="Accepted token type"
            tooltip={`If tokens in this place should carry data ("colour"), assign a data type here.${
              availableTypes.length === 0
                ? " You must create a data type in the left-hand sidebar first."
                : ""
            } Tokens in places don't have to carry data, but they need one to enable dynamics (token data changing over time when in a place).`}
          >
            <Tooltip
              content={UI_MESSAGES.READ_ONLY_MODE}
              disableTooltip={!isReadOnly}
            >
              <Select
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

            {place.colorId && (
              <div className={jumpButtonContainerStyle}>
                <Button
                  variant="subtle"
                  tone="neutral"
                  size="xs"
                  onClick={() => {
                    if (place.colorId) {
                      const itemType = getItemType(place.colorId);
                      if (itemType) {
                        selectItem({ type: itemType, id: place.colorId });
                      }
                    }
                  }}
                  suffix={<Icon name="arrowRight" />}
                >
                  Jump to Type
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
                          update.differentialEquationId =
                            availableDiffEqs[0]!.id;
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
                    <div className={jumpButtonContainerStyle}>
                      <Button
                        variant="subtle"
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
                        suffix={<Icon name="arrowRight" />}
                      >
                        Jump to Differential Equation
                      </Button>
                    </div>
                  )}
                </>
              )
            )}
          </Section>
        )}
        <Section
          title="Component port"
          tooltip="Exposes this place as an arc endpoint when its subnet is instantiated as a component."
          renderHeaderLeading={() => (
            <Checkbox
              checked={!!place.isPort}
              disabled={isReadOnly}
              onCheckedChange={(checked) => {
                updatePlace({
                  placeId: place.id,
                  update: { isPort: checked === true },
                });
              }}
            />
          )}
        >
          <div className={hintTextStyle}>
            {place.isPort
              ? "Transitions in the parent net can connect arcs to this subnet place through a component instance."
              : "Enable this for subnet boundary places that should be available as component instance arc endpoints."}
          </div>
        </Section>
        <Section
          title="Default starting place"
          tooltip="Pre-selects this place when creating a new scenario."
          renderHeaderLeading={() => (
            <Checkbox
              size="sm"
              value={!!place.showAsInitialState}
              disabled={isReadOnly}
              onChange={(checked) => {
                updatePlace({
                  placeId: place.id,
                  update: { showAsInitialState: checked === true },
                });
              }}
            />
          )}
        >
          <div className={hintTextStyle}>
            {place.showAsInitialState
              ? "This place should have an initial marking defined to run the net, and will be pre-selected in new scenarios."
              : "Enable if this place should have an initial marking defined to run the net. It will be pre-selected in new scenarios."}
          </div>
        </Section>
      </SectionList>
    </div>
  );
};

const DeletePlaceAction: React.FC = () => {
  const { place, isReadOnly } = usePlacePropertiesContext();
  const { removePlace } = usePetrinautMutations();

  return (
    <Button
      aria-label="Delete"
      size="xs"
      variant="ghost"
      tone="error"
      iconName="trash"
      onClick={() => removePlace({ placeId: place.id })}
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Delete"}
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
  alwaysShowHeaderAction: true,
};

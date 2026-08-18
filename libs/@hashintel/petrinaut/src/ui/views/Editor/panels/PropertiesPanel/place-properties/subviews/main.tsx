import { use, useEffect, useRef, useState } from "react";

import {
  Button,
  Checkbox,
  Form,
  HelpTooltip,
  Icon,
  Select,
  TextInput,
  Toggle,
  Tooltip,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import { validateEntityName } from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../../react";
import { ActiveNetContext } from "../../../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { SectionList } from "../../../../../../components/section";
import { PlaceIcon } from "../../../../../../constants/entity-icons";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { useDraftField } from "../../../../../../hooks/use-draft-field";
import { usePlacePropertiesContext } from "../context";

import type { SubView } from "../../../../../../components/sub-view/types";

const fieldsSectionStyle = css({
  paddingY: "3",
});

const jumpButtonContainerStyle = css({
  textAlign: "right",
});

// spacing between a field's input and the jump button below it
const inFieldJumpButtonStyle = css({
  marginTop: "3",
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

// the tooltip sits outside the Checkbox so clicking it doesn't toggle; the
// textStyle sizes its 1em icon like a size="sm" form-field label tooltip
const checkboxRowStyle = css({
  display: "flex",
  alignItems: "center",
  textStyle: "sm",
});

// section-header typography for the checkbox labels
const checkboxTitleStyle = css({
  fontWeight: "semibold",
  fontSize: "sm",
  lineHeight: "[14px]",
  color: "neutral.fg.body",
});

const checkboxHintStyle = css({
  fontSize: "[12px]",
  color: "neutral.s95",
  marginTop: "2",
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

  const dynamicsToggleTooltip = isReadOnly
    ? UI_MESSAGES.READ_ONLY_MODE
    : place.colorId === null
      ? UI_MESSAGES.DYNAMICS_REQUIRES_TYPE
      : availableDiffEqs.length === 0
        ? "Create a differential equation for this type first"
        : undefined;

  const dynamicsHint =
    place.colorId === null
      ? availableTypes.length === 0
        ? "Create a type in the left-hand sidebar first, then select it to enable dynamics."
        : "Select a type to enable dynamics"
      : availableDiffEqs.length === 0
        ? "Create a differential equation for the selected type in the left-hand sidebar first"
        : undefined;

  return (
    <div ref={rootDivRef}>
      <SectionList>
        <Form.Section className={fieldsSectionStyle}>
          <Form.Field
            label="Name"
            size="sm"
            disabled={isReadOnly}
            errors={nameField.error ? [nameField.error] : undefined}
          >
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
          </Form.Field>

          {extensions.colors && (
            <Form.Field
              label="Accepted token type"
              size="sm"
              disabled={isReadOnly}
              labelTooltip={`If tokens in this place should carry data ("colour"), assign a data type here.${
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
                <div
                  className={cx(
                    jumpButtonContainerStyle,
                    inFieldJumpButtonStyle,
                  )}
                >
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
            </Form.Field>
          )}
        </Form.Section>

        {extensions.colors && extensions.dynamics && (
          <Form.Section className={fieldsSectionStyle}>
            <Form.Field
              layout="inline"
              inputAlign="end"
              label="Dynamics"
              size="sm"
              disabled={isReadOnly}
              labelTooltip="Token data can dynamically change over time when tokens remain in a place, governed by a differential equation."
              descriptionBottom={dynamicsHint}
            >
              <Tooltip
                content={dynamicsToggleTooltip}
                disableTooltip={!dynamicsToggleTooltip}
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
            </Form.Field>

            {place.colorId !== null &&
              availableDiffEqs.length > 0 &&
              place.dynamicsEnabled && (
                <Form.Field
                  label="Differential equation"
                  hideLabel
                  size="sm"
                  disabled={isReadOnly}
                >
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
                    <div
                      className={cx(
                        jumpButtonContainerStyle,
                        inFieldJumpButtonStyle,
                      )}
                    >
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
                </Form.Field>
              )}
          </Form.Section>
        )}

        <div className={fieldsSectionStyle}>
          <div className={checkboxRowStyle}>
            <Checkbox
              label={<span className={checkboxTitleStyle}>Component port</span>}
              value={!!place.isPort}
              disabled={isReadOnly}
              onChange={(checked) => {
                updatePlace({
                  placeId: place.id,
                  update: { isPort: checked === true },
                });
              }}
            />
            <HelpTooltip content="Exposes this place as an arc endpoint when its subnet is instantiated as a component." />
          </div>
          <div className={checkboxHintStyle}>
            {place.isPort
              ? "Transitions in the parent net can connect arcs to this subnet place through a component instance."
              : "Enable this for subnet boundary places that should be available as component instance arc endpoints."}
          </div>
        </div>

        <div className={fieldsSectionStyle}>
          <div className={checkboxRowStyle}>
            <Checkbox
              size="sm"
              label={
                <span className={checkboxTitleStyle}>
                  Default starting place
                </span>
              }
              value={!!place.showAsInitialState}
              disabled={isReadOnly}
              onChange={(checked) => {
                updatePlace({
                  placeId: place.id,
                  update: { showAsInitialState: checked === true },
                });
              }}
            />
            <HelpTooltip content="Pre-selects this place when creating a new scenario." />
          </div>
          <div className={checkboxHintStyle}>
            {place.showAsInitialState
              ? "This place should have an initial marking defined to run the net, and will be pre-selected in new scenarios."
              : "Enable if this place should have an initial marking defined to run the net. It will be pre-selected in new scenarios."}
          </div>
        </div>
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

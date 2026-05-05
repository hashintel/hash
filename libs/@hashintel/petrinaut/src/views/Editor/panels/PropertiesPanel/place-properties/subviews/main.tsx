import { Checkbox } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { use, useEffect, useRef, useState } from "react";
import { TbArrowRight, TbTrash } from "react-icons/tb";

import { Button } from "../../../../../../components/button";
import { IconButton } from "../../../../../../components/icon-button";
import { Input } from "../../../../../../components/input";
import { Section, SectionList } from "../../../../../../components/section";
import { Select, type SelectOption } from "../../../../../../components/select";
import type { SubView } from "../../../../../../components/sub-view/types";
import { Switch } from "../../../../../../components/switch";
import { PlaceIcon } from "../../../../../../constants/entity-icons";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { EditorContext } from "../../../../../../state/editor-context";
import { MutationContext } from "../../../../../../state/mutation-context";
import { SDCPNContext } from "../../../../../../state/sdcpn-context";
import { validateEntityName } from "../../../../../../validation/entity-name";
import { usePlacePropertiesContext } from "../context";

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

/**
 * Main content section for the Place properties panel.
 * Rendered as a headerless SubView at the top of the proportional layout.
 */
const PlaceMainContent: React.FC = () => {
  const { place, types, isReadOnly, updatePlace } = usePlacePropertiesContext();
  const { selectItem } = use(EditorContext);

  const {
    getItemType,
    petriNetDefinition: { differentialEquations, types: availableTypes },
  } = use(SDCPNContext);

  // State for name input validation
  const [nameInputValue, setNameInputValue] = useState(place.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isNameInputFocused, setIsNameInputFocused] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const rootDivRef = useRef<HTMLDivElement>(null);

  // Update local state when place changes
  useEffect(() => {
    setNameInputValue(place.name);
    setNameError(null);
  }, [place.id, place.name]);

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
    const result = validateEntityName(nameInputValue);

    if (!result.valid) {
      setNameError(result.error);
      return;
    }

    setNameError(null);
    if (result.name !== place.name) {
      updatePlace(place.id, (existingPlace) => {
        existingPlace.name = result.name;
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
          <Input
            ref={nameInputRef}
            value={nameInputValue}
            onChange={(event) => {
              setNameInputValue(event.target.value);
              // Clear error when user starts typing
              if (nameError) {
                setNameError(null);
              }
            }}
            onFocus={() => setIsNameInputFocused(true)}
            onBlur={() => {
              setIsNameInputFocused(false);
              handleNameBlur();
            }}
            disabled={isReadOnly}
            hasError={!!nameError}
            tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
          />
          {nameError && <div className={errorMessageStyle}>{nameError}</div>}
        </Section>

        <Section
          title="Accepted token type"
          tooltip={`If tokens in this place should carry data ("colour"), assign a data type here.${
            availableTypes.length === 0
              ? " You must create a data type in the left-hand sidebar first."
              : ""
          } Tokens in places don't have to carry data, but they need one to enable dynamics (token data changing over time when in a place).`}
        >
          <Select
            value={place.colorId ?? ""}
            onValueChange={(value) => {
              const newType = value === "" ? null : value;
              updatePlace(place.id, (existingPlace) => {
                existingPlace.colorId = newType;
                // Disable dynamics if type is being set to null
                if (newType === null && existingPlace.dynamicsEnabled) {
                  existingPlace.dynamicsEnabled = false;
                }
              });
            }}
            options={[
              { value: "", label: "None" },
              ...types.map((type) => ({
                value: type.id,
                label: type.name,
              })),
            ]}
            renderTrigger={({ selectedOption }) => {
              const selectedColor = types.find(
                (tp) => tp.id === selectedOption?.value,
              )?.displayColor;
              return (
                <>
                  {selectedColor && (
                    <div
                      className={typeColorDotStyle}
                      style={{ backgroundColor: selectedColor }}
                    />
                  )}
                  <span>{selectedOption?.label ?? "None"}</span>
                </>
              );
            }}
            renderItem={(item: SelectOption) => {
              const typeColor = types.find(
                (tp) => tp.id === item.value,
              )?.displayColor;
              return (
                <>
                  {typeColor && (
                    <div
                      className={typeColorDotStyle}
                      style={{ backgroundColor: typeColor }}
                    />
                  )}
                  {item.label}
                </>
              );
            }}
            disabled={isReadOnly}
            tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
          />

          {place.colorId && (
            <div className={jumpButtonContainerStyle}>
              <Button
                variant="secondary"
                colorScheme="neutral"
                size="xs"
                onClick={() => {
                  if (place.colorId) {
                    const itemType = getItemType(place.colorId);
                    if (itemType) {
                      selectItem({ type: itemType, id: place.colorId });
                    }
                  }
                }}
                iconRight={<TbArrowRight />}
              >
                Jump to Type
              </Button>
            </div>
          )}
        </Section>

        <Section
          title="Dynamics"
          tooltip="Token data can dynamically change over time when tokens remain in a place, governed by a differential equation."
          renderHeaderAction={() => (
            <Switch
              checked={!!place.colorId && place.dynamicsEnabled}
              disabled={
                isReadOnly ||
                place.colorId === null ||
                availableDiffEqs.length === 0
              }
              tooltip={
                isReadOnly
                  ? UI_MESSAGES.READ_ONLY_MODE
                  : place.colorId === null
                    ? UI_MESSAGES.DYNAMICS_REQUIRES_TYPE
                    : availableDiffEqs.length === 0
                      ? "Create a differential equation for this type first"
                      : undefined
              }
              onCheckedChange={(checked) => {
                updatePlace(place.id, (existingPlace) => {
                  existingPlace.dynamicsEnabled = checked;
                  if (checked) {
                    // Auto-select first available diff eq if none selected or previous no longer exists
                    const currentIsValid = availableDiffEqs.some(
                      (eq) => eq.id === existingPlace.differentialEquationId,
                    );
                    if (!currentIsValid && availableDiffEqs.length > 0) {
                      existingPlace.differentialEquationId =
                        availableDiffEqs[0]!.id;
                    }
                  }
                });
              }}
            />
          )}
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
                <Select
                  value={place.differentialEquationId ?? undefined}
                  onValueChange={(value) => {
                    updatePlace(place.id, (existingPlace) => {
                      existingPlace.differentialEquationId = value;
                    });
                  }}
                  options={availableDiffEqs.map((eq) => ({
                    value: eq.id,
                    label: eq.name,
                  }))}
                  disabled={isReadOnly}
                  tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
                />

                {place.differentialEquationId && (
                  <div className={jumpButtonContainerStyle}>
                    <Button
                      variant="secondary"
                      colorScheme="neutral"
                      size="xs"
                      onClick={() => {
                        if (place.differentialEquationId) {
                          selectItem({
                            type: "differentialEquation",
                            id: place.differentialEquationId,
                          });
                        }
                      }}
                      iconRight={<TbArrowRight />}
                    >
                      Jump to Differential Equation
                    </Button>
                  </div>
                )}
              </>
            )
          )}
        </Section>
        <Section
          title="Default starting place"
          tooltip="Pre-selects this place when creating a new scenario."
          renderHeaderLeading={() => (
            <Checkbox
              checked={!!place.showAsInitialState}
              disabled={isReadOnly}
              onCheckedChange={(checked) => {
                updatePlace(place.id, (existingPlace) => {
                  existingPlace.showAsInitialState = checked === true;
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
  const { removePlace } = use(MutationContext);

  return (
    <IconButton
      aria-label="Delete"
      size="xs"
      colorScheme="red"
      onClick={() => removePlace(place.id)}
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Delete"}
    >
      <TbTrash />
    </IconButton>
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

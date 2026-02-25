import { css } from "@hashintel/ds-helpers/css";
import { use, useEffect, useRef, useState } from "react";
import { TbArrowRight, TbTrash } from "react-icons/tb";

import { Button } from "../../../../components/button";
import { IconButton } from "../../../../components/icon-button";
import { Input } from "../../../../components/input";
import { Select } from "../../../../components/select";
import type { SubView } from "../../../../components/sub-view/types";
import { VerticalSubViewsContainer } from "../../../../components/sub-view/vertical/vertical-sub-views-container";
import { Switch } from "../../../../components/switch";
import { InfoIconTooltip } from "../../../../components/tooltip";
import { UI_MESSAGES } from "../../../../constants/ui-messages";
import type { Color, Place } from "../../../../core/types/sdcpn";
import { EditorContext } from "../../../../state/editor-context";
import { SDCPNContext } from "../../../../state/sdcpn-context";
import { useIsReadOnly } from "../../../../state/use-is-read-only";
import { placeInitialStateSubView } from "../../subviews/place-initial-state";
import { placeVisualizerSubView } from "../../subviews/place-visualizer";
import {
  PlacePropertiesProvider,
  usePlacePropertiesContext,
} from "./place-properties-context";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  minHeight: "[0]",
});

const mainContentStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
  gap: "[12px]",
});

const fieldLabelStyle = css({
  fontWeight: "medium",
  fontSize: "[12px]",
  marginBottom: "[4px]",
});

const fieldLabelWithTooltipStyle = css({
  fontWeight: "medium",
  fontSize: "[12px]",
  marginBottom: "[4px]",
  display: "flex",
  alignItems: "center",
});

const errorMessageStyle = css({
  fontSize: "[12px]",
  color: "[#ef4444]",
  marginTop: "[4px]",
});

const jumpButtonContainerStyle = css({
  textAlign: "right",
});

const jumpIconStyle = css({
  fontSize: "[14px]",
});

const sectionContainerStyle = css({
  marginTop: "[10px]",
});

const switchRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
  marginBottom: "[8px]",
});

const switchContainerStyle = css({
  display: "flex",
  alignItems: "center",
});

const hintTextStyle = css({
  fontSize: "[11px]",
  color: "[#999]",
  fontStyle: "italic",
  marginTop: "[4px]",
});

const diffEqContainerStyle = css({
  marginBottom: "[25px]",
});

/**
 * Main content section for the Place properties panel.
 * Rendered as a headerless SubView at the top of the proportional layout.
 */
const PlaceMainContent: React.FC = () => {
  const { place, types, isReadOnly, updatePlace } = usePlacePropertiesContext();
  const { setSelectedResourceId } = use(EditorContext);

  const {
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

  // Validate PascalCase format
  const isPascalCase = (str: string): boolean => {
    if (!str) {
      return false;
    }
    // PascalCase: starts with uppercase, contains letters (and optionally numbers at the end)
    return /^[A-Z][a-zA-Z]*\d*$/.test(str);
  };

  const handleNameBlur = () => {
    if (!nameInputValue.trim()) {
      setNameError("Name cannot be empty");
      return;
    }

    if (!isPascalCase(nameInputValue)) {
      setNameError(
        "Name must be in PascalCase (e.g., MyPlaceName or Place2). Any numbers must appear at the end.",
      );
      return;
    }

    // Valid name - update and clear error
    setNameError(null);
    if (nameInputValue !== place.name) {
      updatePlace(place.id, (existingPlace) => {
        existingPlace.name = nameInputValue;
      });
    }
  };

  // Filter differential equations by place type
  const availableDiffEqs = place.colorId
    ? differentialEquations.filter((eq) => eq.colorId === place.colorId)
    : [];

  return (
    <div ref={rootDivRef} className={mainContentStyle}>
      <div>
        <div className={fieldLabelStyle}>Name</div>
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
      </div>

      <div>
        <div className={fieldLabelStyle}>
          Accepted token type
          <InfoIconTooltip
            tooltip={`If tokens in this place should carry data ("colour"), assign a data type here.${
              availableTypes.length === 0
                ? " You must create a data type in the left-hand sidebar first."
                : ""
            } Tokens in places don't have to carry data, but they need one to enable dynamics (token data changing over time when in a place).`}
          />
        </div>
        <Select
          value={place.colorId ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            const newType = value === "" ? null : value;
            updatePlace(place.id, (existingPlace) => {
              existingPlace.colorId = newType;
              // Disable dynamics if type is being set to null
              if (newType === null && existingPlace.dynamicsEnabled) {
                existingPlace.dynamicsEnabled = false;
              }
            });
          }}
          disabled={isReadOnly}
          style={place.colorId ? { marginBottom: "8px" } : undefined}
          tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        >
          <option value="">None</option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </Select>

        {place.colorId && (
          <div className={jumpButtonContainerStyle}>
            <Button
              onClick={() => {
                setSelectedResourceId(place.colorId);
              }}
            >
              Jump to Type
              <TbArrowRight className={jumpIconStyle} />
            </Button>
          </div>
        )}
      </div>

      <div className={sectionContainerStyle}>
        <div className={switchRowStyle}>
          <div className={switchContainerStyle}>
            <Switch
              checked={!!place.colorId && place.dynamicsEnabled}
              disabled={isReadOnly || place.colorId === null}
              tooltip={
                isReadOnly
                  ? UI_MESSAGES.READ_ONLY_MODE
                  : place.colorId === null
                    ? UI_MESSAGES.DYNAMICS_REQUIRES_TYPE
                    : undefined
              }
              onCheckedChange={(checked) => {
                updatePlace(place.id, (existingPlace) => {
                  existingPlace.dynamicsEnabled = checked;
                });
              }}
            />
          </div>
          <div className={fieldLabelWithTooltipStyle}>
            Dynamics
            <InfoIconTooltip tooltip="Token data can dynamically change over time when tokens remain in a place, governed by a differential equation." />
          </div>
        </div>
        {(place.colorId === null || availableDiffEqs.length === 0) && (
          <div className={hintTextStyle}>
            {place.colorId !== null
              ? "Create a differential equation for the selected type in the left-hand sidebar first"
              : availableTypes.length === 0
                ? "Create a type in the left-hand sidebar first, then select it to enable dynamics."
                : "Select a type to enable dynamics"}
          </div>
        )}
      </div>

      {place.colorId &&
        place.dynamicsEnabled &&
        availableDiffEqs.length > 0 && (
          <div className={diffEqContainerStyle}>
            <div className={fieldLabelStyle}>Differential Equation</div>
            <Select
              value={place.differentialEquationId ?? undefined}
              onChange={(event) => {
                const value = event.target.value;

                updatePlace(place.id, (existingPlace) => {
                  existingPlace.differentialEquationId = value || null;
                });
              }}
              disabled={isReadOnly}
              style={{ marginBottom: "8px" }}
              tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
            >
              <option value="">None</option>
              {availableDiffEqs.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name}
                </option>
              ))}
            </Select>

            {place.differentialEquationId && (
              <div className={jumpButtonContainerStyle}>
                <Button
                  onClick={() => {
                    setSelectedResourceId(place.differentialEquationId);
                  }}
                >
                  Jump to Differential Equation
                  <TbArrowRight className={jumpIconStyle} />
                </Button>
              </div>
            )}
          </div>
        )}
    </div>
  );
};

const DeletePlaceAction: React.FC = () => {
  const { place, isReadOnly } = usePlacePropertiesContext();
  const { removePlace } = use(SDCPNContext);

  return (
    <IconButton
      aria-label="Delete"
      variant="danger"
      onClick={() => {
        if (
          // eslint-disable-next-line no-alert
          window.confirm(
            `Are you sure you want to delete "${place.name}"? All arcs connected to this place will also be removed.`,
          )
        ) {
          removePlace(place.id);
        }
      }}
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Delete"}
    >
      <TbTrash size={16} />
    </IconButton>
  );
};

const placeMainContentSubView: SubView = {
  id: "place-main-content",
  title: "Place",
  main: true,
  component: PlaceMainContent,
  renderHeaderAction: () => <DeletePlaceAction />,
};

const subViews: SubView[] = [
  placeMainContentSubView,
  placeInitialStateSubView,
  placeVisualizerSubView,
];

interface PlacePropertiesProps {
  place: Place;
  types: Color[];
  updatePlace: (placeId: string, updateFn: (place: Place) => void) => void;
}

export const PlaceProperties: React.FC<PlacePropertiesProps> = ({
  place,
  types,
  updatePlace,
}) => {
  const isReadOnly = useIsReadOnly();

  const placeType = place.colorId
    ? (types.find((tp) => tp.id === place.colorId) ?? null)
    : null;

  return (
    <div className={containerStyle}>
      <PlacePropertiesProvider
        place={place}
        placeType={placeType}
        types={types}
        isReadOnly={isReadOnly}
        updatePlace={updatePlace}
      >
        <VerticalSubViewsContainer subViews={subViews} />
      </PlacePropertiesProvider>
    </div>
  );
};

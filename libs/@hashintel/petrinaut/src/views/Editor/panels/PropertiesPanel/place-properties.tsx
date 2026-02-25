/* eslint-disable id-length */
import { css } from "@hashintel/ds-helpers/css";
import { use, useEffect, useMemo, useRef, useState } from "react";
import {
  TbArrowRight,
  TbDotsVertical,
  TbSparkles,
  TbTrash,
} from "react-icons/tb";

import { Button } from "../../../../components/button";
import { IconButton } from "../../../../components/icon-button";
import { Input } from "../../../../components/input";
import { Menu } from "../../../../components/menu";
import { Select } from "../../../../components/select";
import type { SubView } from "../../../../components/sub-view/types";
import { VerticalSubViewsContainer } from "../../../../components/sub-view/vertical/vertical-sub-views-container";
import { Switch } from "../../../../components/switch";
import { InfoIconTooltip, Tooltip } from "../../../../components/tooltip";
import { UI_MESSAGES } from "../../../../constants/ui-messages";
import {
  DEFAULT_VISUALIZER_CODE,
  generateDefaultVisualizerCode,
} from "../../../../core/default-codes";
import type { Color, Place } from "../../../../core/types/sdcpn";
import { CodeEditor } from "../../../../monaco/code-editor";
import { PlaybackContext } from "../../../../playback/context";
import { EditorContext } from "../../../../state/editor-context";
import { SDCPNContext } from "../../../../state/sdcpn-context";
import { useIsReadOnly } from "../../../../state/use-is-read-only";
import { placeInitialStateSubView } from "../../subviews/place-initial-state";
import { placeVisualizerOutputSubView } from "../../subviews/place-visualizer-output";
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

const codeHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "[4px]",
});

const codeHeaderLabelStyle = css({
  fontWeight: "medium",
  fontSize: "[12px]",
});

const aiMenuItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
});

const aiIconStyle = css({
  fontSize: "[16px]",
});

/**
 * Main content section for the Place properties panel.
 * Rendered as a headerless SubView at the top of the proportional layout.
 */
const PlaceMainContent: React.FC = () => {
  const { place, types, isReadOnly, updatePlace } = usePlacePropertiesContext();
  const { totalFrames } = use(PlaybackContext);
  const { globalMode, setSelectedResourceId } = use(EditorContext);

  const {
    petriNetDefinition: { differentialEquations, types: availableTypes },
    removePlace,
  } = use(SDCPNContext);

  // Store previous visualizer code when toggling off (in case user toggled off by mistake)
  const [savedVisualizerCode, setSavedVisualizerCode] = useState<
    string | undefined
  >(undefined);
  useEffect(() => setSavedVisualizerCode(undefined), [place.id]);

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

  // Determine if we should show visualization (when simulation has frames)
  const hasSimulationFrames = totalFrames > 0;
  const showVisualizerOutput = isReadOnly || hasSimulationFrames;

  return (
    <div ref={rootDivRef} className={mainContentStyle}>
      <div>
        <div className={headerContainerStyle}>
          <div className={headerTitleStyle}>Place</div>
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
        </div>
      </div>

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

      {/* Visualizer toggle - only shown in edit mode */}
      {globalMode === "edit" && (
        <div className={sectionContainerStyle}>
          <div className={switchRowStyle}>
            <div className={switchContainerStyle}>
              <Switch
                checked={place.visualizerCode !== undefined}
                disabled={isReadOnly}
                tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
                onCheckedChange={(checked) => {
                  if (checked) {
                    // Turning on: use saved code if available, otherwise default
                    updatePlace(place.id, (existingPlace) => {
                      existingPlace.visualizerCode =
                        savedVisualizerCode ?? DEFAULT_VISUALIZER_CODE;
                    });
                  } else {
                    // Turning off: save current code and set to undefined
                    if (place.visualizerCode) {
                      setSavedVisualizerCode(place.visualizerCode);
                    }
                    updatePlace(place.id, (existingPlace) => {
                      existingPlace.visualizerCode = undefined;
                    });
                  }
                }}
              />
            </div>
            <div className={fieldLabelWithTooltipStyle}>
              Visualizer
              <InfoIconTooltip tooltip="You can set a custom visualization for tokens evolving in a place, viewable in this panel when a simulation is running." />
            </div>
          </div>
        </div>
      )}

      {/* Visualizer Code Editor - only shown in edit mode when visualizer is enabled */}
      {place.visualizerCode !== undefined && !showVisualizerOutput && (
        <div>
          <div className={codeHeaderStyle}>
            <div className={codeHeaderLabelStyle}>Visualizer Code</div>
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
                    // Get the place's type to generate appropriate default code
                    const currentPlaceType = place.colorId
                      ? types.find((t) => t.id === place.colorId)
                      : null;

                    updatePlace(place.id, (existingPlace) => {
                      existingPlace.visualizerCode = currentPlaceType
                        ? generateDefaultVisualizerCode(currentPlaceType)
                        : DEFAULT_VISUALIZER_CODE;
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
          </div>
          <CodeEditor
            path={`inmemory://sdcpn/places/${place.id}/visualizer.tsx`}
            language="typescript"
            height={400}
            value={place.visualizerCode}
            onChange={(value) => {
              updatePlace(place.id, (existingPlace) => {
                existingPlace.visualizerCode = value ?? "";
              });
            }}
          />
        </div>
      )}
    </div>
  );
};

const placeMainContentSubView: SubView = {
  id: "place-main-content",
  title: "Place",
  hideHeader: true,
  component: PlaceMainContent,
};

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

  const subViews = useMemo(() => {
    const views: SubView[] = [
      placeMainContentSubView,
      placeInitialStateSubView,
    ];

    if (place.visualizerCode !== undefined) {
      views.push(placeVisualizerOutputSubView);
    }

    return views;
  }, [place.visualizerCode]);

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

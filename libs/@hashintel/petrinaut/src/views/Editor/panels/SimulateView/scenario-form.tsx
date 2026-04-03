import { css } from "@hashintel/ds-helpers/css";
import { useMemo } from "react";
import { TbPlus, TbTrash } from "react-icons/tb";

import { IconButton } from "../../../../components/icon-button";
import { Input } from "../../../../components/input";
import { Section, SectionList } from "../../../../components/section";
import { Select } from "../../../../components/select";
import type { SpreadsheetColumn } from "../../../../components/spreadsheet";
import { Spreadsheet } from "../../../../components/spreadsheet";
import { Switch } from "../../../../components/switch";
import type {
  Color,
  Parameter,
  Place,
  ScenarioParameter,
} from "../../../../core/types/sdcpn";

// -- Form styles --------------------------------------------------------------

const fieldStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[6px]",
});

const labelStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
});

const textareaStyle = css({
  boxSizing: "border-box",
  width: "full",
  minHeight: "[80px]",
  padding: "[8px]",
  fontSize: "sm",
  fontWeight: "medium",
  fontFamily: "[inherit]",
  color: "neutral.fg.body",
  backgroundColor: "neutral.s00",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  outline: "none",
  resize: "vertical",
  transition: "[border-color 0.15s ease, box-shadow 0.15s ease]",
  _hover: {
    borderColor: "neutral.bd.subtle.hover",
  },
  _focus: {
    borderColor: "neutral.bd.subtle",
    boxShadow: "[0px 0px 0px 2px {colors.neutral.a25}]",
  },
  _placeholder: {
    color: "neutral.s80",
  },
});

// -- Scenario parameter row styles --------------------------------------------

const paramRowStyle = css({
  display: "flex",
  alignItems: "flex-end",
  gap: "[8px]",
});

const paramFieldStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[4px]",
  flex: "1",
  minWidth: "[0]",
});

const paramFieldSmStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[4px]",
  width: "[64px]",
  flexShrink: 0,
});

const paramLabelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s80",
});

// -- Override row styles -------------------------------------------------------

const overrideRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
});

const overrideNameStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
  width: "[140px]",
  flexShrink: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const overrideTypeStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
  width: "[60px]",
  flexShrink: 0,
});

// -- Place row styles ----------------------------------------------------------

const placeRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
});

const placeNameStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
  width: "[140px]",
  flexShrink: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const placeBlockStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[6px]",
});

const emptyStyle = css({
  fontSize: "sm",
  color: "neutral.s80",
  paddingY: "[4px]",
});

const switchLabelStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s80",
  cursor: "pointer",
});

const selectStyle = css({
  width: "[100px]",
  flexShrink: 0,
});

// -- Types --------------------------------------------------------------------

export type ScenarioParameterDraft = ScenarioParameter & { _key: number };

// -- Place initial state row ---------------------------------------------------

const PlaceInitialStateRow = ({
  place,
  placeType,
  tokenCount,
  onTokenCountChange,
  tokenData,
  onTokenDataChange,
}: {
  place: Place;
  placeType: Color | undefined;
  tokenCount: string;
  onTokenCountChange: (value: string) => void;
  tokenData: number[][];
  onTokenDataChange: (data: number[][]) => void;
}) => {
  const columns: SpreadsheetColumn[] = useMemo(
    () =>
      placeType
        ? placeType.elements.map((element) => ({
            id: element.elementId,
            name: element.name,
          }))
        : [],
    [placeType],
  );

  if (placeType && placeType.elements.length > 0) {
    return (
      <div className={placeBlockStyle}>
        <span className={placeNameStyle}>{place.name}</span>
        <Spreadsheet
          columns={columns}
          data={tokenData}
          onChange={onTokenDataChange}
        />
      </div>
    );
  }

  return (
    <div className={placeRowStyle}>
      <span className={placeNameStyle}>{place.name}</span>
      <Input
        size="sm"
        value={tokenCount}
        onChange={(e) => onTokenCountChange(e.target.value)}
        placeholder="0"
      />
    </div>
  );
};

// -- Shared form sections -----------------------------------------------------

export interface ScenarioFormState {
  name: string;
  description: string;
  scenarioParams: ScenarioParameterDraft[];
  parameterOverrides: Record<string, string>;
  initialTokenCounts: Record<string, string>;
  initialTokenData: Record<string, number[][]>;
  showAllPlaces: boolean;
}

export interface ScenarioFormCallbacks {
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onScenarioParamsChange: (
    updater: (prev: ScenarioParameterDraft[]) => ScenarioParameterDraft[],
  ) => void;
  onParameterOverridesChange: (
    updater: (prev: Record<string, string>) => Record<string, string>,
  ) => void;
  onInitialTokenCountsChange: (
    updater: (prev: Record<string, string>) => Record<string, string>,
  ) => void;
  onInitialTokenDataChange: (
    updater: (prev: Record<string, number[][]>) => Record<string, number[][]>,
  ) => void;
  onShowAllPlacesChange: (value: boolean) => void;
}

interface ScenarioFormSectionsProps {
  state: ScenarioFormState;
  callbacks: ScenarioFormCallbacks;
  /** The net-level parameters */
  parameters: Parameter[];
  /** The net-level places */
  places: Place[];
  /** Map of type ID → Color */
  typesById: Map<string, Color>;
  /** Unique prefix for element IDs to avoid collisions when multiple forms exist */
  idPrefix?: string;
}

let nextKey = 0;

export const ScenarioFormSections = ({
  state,
  callbacks,
  parameters,
  places,
  typesById,
  idPrefix = "",
}: ScenarioFormSectionsProps) => {
  const addScenarioParam = () => {
    callbacks.onScenarioParamsChange((prev) => [
      ...prev,
      {
        _key: nextKey++,
        identifier: "",
        type: "real",
        min: 0,
        max: 100,
        default: 0,
      },
    ]);
  };

  const updateScenarioParam = (
    key: number,
    updates: Partial<ScenarioParameterDraft>,
  ) => {
    callbacks.onScenarioParamsChange((prev) =>
      prev.map((p) => (p._key === key ? { ...p, ...updates } : p)),
    );
  };

  const removeScenarioParam = (key: number) => {
    callbacks.onScenarioParamsChange((prev) =>
      prev.filter((p) => p._key !== key),
    );
  };

  return (
    <SectionList>
      {/* -- General -------------------------------------------------- */}
      <Section title="General" collapsible defaultOpen>
        <div className={fieldStyle}>
          <label className={labelStyle} htmlFor={`${idPrefix}scenario-name`}>
            Scenario name
          </label>
          <Input
            id={`${idPrefix}scenario-name`}
            size="md"
            value={state.name}
            onChange={(e) => callbacks.onNameChange(e.target.value)}
          />
        </div>

        <div className={fieldStyle}>
          <label
            className={labelStyle}
            htmlFor={`${idPrefix}scenario-description`}
          >
            Description
          </label>
          <textarea
            id={`${idPrefix}scenario-description`}
            className={textareaStyle}
            value={state.description}
            onChange={(e) => callbacks.onDescriptionChange(e.target.value)}
          />
        </div>
      </Section>

      {/* -- Scenario Parameters -------------------------------------- */}
      <Section
        title="Scenario Parameters"
        collapsible
        defaultOpen
        renderHeaderAction={() => (
          <IconButton
            size="xs"
            variant="ghost"
            aria-label="Add scenario parameter"
            onClick={addScenarioParam}
          >
            <TbPlus size={12} />
          </IconButton>
        )}
      >
        {state.scenarioParams.length === 0 ? (
          <span className={emptyStyle}>No scenario parameters</span>
        ) : (
          state.scenarioParams.map((param) => (
            <div key={param._key} className={paramRowStyle}>
              <div className={paramFieldStyle}>
                <span className={paramLabelStyle}>Identifier</span>
                <Input
                  size="sm"
                  value={param.identifier}
                  onChange={(e) =>
                    updateScenarioParam(param._key, {
                      identifier: e.target.value,
                    })
                  }
                  placeholder="name"
                />
              </div>
              <div className={paramFieldSmStyle}>
                <span className={paramLabelStyle}>Type</span>
                <Select
                  className={selectStyle}
                  value={param.type}
                  onValueChange={(value) =>
                    updateScenarioParam(param._key, {
                      type: value as ScenarioParameter["type"],
                    })
                  }
                  options={[
                    { value: "real", label: "Real" },
                    { value: "integer", label: "Int" },
                    { value: "boolean", label: "Bool" },
                  ]}
                  portal={false}
                />
              </div>
              <div className={paramFieldSmStyle}>
                <span className={paramLabelStyle}>Min</span>
                <Input
                  size="sm"
                  value={String(param.min)}
                  onChange={(e) =>
                    updateScenarioParam(param._key, {
                      min: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className={paramFieldSmStyle}>
                <span className={paramLabelStyle}>Max</span>
                <Input
                  size="sm"
                  value={String(param.max)}
                  onChange={(e) =>
                    updateScenarioParam(param._key, {
                      max: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className={paramFieldSmStyle}>
                <span className={paramLabelStyle}>Default</span>
                <Input
                  size="sm"
                  value={String(param.default)}
                  onChange={(e) =>
                    updateScenarioParam(param._key, {
                      default: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <IconButton
                size="xs"
                variant="ghost"
                colorScheme="red"
                aria-label="Remove parameter"
                onClick={() => removeScenarioParam(param._key)}
              >
                <TbTrash size={12} />
              </IconButton>
            </div>
          ))
        )}
      </Section>

      {/* -- Parameters (net-level overrides) ------------------------- */}
      <Section title="SDCPN Parameters Values" collapsible defaultOpen>
        {parameters.length === 0 ? (
          <span className={emptyStyle}>No parameters defined in the net</span>
        ) : (
          parameters.map((param) => (
            <div key={param.id} className={overrideRowStyle}>
              <span className={overrideNameStyle}>{param.name}</span>
              <span className={overrideTypeStyle}>{param.type}</span>
              <Input
                size="sm"
                value={state.parameterOverrides[param.id] ?? ""}
                onChange={(e) =>
                  callbacks.onParameterOverridesChange((prev) => ({
                    ...prev,
                    [param.id]: e.target.value,
                  }))
                }
                placeholder={param.defaultValue}
              />
            </div>
          ))
        )}
      </Section>

      {/* -- Initial State -------------------------------------------- */}
      <Section
        title="Initial State"
        collapsible
        defaultOpen
        renderHeaderAction={() => (
          <div className={switchLabelStyle}>
            <span>Show all</span>
            <Switch
              checked={state.showAllPlaces}
              onCheckedChange={callbacks.onShowAllPlacesChange}
            />
          </div>
        )}
      >
        {places.length === 0 ? (
          <span className={emptyStyle}>No places defined in the net</span>
        ) : (
          [...places]
            .filter((place) => state.showAllPlaces || place.showAsInitialState)
            .sort((a, b) => {
              const aP = a.showAsInitialState ? 0 : 1;
              const bP = b.showAsInitialState ? 0 : 1;
              return aP - bP;
            })
            .map((place) => (
              <PlaceInitialStateRow
                key={place.id}
                place={place}
                placeType={
                  place.colorId ? typesById.get(place.colorId) : undefined
                }
                tokenCount={state.initialTokenCounts[place.id] ?? ""}
                onTokenCountChange={(value) =>
                  callbacks.onInitialTokenCountsChange((prev) => ({
                    ...prev,
                    [place.id]: value,
                  }))
                }
                tokenData={state.initialTokenData[place.id] ?? []}
                onTokenDataChange={(data) =>
                  callbacks.onInitialTokenDataChange((prev) => ({
                    ...prev,
                    [place.id]: data,
                  }))
                }
              />
            ))
        )}
      </Section>
    </SectionList>
  );
};

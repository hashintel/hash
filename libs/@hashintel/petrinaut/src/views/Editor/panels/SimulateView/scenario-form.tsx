import { css } from "@hashintel/ds-helpers/css";
import { useForm, useStore } from "@tanstack/react-form";
import { use, useEffect, useRef, useState } from "react";
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
import { LanguageClientContext } from "../../../../lsp/context";
import { CodeEditor } from "../../../../monaco/code-editor";
import { getScenarioDocumentUri } from "../../../../monaco/editor-paths";
import { NumberInput } from "../../../../components/number-input";

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
  color: "neutral.s100",
});

// -- Override row styles -------------------------------------------------------

const overrideRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
});

const overrideLabelStyle = css({
  width: "[140px]",
  flexShrink: 0,
  overflow: "hidden",
});

const overrideNameStyle = css({
  fontSize: "sm",
  fontWeight: "normal",
  color: "neutral.s115",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  overflow: "hidden",
});

const overrideVarNameStyle = css({
  fontSize: "[11px]",
  color: "neutral.s100",
  fontFamily: "mono",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  overflow: "hidden",
});

// -- Place row styles ----------------------------------------------------------

const placeRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
});

const placeLabelStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
  width: "[140px]",
  flexShrink: 0,
  overflow: "hidden",
});

const placeDotStyle = css({
  width: "[8px]",
  height: "[8px]",
  borderRadius: "full",
  flexShrink: 0,
});

const placeNameStyle = css({
  fontSize: "sm",
  fontWeight: "normal",
  color: "neutral.s115",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const placeBlockStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[6px]",
});

const hintStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
  lineHeight: "[1.4]",
});

const emptyStyle = css({
  fontSize: "sm",
  color: "neutral.s80",
  paddingY: "[4px]",
});

const switchGroupStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
});

const switchLabelStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "4",
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
  documentUri,
  error,
  onFocus,
  onBlur,
}: {
  place: Place;
  placeType: Color | undefined;
  tokenCount: string;
  onTokenCountChange: (value: string) => void;
  tokenData: number[][];
  onTokenDataChange: (data: number[][]) => void;
  documentUri?: string;
  error?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}) => {
  const columns: SpreadsheetColumn[] = placeType
    ? placeType.elements.map((element) => ({
        id: element.elementId,
        name: element.name,
      }))
    : [];

  const dotColor = placeType?.displayColor ?? "#ccc";

  if (placeType && placeType.elements.length > 0) {
    return (
      <div className={placeBlockStyle}>
        <div className={placeLabelStyle}>
          <div
            className={placeDotStyle}
            style={{ backgroundColor: dotColor }}
          />
          <span className={placeNameStyle}>{place.name}</span>
        </div>
        <Spreadsheet
          columns={columns}
          data={tokenData}
          onChange={onTokenDataChange}
        />
      </div>
    );
  }

  return (
    <div>
      <div className={placeRowStyle}>
        <div className={placeLabelStyle}>
          <div
            className={placeDotStyle}
            style={{ backgroundColor: dotColor }}
          />
          <span className={placeNameStyle}>{place.name}</span>
        </div>
        <CodeEditor
          singleLine
          language="typescript"
          path={documentUri}
          value={tokenCount}
          onChange={(v) => onTokenCountChange(v ?? "")}
          placeholder="0"
          hasError={!!error}
          onEditorFocus={onFocus}
          onEditorBlur={onBlur}
        />
      </div>
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
  initialStateAsCode: boolean;
  initialStateCode: string;
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
  onInitialStateAsCodeChange: (value: boolean) => void;
  onInitialStateCodeChange: (value: string) => void;
}

// -- TanStack Form integration -----------------------------------------------

const SNAKE_CASE_RE = /^[a-z][a-z0-9_]*$/;

/**
 * Best-effort conversion to snake_case: split camelCase/PascalCase boundaries,
 * lowercase, replace runs of non-alphanumerics with a single underscore, and
 * trim leading/trailing underscores. Returns `""` for empty/invalid input —
 * the caller should leave the field empty in that case so the existing
 * validation surfaces the error.
 */
function snakify(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Validate scenario parameters: identifiers must be snake_case and unique.
 * Returns a human-readable error string or `undefined` when all valid.
 */
function validateScenarioParams(
  params: ScenarioParameterDraft[],
): string | undefined {
  const seen = new Set<string>();
  for (const param of params) {
    const id = param.identifier;
    if (id === "") {
      return "Scenario parameter identifiers cannot be empty.";
    }
    if (!SNAKE_CASE_RE.test(id)) {
      return `Scenario parameter "${id}" must be snake_case (lowercase letters, digits, underscores; must start with a letter).`;
    }
    if (seen.has(id)) {
      return `Scenario parameter "${id}" is duplicated. Identifiers must be unique.`;
    }
    seen.add(id);
  }
  return undefined;
}

/**
 * Validate the scenario name: must be non-empty and unique among existing
 * scenarios (excluding the one being edited, when `editingScenarioId` is set).
 */
function validateScenarioName(
  name: string,
  existingNames: ReadonlySet<string>,
): string | undefined {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "Scenario name is required.";
  }
  if (existingNames.has(trimmed)) {
    return `A scenario named "${trimmed}" already exists. Choose a unique name.`;
  }
  return undefined;
}

export interface UseScenarioFormOptions {
  /**
   * Names of other existing scenarios. The form's `name` field must not match
   * any of these. When editing, the current scenario's own name should be
   * excluded by the caller.
   */
  existingScenarioNames?: ReadonlySet<string>;
}

/**
 * Concrete hook that creates a TanStack form for scenario editing.
 * Returning a typed instance avoids the 12+ explicit type arguments
 * required to use `ReturnType<typeof useForm>` directly.
 */
export interface ScenarioFormSubmitContext {
  /** Reset the form to its default values. */
  reset: () => void;
}

export function useScenarioForm(
  defaultValues: ScenarioFormState,
  onSubmit: (values: ScenarioFormState, ctx: ScenarioFormSubmitContext) => void,
  options: UseScenarioFormOptions = {},
) {
  const existingNames = options.existingScenarioNames ?? new Set<string>();
  return useForm({
    defaultValues,
    onSubmit: ({ value, formApi }) =>
      onSubmit(value, {
        reset: () => formApi.reset(),
      }),
    validators: {
      onChange: ({ value }) =>
        validateScenarioName(value.name, existingNames) ??
        validateScenarioParams(value.scenarioParams),
      // Re-run on submit so validation also catches users who never edited
      // any field (initial state may be invalid).
      onSubmit: ({ value }) =>
        validateScenarioName(value.name, existingNames) ??
        validateScenarioParams(value.scenarioParams),
    },
  });
}

export type ScenarioFormInstance = ReturnType<typeof useScenarioForm>;

// -- LSP session hook ---------------------------------------------------------

/**
 * Manages a temporary LSP session for scenario expression type-checking.
 * Generates a unique session ID, initializes on mount, updates on structural
 * changes, and kills on unmount.
 */
export function useScenarioLspSession({
  scenarioParams,
  parameterOverrides,
  initialTokenCounts,
  initialStateCode,
  initialStateAsCode,
  parameters,
  places,
  typesById,
}: {
  scenarioParams: ScenarioParameterDraft[];
  parameterOverrides: Record<string, string>;
  initialTokenCounts: Record<string, string>;
  initialStateCode: string;
  initialStateAsCode: boolean;
  parameters: Parameter[];
  places: Place[];
  typesById: Map<string, Color>;
}): string {
  const {
    initializeScenarioSession,
    updateScenarioSession,
    killScenarioSession,
  } = use(LanguageClientContext);
  // useState (not useRef/useMemo) — needed for a stable per-mount value.
  // React Compiler doesn't replace useState; it only memoizes derived values.
  const [sessionId] = useState(() => crypto.randomUUID());
  const initializedRef = useRef(false);

  // Build session data for all parameters and places that use code editors.
  // Computed during render — React Compiler handles memoization.
  const allOverrides: Record<string, string> = {};
  for (const param of parameters) {
    allOverrides[param.id] = parameterOverrides[param.id] ?? "";
  }

  // Include entries for places that use code editors (not spreadsheets)
  const allInitialState: Record<string, string> = {};
  for (const place of places) {
    const placeType = place.colorId ? typesById.get(place.colorId) : undefined;
    if (!placeType || placeType.elements.length === 0) {
      allInitialState[place.id] = initialTokenCounts[place.id] ?? "";
    }
  }

  const sessionData = {
    sessionId,
    scenarioParameters: scenarioParams.map(({ _key: _, ...rest }) => rest),
    parameterOverrides: allOverrides,
    initialState: allInitialState,
    initialStateCode,
    initialStateAsCode,
  };

  useEffect(() => {
    if (!initializedRef.current) {
      initializeScenarioSession(sessionData);
      initializedRef.current = true;
    } else {
      updateScenarioSession(sessionData);
    }
  }, [sessionData, initializeScenarioSession, updateScenarioSession]);

  useEffect(() => {
    return () => {
      killScenarioSession(sessionId);
    };
  }, [sessionId, killScenarioSession]);

  return sessionId;
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
  /** LSP session ID for scenario expression type-checking */
  scenarioSessionId?: string;
}

let nextKey = 0;

export const ScenarioFormSections = ({
  state,
  callbacks,
  parameters,
  places,
  typesById,
  idPrefix = "",
  scenarioSessionId,
}: ScenarioFormSectionsProps) => {
  const { diagnosticsByUri } = use(LanguageClientContext);
  const [focusedUri, setFocusedUri] = useState<string | null>(null);

  /**
   * Get the first diagnostic message for a URI, but only when the field
   * is NOT focused (so errors don't flash while the user is typing).
   */
  const getError = (uri: string | undefined): string | undefined => {
    if (!uri || uri === focusedUri) {
      return undefined;
    }
    const diagnostics = diagnosticsByUri.get(uri);
    return diagnostics?.[0]?.message;
  };

  // Inline validation for name and scenario parameter identifiers
  const nameHasError = state.name.trim() === "";
  const identifiersSeen = new Set<string>();
  const identifierHasError = (id: string): boolean => {
    if (id === "") {
      return false; // Don't flag empty while user hasn't typed yet
    }
    const isDuplicate = identifiersSeen.has(id);
    identifiersSeen.add(id);
    return !SNAKE_CASE_RE.test(id) || isDuplicate;
  };

  const addScenarioParam = () => {
    callbacks.onScenarioParamsChange((prev) => [
      ...prev,
      {
        _key: nextKey++,
        identifier: "",
        type: "real",
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
            hasError={nameHasError && state.name !== ""}
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
        <span className={hintStyle}>
          Variables specific to this scenario that can be adjusted when creating
          an experiment.
        </span>
        {state.scenarioParams.length === 0 ? (
          <span className={emptyStyle}>No scenario parameters</span>
        ) : (
          state.scenarioParams.map((param) => (
            <div key={param._key} className={paramRowStyle}>
              <div className={paramFieldStyle}>
                <span className={paramLabelStyle}>Identifier</span>
                <Input
                  size="sm"
                  monospace
                  value={param.identifier}
                  onChange={(e) =>
                    updateScenarioParam(param._key, {
                      identifier: e.target.value,
                    })
                  }
                  onBlur={(e) => {
                    const snakified = snakify(e.target.value);
                    if (snakified !== e.target.value) {
                      updateScenarioParam(param._key, {
                        identifier: snakified,
                      });
                    }
                  }}
                  placeholder="name"
                  hasError={identifierHasError(param.identifier)}
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
                    { value: "ratio", label: "Ratio" },
                  ]}
                />
              </div>
              <div className={paramFieldSmStyle}>
                <span className={paramLabelStyle}>Default</span>
                {param.type === "boolean" ? (
                  <Switch
                    checked={param.default !== 0}
                    onCheckedChange={(checked) =>
                      updateScenarioParam(param._key, {
                        default: checked ? 1 : 0,
                      })
                    }
                  />
                ) : (
                  <NumberInput
                    size="sm"
                    step={param.type === "integer" ? 1 : 0.001}
                    value={String(param.default)}
                    onChange={(e) => {
                      let val =
                        Number((e.target as HTMLInputElement).value) || 0;
                      if (param.type === "ratio") {
                        val = Math.max(0, Math.min(1, val));
                      }
                      updateScenarioParam(param._key, { default: val });
                    }}
                  />
                )}
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
      <Section title="Parameter Bindings" collapsible defaultOpen>
        <span className={hintStyle}>
          Override the default values of net-level parameters for this scenario.
        </span>
        {parameters.length === 0 ? (
          <span className={emptyStyle}>No parameters defined in the net</span>
        ) : (
          parameters.map((param) => {
            const uri = scenarioSessionId
              ? getScenarioDocumentUri(
                  "scenario-param-override",
                  scenarioSessionId,
                  param.id,
                )
              : undefined;
            const error = getError(uri);
            return (
              <div key={param.id} className={overrideRowStyle}>
                <div className={overrideLabelStyle}>
                  <div className={overrideNameStyle}>{param.name}</div>
                  <div className={overrideVarNameStyle}>
                    {param.variableName}
                  </div>
                </div>
                <CodeEditor
                  singleLine
                  language="typescript"
                  path={uri}
                  value={state.parameterOverrides[param.id] ?? ""}
                  onChange={(v) =>
                    callbacks.onParameterOverridesChange((prev) => ({
                      ...prev,
                      [param.id]: v ?? "",
                    }))
                  }
                  placeholder={param.defaultValue}
                  hasError={!!error}
                  onEditorFocus={() => setFocusedUri(uri ?? null)}
                  onEditorBlur={() => setFocusedUri(null)}
                />
              </div>
            );
          })
        )}
      </Section>

      {/* -- Initial State -------------------------------------------- */}
      <Section
        title="Initial State"
        collapsible
        defaultOpen
        renderHeaderAction={() => (
          <div className={switchLabelStyle}>
            {!state.initialStateAsCode && (
              <div className={switchGroupStyle}>
                <span>Show all places</span>
                <Switch
                  checked={state.showAllPlaces}
                  onCheckedChange={callbacks.onShowAllPlacesChange}
                />
              </div>
            )}
            <div className={switchGroupStyle}>
              <span>Define as code</span>
              <Switch
                checked={state.initialStateAsCode}
                onCheckedChange={callbacks.onInitialStateAsCodeChange}
              />
            </div>
          </div>
        )}
      >
        {state.initialStateAsCode ? (
          <CodeEditor
            language="typescript"
            path={
              scenarioSessionId
                ? getScenarioDocumentUri(
                    "scenario-initial-state-full-code",
                    scenarioSessionId,
                    "",
                  )
                : undefined
            }
            value={state.initialStateCode}
            onChange={(v) => callbacks.onInitialStateCodeChange(v ?? "")}
            height="300px"
          />
        ) : places.length === 0 ? (
          <span className={emptyStyle}>No places defined in the net</span>
        ) : !state.showAllPlaces &&
          !places.some((place) => place.showAsInitialState) ? (
          <span className={emptyStyle}>
            No places marked as &ldquo;Default starting place&rdquo;. Enable
            that flag on a place in the Properties panel, or toggle &ldquo;Show
            all places&rdquo; above.
          </span>
        ) : (
          [...places]
            .filter((place) => state.showAllPlaces || place.showAsInitialState)
            .sort((a, b) => {
              const aP = a.showAsInitialState ? 0 : 1;
              const bP = b.showAsInitialState ? 0 : 1;
              return aP - bP;
            })
            .map((place) => {
              const uri = scenarioSessionId
                ? getScenarioDocumentUri(
                    "scenario-initial-state",
                    scenarioSessionId,
                    place.id,
                  )
                : undefined;
              return (
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
                  documentUri={uri}
                  error={getError(uri)}
                  onFocus={() => setFocusedUri(uri ?? null)}
                  onBlur={() => setFocusedUri(null)}
                />
              );
            })
        )}
      </Section>
    </SectionList>
  );
};

// -- Form body wired to a TanStack form instance ------------------------------

export interface ScenarioFormBodyProps {
  form: ScenarioFormInstance;
  /** Map of type ID → Color */
  typesById: Map<string, Color>;
  /** The net-level parameters */
  parameters: Parameter[];
  /** The net-level places */
  places: Place[];
  /** Unique prefix for element IDs */
  idPrefix?: string;
}

/**
 * Renders the scenario form sections backed by a TanStack form.
 * Subscribes to form values reactively (no useEffect) and wires
 * setters to setFieldValue.
 */
export const ScenarioFormBody = ({
  form,
  typesById,
  parameters,
  places,
  idPrefix,
}: ScenarioFormBodyProps) => {
  const values = useStore(form.store, (state) => state.values);

  const scenarioSessionId = useScenarioLspSession({
    scenarioParams: values.scenarioParams,
    parameterOverrides: values.parameterOverrides,
    initialTokenCounts: values.initialTokenCounts,
    initialStateCode: values.initialStateCode,
    initialStateAsCode: values.initialStateAsCode,
    parameters,
    places,
    typesById,
  });

  return (
    <ScenarioFormSections
      state={values}
      callbacks={{
        onNameChange: (value) => form.setFieldValue("name", value),
        onDescriptionChange: (value) =>
          form.setFieldValue("description", value),
        onScenarioParamsChange: (updater) =>
          form.setFieldValue("scenarioParams", updater),
        onParameterOverridesChange: (updater) =>
          form.setFieldValue("parameterOverrides", updater),
        onInitialTokenCountsChange: (updater) =>
          form.setFieldValue("initialTokenCounts", updater),
        onInitialTokenDataChange: (updater) =>
          form.setFieldValue("initialTokenData", updater),
        onShowAllPlacesChange: (value) =>
          form.setFieldValue("showAllPlaces", value),
        onInitialStateAsCodeChange: (value) =>
          form.setFieldValue("initialStateAsCode", value),
        onInitialStateCodeChange: (value) =>
          form.setFieldValue("initialStateCode", value),
      }}
      parameters={parameters}
      places={places}
      typesById={typesById}
      idPrefix={idPrefix}
      scenarioSessionId={scenarioSessionId}
    />
  );
};

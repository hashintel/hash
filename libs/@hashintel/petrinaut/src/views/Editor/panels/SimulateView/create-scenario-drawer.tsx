import { css } from "@hashintel/ds-helpers/css";
import { use, useState } from "react";
import { TbPlus, TbTrash } from "react-icons/tb";

import { Button } from "../../../../components/button";
import { Drawer } from "../../../../components/drawer";
import { IconButton } from "../../../../components/icon-button";
import { Input } from "../../../../components/input";
import { Section, SectionList } from "../../../../components/section";
import { Select } from "../../../../components/select";
import type { ScenarioParameter } from "../../../../core/types/sdcpn";
import { SDCPNContext } from "../../../../state/sdcpn-context";

// -- Step indicator styles -----------------------------------------------------

const stepIndicatorStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[0]",
  paddingY: "[12px]",
});

const stepCircleStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[24px]",
  height: "[24px]",
  borderRadius: "full",
  fontSize: "xs",
  fontWeight: "semibold",
  flexShrink: 0,
});

const activeStepStyle = css({
  backgroundColor: "neutral.s120",
  color: "neutral.s00",
});

const inactiveStepStyle = css({
  backgroundColor: "[transparent]",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.a20",
  color: "neutral.s80",
});

const stepConnectorStyle = css({
  width: "[24px]",
  height: "[0]",
  borderTopWidth: "[1px]",
  borderTopStyle: "dashed",
  borderTopColor: "neutral.a30",
  marginX: "[4px]",
});

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

const emptyStyle = css({
  fontSize: "sm",
  color: "neutral.s80",
  paddingY: "[4px]",
});

const selectStyle = css({
  width: "[100px]",
  flexShrink: 0,
});

// -- Types --------------------------------------------------------------------

type ScenarioParameterDraft = ScenarioParameter & { _key: number };

// -- Component ----------------------------------------------------------------

interface CreateScenarioDrawerProps {
  open: boolean;
  onClose: () => void;
}

let nextKey = 0;

export const CreateScenarioDrawer = ({
  open,
  onClose,
}: CreateScenarioDrawerProps) => {
  const { petriNetDefinition } = use(SDCPNContext);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Scenario-specific parameters
  const [scenarioParams, setScenarioParams] = useState<
    ScenarioParameterDraft[]
  >([]);

  // Overrides for existing net parameters: parameterId → value string
  const [parameterOverrides, setParameterOverrides] = useState<
    Record<string, string>
  >({});

  // Initial state per place: placeId → value string
  const [initialState, setInitialState] = useState<Record<string, string>>({});

  const addScenarioParam = () => {
    setScenarioParams((prev) => [
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
    setScenarioParams((prev) =>
      prev.map((p) => (p._key === key ? { ...p, ...updates } : p)),
    );
  };

  const removeScenarioParam = (key: number) => {
    setScenarioParams((prev) => prev.filter((p) => p._key !== key));
  };

  return (
    <Drawer.Root open={open} onClose={onClose}>
      <Drawer.Card onClose={onClose}>
        <Drawer.Header description="Initial configurations of tokens that can be quickly loaded in to 'Model' or 'Simulate' mode">
          Create a scenario
        </Drawer.Header>
        <Drawer.Body>
          <div className={stepIndicatorStyle}>
            <div className={`${stepCircleStyle} ${activeStepStyle}`}>1</div>
            <div className={stepConnectorStyle} />
            <div className={`${stepCircleStyle} ${inactiveStepStyle}`}>2</div>
            <div className={stepConnectorStyle} />
            <div className={`${stepCircleStyle} ${inactiveStepStyle}`}>3</div>
          </div>

          <SectionList>
            {/* -- General -------------------------------------------------- */}
            <Section title="General" collapsible defaultOpen>
              <div className={fieldStyle}>
                <label className={labelStyle} htmlFor="scenario-name">
                  Scenario name
                </label>
                <Input
                  id="scenario-name"
                  size="md"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className={fieldStyle}>
                <label className={labelStyle} htmlFor="scenario-description">
                  Description
                </label>
                <textarea
                  id="scenario-description"
                  className={textareaStyle}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
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
              {scenarioParams.length === 0 ? (
                <span className={emptyStyle}>No scenario parameters</span>
              ) : (
                scenarioParams.map((param) => (
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
            <Section title="Parameters" collapsible defaultOpen>
              {petriNetDefinition.parameters.length === 0 ? (
                <span className={emptyStyle}>
                  No parameters defined in the net
                </span>
              ) : (
                petriNetDefinition.parameters.map((param) => (
                  <div key={param.id} className={overrideRowStyle}>
                    <span className={overrideNameStyle}>{param.name}</span>
                    <span className={overrideTypeStyle}>{param.type}</span>
                    <Input
                      size="sm"
                      value={parameterOverrides[param.id] ?? ""}
                      onChange={(e) =>
                        setParameterOverrides((prev) => ({
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
            <Section title="Initial State" collapsible defaultOpen>
              {petriNetDefinition.places.length === 0 ? (
                <span className={emptyStyle}>No places defined in the net</span>
              ) : (
                petriNetDefinition.places.map((place) => (
                  <div key={place.id} className={placeRowStyle}>
                    <span className={placeNameStyle}>{place.name}</span>
                    <Input
                      size="sm"
                      value={initialState[place.id] ?? ""}
                      onChange={(e) =>
                        setInitialState((prev) => ({
                          ...prev,
                          [place.id]: e.target.value,
                        }))
                      }
                      placeholder="0"
                    />
                  </div>
                ))
              )}
            </Section>
          </SectionList>
        </Drawer.Body>
      </Drawer.Card>
      <Drawer.Footer>
        <Button
          variant="secondary"
          colorScheme="neutral"
          size="sm"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button variant="primary" colorScheme="neutral" size="sm">
          Next
        </Button>
      </Drawer.Footer>
    </Drawer.Root>
  );
};

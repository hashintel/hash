import { use, useMemo, useState } from "react";

import { Button } from "../../../../components/button";
import { Drawer } from "../../../../components/drawer";
import type { Color, Scenario } from "../../../../core/types/sdcpn";
import { SDCPNContext } from "../../../../state/sdcpn-context";
import type { ScenarioParameterDraft } from "./scenario-form";
import { ScenarioFormSections, useScenarioLspSession } from "./scenario-form";

// -- Component ----------------------------------------------------------------

interface ViewScenarioDrawerProps {
  open: boolean;
  onClose: () => void;
  scenario: Scenario | undefined;
}

let nextKey = 0;

export const ViewScenarioDrawer = ({
  open,
  onClose,
  scenario,
}: ViewScenarioDrawerProps) => {
  const { petriNetDefinition } = use(SDCPNContext);

  // Re-key state whenever the scenario changes so form values reset
  const scenarioId = scenario?.id ?? null;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scenarioParams, setScenarioParams] = useState<
    ScenarioParameterDraft[]
  >([]);
  const [parameterOverrides, setParameterOverrides] = useState<
    Record<string, string>
  >({});
  const [initialTokenCounts, setInitialTokenCounts] = useState<
    Record<string, string>
  >({});
  const [initialTokenData, setInitialTokenData] = useState<
    Record<string, number[][]>
  >({});
  const [showAllPlaces, setShowAllPlaces] = useState(false);
  const [initialStateAsCode, setInitialStateAsCode] = useState(false);
  const [initialStateCode, setInitialStateCode] = useState("");
  const [loadedScenarioId, setLoadedScenarioId] = useState<string | null>(null);

  // Reset form state when a different scenario is opened
  if (scenarioId !== loadedScenarioId && scenario) {
    setLoadedScenarioId(scenarioId);
    setName(scenario.name);
    setDescription(scenario.description ?? "");
    setScenarioParams(
      scenario.scenarioParameters.map((p) => ({ ...p, _key: nextKey++ })),
    );
    setParameterOverrides(scenario.parameterOverrides);
    setInitialTokenCounts(scenario.initialState);
    setInitialTokenData({});
    setShowAllPlaces(false);
    setInitialStateAsCode(false);
    setInitialStateCode("");
  }

  const typesById = useMemo(() => {
    const map = new Map<string, Color>();
    for (const type of petriNetDefinition.types) {
      map.set(type.id, type);
    }
    return map;
  }, [petriNetDefinition.types]);

  const scenarioSessionId = useScenarioLspSession({
    scenarioParams,
    parameterOverrides,
    initialTokenCounts,
    initialStateCode,
    parameters: petriNetDefinition.parameters,
    places: petriNetDefinition.places,
    typesById,
  });

  return (
    <Drawer.Root open={open} onClose={onClose}>
      <Drawer.Card onClose={onClose}>
        <Drawer.Header>{scenario?.name ?? ""}</Drawer.Header>
        <Drawer.Body>
          <ScenarioFormSections
            state={{
              name,
              description,
              scenarioParams,
              parameterOverrides,
              initialTokenCounts,
              initialTokenData,
              showAllPlaces,
              initialStateAsCode,
              initialStateCode,
            }}
            callbacks={{
              onNameChange: setName,
              onDescriptionChange: setDescription,
              onScenarioParamsChange: setScenarioParams,
              onParameterOverridesChange: setParameterOverrides,
              onInitialTokenCountsChange: setInitialTokenCounts,
              onInitialTokenDataChange: setInitialTokenData,
              onShowAllPlacesChange: setShowAllPlaces,
              onInitialStateAsCodeChange: setInitialStateAsCode,
              onInitialStateCodeChange: setInitialStateCode,
            }}
            parameters={petriNetDefinition.parameters}
            places={petriNetDefinition.places}
            typesById={typesById}
            idPrefix="view-"
            scenarioSessionId={scenarioSessionId}
          />
        </Drawer.Body>
      </Drawer.Card>
      <Drawer.Footer>
        <Button
          variant="secondary"
          colorScheme="neutral"
          size="sm"
          onClick={onClose}
        >
          Close
        </Button>
        <Button variant="primary" colorScheme="neutral" size="sm">
          Save
        </Button>
      </Drawer.Footer>
    </Drawer.Root>
  );
};

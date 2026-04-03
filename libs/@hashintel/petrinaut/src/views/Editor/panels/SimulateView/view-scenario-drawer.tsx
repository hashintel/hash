import { use, useMemo, useState } from "react";

import { Button } from "../../../../components/button";
import { Drawer } from "../../../../components/drawer";
import type { Color, Scenario } from "../../../../core/types/sdcpn";
import { SDCPNContext } from "../../../../state/sdcpn-context";
import type { ScenarioParameterDraft } from "./scenario-form";
import { ScenarioFormSections } from "./scenario-form";

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

  // Initialize form state from scenario data
  const [name, setName] = useState(scenario?.name ?? "");
  const [description, setDescription] = useState(scenario?.description ?? "");
  const [scenarioParams, setScenarioParams] = useState<
    ScenarioParameterDraft[]
  >(() =>
    (scenario?.scenarioParameters ?? []).map((p) => ({
      ...p,
      _key: nextKey++,
    })),
  );
  const [parameterOverrides, setParameterOverrides] = useState<
    Record<string, string>
  >(scenario?.parameterOverrides ?? {});
  const [initialTokenCounts, setInitialTokenCounts] = useState<
    Record<string, string>
  >(scenario?.initialState ?? {});
  const [initialTokenData, setInitialTokenData] = useState<
    Record<string, number[][]>
  >({});
  const [showAllPlaces, setShowAllPlaces] = useState(false);

  const typesById = useMemo(() => {
    const map = new Map<string, Color>();
    for (const type of petriNetDefinition.types) {
      map.set(type.id, type);
    }
    return map;
  }, [petriNetDefinition.types]);

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
            }}
            callbacks={{
              onNameChange: setName,
              onDescriptionChange: setDescription,
              onScenarioParamsChange: setScenarioParams,
              onParameterOverridesChange: setParameterOverrides,
              onInitialTokenCountsChange: setInitialTokenCounts,
              onInitialTokenDataChange: setInitialTokenData,
              onShowAllPlacesChange: setShowAllPlaces,
            }}
            parameters={petriNetDefinition.parameters}
            places={petriNetDefinition.places}
            typesById={typesById}
            idPrefix="view-"
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

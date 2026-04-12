import { css } from "@hashintel/ds-helpers/css";
import { use, useMemo, useState } from "react";

import { Button } from "../../../../components/button";
import { Drawer } from "../../../../components/drawer";
import type { Color } from "../../../../core/types/sdcpn";
import { SDCPNContext } from "../../../../state/sdcpn-context";
import type { ScenarioParameterDraft } from "./scenario-form";
import { ScenarioFormSections, useScenarioLspSession } from "./scenario-form";

const bodyStyle = css({
  overflowY: "auto",
  padding: "5",
  flex: "1",
});

// -- Form component (standalone, no Drawer wrapper) ----------------------------

export const CreateScenarioForm = () => {
  const { petriNetDefinition } = use(SDCPNContext);

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
    <Drawer.Body className={bodyStyle}>
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
        idPrefix="create-"
        scenarioSessionId={scenarioSessionId}
      />
    </Drawer.Body>
  );
};

// -- Drawer wrapper -----------------------------------------------------------

interface CreateScenarioDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const CreateScenarioDrawer = ({
  open,
  onClose,
}: CreateScenarioDrawerProps) => (
  <Drawer.Root open={open} onClose={onClose}>
    <Drawer.Card onClose={onClose}>
      <Drawer.Header description="Initial configurations of tokens that can be quickly loaded in to 'Model' or 'Simulate' mode">
        Create a scenario
      </Drawer.Header>
      <CreateScenarioForm />
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

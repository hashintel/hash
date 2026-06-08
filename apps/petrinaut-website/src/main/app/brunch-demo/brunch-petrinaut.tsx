import { use, useMemo } from "react";

import {
  createJsonDocHandle,
  PETRINAUT_EXTENSION_NAMES,
} from "@hashintel/petrinaut-core";
import { ActualModeContext } from "@hashintel/petrinaut/react";
import { Petrinaut, type ViewportAction } from "@hashintel/petrinaut/ui";

import { BrunchStatusPage } from "./brunch-status-page";

export const BrunchPetrinaut = ({
  viewportActions,
}: {
  viewportActions: ViewportAction[];
}) => {
  const actualMode = use(ActualModeContext);
  const definition = actualMode.available ? actualMode.definition : null;
  const initialState = actualMode.available ? actualMode.initialState : null;
  const source = actualMode.available ? actualMode.source : null;

  const handle = useMemo(() => {
    if (!definition || !source) {
      return null;
    }

    return createJsonDocHandle({
      id: source.runId ? `brunch-${source.runId}` : "brunch-actual",
      initial: definition,
      capabilities: {
        readonly: true,
        disabledExtensions: PETRINAUT_EXTENSION_NAMES,
      },
      historyLimit: 0,
    });
  }, [definition, source]);

  if (!actualMode.available) {
    return (
      <BrunchStatusPage
        title="Brunch stream unavailable"
        body="Actual mode requires a Brunch stream endpoint."
      />
    );
  }

  if (actualMode.status === "error") {
    return (
      <BrunchStatusPage
        title="Could not load Brunch run"
        body={actualMode.error ?? "The Brunch stream returned an error."}
        endpoint={actualMode.source.endpoint}
      />
    );
  }

  if (!definition || !initialState || !handle) {
    return (
      <BrunchStatusPage
        title="Connecting to Brunch"
        body="Waiting for the Petri net definition and initial state."
        endpoint={actualMode.source.endpoint}
      />
    );
  }

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <Petrinaut
        handle={handle}
        hideNetManagementControls="except-title"
        readonly
        setTitle={() => {}}
        title={
          actualMode.title ??
          (actualMode.source.runId
            ? `Brunch run ${actualMode.source.runId}`
            : "Brunch run")
        }
        viewportActions={viewportActions}
      />
    </div>
  );
};

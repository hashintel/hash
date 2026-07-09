import { use, useState } from "react";

import {
  createJsonDocHandle,
  PETRINAUT_EXTENSION_NAMES,
} from "@hashintel/petrinaut-core";
import { ActualModeContext } from "@hashintel/petrinaut/react";
import { Petrinaut, type ViewportAction } from "@hashintel/petrinaut/ui";

import { BrunchStatusPage } from "./brunch-status-page";

import type {
  ActualModeSource,
  PetrinautDocHandle,
  SDCPN,
} from "@hashintel/petrinaut-core";

const getSourceKey = (source: ActualModeSource): string =>
  `${source.kind}:${source.endpoint}:${source.runId ?? ""}`;

const BrunchPetrinautWithHandle = ({
  definition,
  source,
  title,
  viewportActions,
}: {
  definition: SDCPN;
  source: ActualModeSource;
  title: string;
  viewportActions: ViewportAction[];
}) => {
  const [handle] = useState<PetrinautDocHandle>(() =>
    createJsonDocHandle({
      id: source.runId ? `brunch-${source.runId}` : "brunch-actual",
      initial: definition,
      capabilities: {
        readonly: true,
        disabledExtensions: PETRINAUT_EXTENSION_NAMES,
      },
      historyLimit: 0,
    }),
  );

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <Petrinaut
        handle={handle}
        hideNetManagementControls="except-title"
        readonly
        setTitle={() => {}}
        title={title}
        viewportActions={viewportActions}
      />
    </div>
  );
};

export const BrunchPetrinaut = ({
  viewportActions,
}: {
  viewportActions: ViewportAction[];
}) => {
  const actualMode = use(ActualModeContext);
  const definition = actualMode.available ? actualMode.definition : null;
  const initialState = actualMode.available ? actualMode.initialState : null;
  const source = actualMode.available ? actualMode.source : null;
  const sourceKey = source ? getSourceKey(source) : null;

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

  if (!definition || !initialState || !source || !sourceKey) {
    return (
      <BrunchStatusPage
        title="Connecting to Brunch"
        body={
          actualMode.error ??
          "Waiting for the Petri net definition and initial state."
        }
        endpoint={actualMode.source.endpoint}
      />
    );
  }

  return (
    <BrunchPetrinautWithHandle
      definition={definition}
      key={sourceKey}
      source={source}
      title={
        actualMode.title ??
        (source.runId ? `Brunch run ${source.runId}` : "Brunch run")
      }
      viewportActions={viewportActions}
    />
  );
};

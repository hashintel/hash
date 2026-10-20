import { use, useState } from "react";

import {
  createJsonDocHandle,
  PETRINAUT_EXTENSION_NAMES,
} from "@hashintel/petrinaut-core";
import {
  ActualModeContext,
  type PetrinautNavigationController,
} from "@hashintel/petrinaut/react";
import { Petrinaut } from "@hashintel/petrinaut/ui";

import { StatusPage } from "../../../shared/status-page";
import { sentryFeedbackPlugin } from "../plugins/sentry-feedback/plugin";

import type { PetrinautDocHandle, SDCPN } from "@hashintel/petrinaut-core";

const BrunchPetrinautWithHandle = ({
  definition,
  navigation,
  runId,
  title,
}: {
  definition: SDCPN;
  navigation: PetrinautNavigationController;
  runId?: string;
  title: string;
}) => {
  const [handle] = useState<PetrinautDocHandle>(() =>
    createJsonDocHandle({
      id: runId ? `brunch-${runId}` : "brunch-actual",
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
        navigation={navigation}
        plugins={[sentryFeedbackPlugin]}
        readonly
        setTitle={() => {}}
        title={title}
      />
    </div>
  );
};

export const BrunchPetrinaut = ({
  endpoint,
  navigation,
  runId,
}: {
  endpoint: string;
  navigation: PetrinautNavigationController;
  runId?: string;
}) => {
  const actualMode = use(ActualModeContext);
  const definition = actualMode.available ? actualMode.definition : null;
  const initialState = actualMode.available ? actualMode.initialState : null;

  if (!actualMode.available) {
    return (
      <StatusPage
        title="Brunch stream unavailable"
        body="Actual mode requires a Brunch stream endpoint."
      />
    );
  }

  if (actualMode.status === "error") {
    return (
      <StatusPage
        title="Could not load Brunch run"
        body={actualMode.error ?? "The Brunch stream returned an error."}
        detail={endpoint}
      />
    );
  }

  if (!definition || !initialState) {
    return (
      <StatusPage
        title="Connecting to Brunch"
        body={
          actualMode.error ??
          "Waiting for the Petri net definition and initial state."
        }
        detail={endpoint}
      />
    );
  }

  return (
    <BrunchPetrinautWithHandle
      definition={definition}
      key={actualMode.source.id}
      navigation={navigation}
      runId={runId}
      title={actualMode.title ?? (runId ? `Brunch run ${runId}` : "Brunch run")}
    />
  );
};

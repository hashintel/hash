import { useEffect, useState } from "react";

import { sirModel } from "@hashintel/petrinaut-core/examples";
import { createRustPetrinaut } from "@hashintel/petrinaut-core/rust";

import { Petrinaut } from "./petrinaut";

import type { Petrinaut as Instance } from "@hashintel/petrinaut-core";
import type { Meta, StoryObj } from "@storybook/react-vite";

type LoadingState =
  | { status: "loading" }
  | { status: "ready"; instance: Instance }
  | { status: "error"; message: string };

const RustInstanceEditor = () => {
  const [state, setState] = useState<LoadingState>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    let instance: Instance | undefined;
    void createRustPetrinaut({ initial: sirModel.petriNetDefinition })
      .then((created) => {
        if (cancelled) {
          created.dispose();
          return;
        }
        instance = created;
        setState({ status: "ready", instance: created });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: "error", message: String(error) });
        }
      });
    return () => {
      cancelled = true;
      instance?.dispose();
    };
  }, []);
  if (state.status === "loading") {
    return <p>Loading Rust document engine…</p>;
  }
  if (state.status === "error") {
    return <p role="alert">{state.message}</p>;
  }
  return (
    <div style={{ height: "100vh" }}>
      <Petrinaut
        instance={state.instance}
        title="Rust document engine"
        hideNetManagementControls="all"
      />
    </div>
  );
};

const meta = {
  title: "Petrinaut/Rust instance",
  component: RustInstanceEditor,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof RustInstanceEditor>;
export default meta;
export const Editor: StoryObj<typeof meta> = {};

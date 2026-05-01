import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useMemo, useState } from "react";

import { createJsonDocHandle } from "./core/handle";
import type { SDCPN } from "./core/types/sdcpn";
import { sirModel } from "./examples/sir-model";
import { PetrinautStoryProvider } from "./petrinaut-story-provider";
import { PetrinautNext } from "./ui/petrinaut-next";

const emptySDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

const meta = {
  title: "Petrinaut",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div style={{ height: "100vh", width: "100vw" }}>
      <PetrinautStoryProvider />
    </div>
  ),
};

export const Readonly: Story = {
  render: () => (
    <div style={{ height: "100vh", width: "100vw" }}>
      <PetrinautStoryProvider readonly />
    </div>
  ),
};

export const HiddenNetManagement: Story = {
  render: () => (
    <div style={{ height: "100vh", width: "100vw" }}>
      <PetrinautStoryProvider
        initialTitle={sirModel.title}
        initialDefinition={sirModel.petriNetDefinition}
        hideNetManagementControls
      />
    </div>
  ),
};

const HandleSpikeRender = ({
  initial,
  initialTitle,
}: {
  initial: SDCPN;
  initialTitle: string;
}) => {
  const handle = useMemo(
    () => createJsonDocHandle({ id: "spike-net", initial }),
    [initial],
  );

  const [patchLog, setPatchLog] = useState<string[]>([]);
  const [title, setTitle] = useState(initialTitle);

  useEffect(() => {
    return handle.subscribe((event) => {
      const summary = (event.patches ?? []).map(
        (p) => `${p.op} /${p.path.join("/")}`,
      );
      setPatchLog((prev) => [...summary, ...prev].slice(0, 12));
    });
  }, [handle]);

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
      <PetrinautNext
        handle={handle}
        title={title}
        setTitle={setTitle}
        hideNetManagementControls
      />
      <pre
        style={{
          position: "absolute",
          right: 8,
          bottom: 8,
          maxWidth: 360,
          maxHeight: 220,
          overflow: "auto",
          background: "rgba(0, 0, 0, 0.7)",
          color: "lime",
          fontSize: 11,
          padding: 8,
          borderRadius: 4,
          margin: 0,
          pointerEvents: "none",
        }}
      >
        {`Last ${patchLog.length} patches (newest first):\n` +
          (patchLog.length === 0 ? "(no mutations yet)" : patchLog.join("\n"))}
      </pre>
    </div>
  );
};

export const HandleSpike: Story = {
  render: () => (
    <HandleSpikeRender initial={emptySDCPN} initialTitle="Handle spike" />
  ),
};

export const HandleSpikeWithSir: Story = {
  render: () => (
    <HandleSpikeRender
      initial={sirModel.petriNetDefinition}
      initialTitle={sirModel.title}
    />
  ),
};

import { Select, Tooltip } from "@hashintel/ds-components";

import type { ExperimentComputeBackend } from "../../../../../../react/experiments/context";
import type { GpuAvailability } from "./use-gpu-availability";

export const ComputeBackendSelect = ({
  value,
  onChange,
  gpu,
  webGpuAvailable,
}: {
  value: ExperimentComputeBackend;
  onChange: (value: ExperimentComputeBackend) => void;
  gpu: GpuAvailability;
  webGpuAvailable: boolean;
}) => (
  <div
    data-backend-state={
      gpu.pending ? "pending" : gpu.available ? "available" : "unavailable"
    }
  >
    <Tooltip
      content={
        gpu.reason
          ? `GPU unavailable: ${gpu.reason}`
          : "Choose the backend that will run this experiment."
      }
    >
      <Select<ExperimentComputeBackend>
        required
        aria-label="Experiment backend"
        size="sm"
        value={value}
        onChange={onChange}
        items={[
          { value: "cpu", text: "CPU (TypeScript)" },
          {
            value: "wasm",
            text: "Wasm (Rust, experimental)",
            disabled: typeof WebAssembly === "undefined",
          },
          ...(webGpuAvailable
            ? [
                {
                  value: "webgpu" as const,
                  text: "GPU (WebGPU)",
                  disabled: !gpu.available,
                },
              ]
            : []),
        ]}
      />
    </Tooltip>
  </div>
);

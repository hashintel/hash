/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PetrinautOptimizationContext } from "../../../../../../react/optimization-context";
import { ExperimentOptimizationToggle } from "./experiment-optimization-toggle";

import type { PetrinautOptimization } from "@hashintel/petrinaut-core";

const optimization: PetrinautOptimization = {
  async *optimize() {
    yield 1;
  },
};
const noop = () => {};

afterEach(cleanup);

describe("ExperimentOptimizationToggle", () => {
  it("is hidden without an optimization provider", () => {
    render(<ExperimentOptimizationToggle enabled={false} onChange={noop} />);

    expect(screen.queryByRole("checkbox", { name: "Optimization" })).toBeNull();
  });

  it("is shown with an optimization provider", () => {
    render(
      <PetrinautOptimizationContext value={optimization}>
        <ExperimentOptimizationToggle enabled={false} onChange={noop} />
      </PetrinautOptimizationContext>,
    );

    const checkbox = screen.getByRole("checkbox", { name: "Optimization" });
    expect((checkbox as HTMLInputElement).checked).toBe(false);
  });
});

import { PetrinautOptimizationContext } from "@hashintel/petrinaut/react";

import type { PetrinautOptimization } from "@hashintel/petrinaut-core";
import type { FC, PropsWithChildren } from "react";

const wait = (durationMs: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, durationMs));

const fakeOptimization: PetrinautOptimization = {
  async *optimize() {
    for (let value = 0; value < Number.MAX_SAFE_INTEGER; value += 1) {
      yield value;
      await wait(1_000);
    }
  },
};

export const FakeOptimizationProvider: FC<PropsWithChildren> = ({
  children,
}) => (
  <PetrinautOptimizationContext value={fakeOptimization}>
    {children}
  </PetrinautOptimizationContext>
);

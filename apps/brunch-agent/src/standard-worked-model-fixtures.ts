import {
  parseWorkedModelFixture,
  type WorkedModelFixture,
} from "./worked-model-store.ts";

/**
 * Build-packaged, locally produced fixture bundles.
 *
 * Inventory enters this registry only after its persona-developed session,
 * workpiece and net are reviewed as one versioned artifact.
 */
const fixtureModules = import.meta.glob("./worked-model-fixtures/*.json", {
  eager: true,
  import: "default",
});

export const standardWorkedModelFixtures: readonly WorkedModelFixture[] =
  Object.entries(fixtureModules)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, fixture]) => parseWorkedModelFixture(fixture));

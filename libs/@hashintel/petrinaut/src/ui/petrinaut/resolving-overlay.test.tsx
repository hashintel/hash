/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  createJsonDocHandle,
  createPetrinaut,
  type Library,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { PetrinautDocumentProvider } from "../../react/petrinaut-provider-layers";
import { logisticsLibrary } from "../stories/libraries-story-fixtures";
import { ResolvingOverlay } from "./resolving-overlay";

afterEach(cleanup);

const importing: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  imports: [{ id: logisticsLibrary.id }],
};

const netManagement = {
  title: "Line",
  existingNets: [],
  createNewNet: () => {},
  loadPetriNet: () => {},
};

/** The overlay over a document that imports the library, resolved as `resolveImport` says. */
const renderOverlay = (
  resolveImport: (id: string) => Library | Promise<Library>,
  initial: SDCPN = importing,
) => {
  const instance = createPetrinaut({
    document: createJsonDocHandle({ initial }),
    resolveImport,
    libraries: [logisticsLibrary.id],
  });
  return render(
    <PetrinautDocumentProvider
      instance={instance}
      netManagement={netManagement}
    >
      <ResolvingOverlay />
    </PetrinautDocumentProvider>,
  );
};

describe("the resolving overlay", () => {
  it("covers the editor while an import of the document resolves, and lifts when its library arrives", async () => {
    let arrive: (library: Library) => void = () => {};
    renderOverlay(
      () =>
        new Promise((resolve) => {
          arrive = resolve;
        }),
    );

    expect(screen.getByRole("status").textContent).toBe("Resolving");

    await act(async () => {
      arrive(logisticsLibrary);
      await Promise.resolve();
    });

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("never shows for a library that is in memory", () => {
    renderOverlay(() => logisticsLibrary);

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not show for a library on offer that the document does not import", () => {
    renderOverlay(() => new Promise(() => {}), { ...importing, imports: [] });

    expect(screen.queryByRole("status")).toBeNull();
  });
});

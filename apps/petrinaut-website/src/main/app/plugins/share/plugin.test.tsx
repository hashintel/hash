/** @vitest-environment jsdom */
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { defaultPetrinautNavigationState } from "@hashintel/petrinaut/react";

import { prepareSnapshot } from "../../../../sharing/snapshot-client";
import { renderEditorWith } from "../_shared/testing/render-editor-with";
import { sharePlugin } from "./plugin";

await vi.hoisted(async () => {
  const { installPetrinautDomShims } =
    await import("../../shared/petrinaut-jsdom");
  installPetrinautDomShims();
});

vi.mock(
  import("../../../../sharing/snapshot-client"),
  async (importOriginal) => ({
    ...(await importOriginal()),
    prepareSnapshot: vi.fn().mockResolvedValue("v1.br.encoded"),
  }),
);

afterEach(cleanup);

test("shares the document and the current view from the top bar", async () => {
  const { handle } = renderEditorWith([sharePlugin], {
    navigation: {
      state: { ...defaultPetrinautNavigationState, mode: "simulate" },
      onNavigate: () => {},
    },
    title: "SIR model",
  });

  fireEvent.click(await screen.findByRole("button", { name: "Share" }));

  expect(
    await screen.findByDisplayValue(
      `${window.location.origin}/share?mode=simulate#v1.br.encoded`,
    ),
  ).toBeTruthy();
  expect(vi.mocked(prepareSnapshot).mock.calls[0]?.[0]).toEqual({
    title: "SIR model",
    definition: handle.doc(),
  });
});

/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { createJsonDocHandle } from "@hashintel/petrinaut-core";

import { ReadonlyDocumentPage } from "./readonly-document-page";

import type { PetrinautProps } from "@hashintel/petrinaut/ui";

await vi.hoisted(async () => {
  const { installPetrinautDomShims } =
    await import("../main/app/shared/petrinaut-jsdom");
  installPetrinautDomShims();
});

const editorProps = vi.hoisted(() => ({
  current: undefined as PetrinautProps | undefined,
}));
vi.mock(import("@hashintel/petrinaut/ui"), async (importOriginal) => ({
  ...(await importOriginal()),
  Petrinaut: (props: PetrinautProps) => {
    editorProps.current = props;
    return null;
  },
}));

afterEach(cleanup);

test("opens the document read-only, with Make a local copy and no Share", () => {
  render(
    <ReadonlyDocumentPage
      handle={createJsonDocHandle({
        initial: { places: [], transitions: [] },
        capabilities: { readonly: true },
      })}
      title="Shared SIR"
      search={{}}
      onSearchChange={() => {}}
    />,
  );

  expect(editorProps.current).toMatchObject({
    hideNetManagementControls: "except-title",
    readonly: true,
    title: "Shared SIR",
  });
  expect(
    editorProps.current?.plugins?.map((plugin) => plugin.manifest.id),
  ).toEqual(["website.local-copy"]);
});

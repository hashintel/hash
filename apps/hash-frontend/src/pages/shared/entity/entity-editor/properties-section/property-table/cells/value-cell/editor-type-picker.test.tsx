// @vitest-environment jsdom
import { ThemeProvider } from "@mui/material";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { theme } from "@hashintel/design-system/theme";

import { EditorTypePicker } from "./editor-type-picker";

import type { ClosedDataType, VersionedUrl } from "@blockprotocol/type-system";
import type { ClosedDataTypeDefinition } from "@local/hash-graph-sdk/ontology";

const textDataTypeId =
  "https://hash.ai/@h/types/data-type/text/v/1" as VersionedUrl;

const textDataType: ClosedDataTypeDefinition = {
  parents: [],
  schema: {
    $id: textDataTypeId,
    abstract: false,
    allOf: [{ type: "string" }],
    description: "An ordered sequence of characters",
    label: {},
    title: "Text",
  } as unknown as ClosedDataType,
};

vi.mock("../../../../entity-editor-context", () => ({
  useEntityEditor: () => ({
    closedMultiEntityTypesDefinitions: {
      dataTypes: { [textDataTypeId]: textDataType },
    },
  }),
}));

const scrollIntoView = vi.fn();

beforeAll(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    disconnect() {}

    observe() {}

    unobserve() {}
  } as unknown as typeof ResizeObserver;
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
});

describe("EditorTypePicker", () => {
  afterEach(cleanup);

  it("reveals the already-selected type without scrolling its ancestors", async () => {
    render(
      <ThemeProvider theme={theme}>
        <EditorTypePicker
          expectedTypes={[textDataType]}
          onTypeChange={vi.fn()}
          selectedDataTypeId={textDataTypeId}
        />
      </ThemeProvider>,
    );

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());

    /**
     * The picker is opened from a fixed-position overlay, which does not move with the document.
     * Any option in the menu is therefore already on screen, and asking to align it to the top of
     * the document would scroll the page out from under the overlay.
     */
    for (const [options] of scrollIntoView.mock.calls) {
      expect(options).toMatchObject({ block: "nearest" });
    }
  });
});

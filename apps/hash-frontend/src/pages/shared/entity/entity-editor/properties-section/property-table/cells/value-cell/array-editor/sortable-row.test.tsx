// @vitest-environment jsdom
import { ThemeProvider } from "@mui/material";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { theme } from "@hashintel/design-system/theme";

import { SortableRow } from "./sortable-row";

import type { ClosedDataType } from "@blockprotocol/type-system";

const booleanDataType = {
  $id: "https://hash.ai/@h/types/data-type/boolean/v/1",
  abstract: false,
  allOf: [{ type: "boolean" }],
  description: "A True or False value",
  label: {},
  title: "Boolean",
} as unknown as ClosedDataType;

describe("SortableRow", () => {
  afterEach(cleanup);

  it("saves the new value when a boolean is toggled", () => {
    const onSaveChanges = vi.fn();

    render(
      <ThemeProvider theme={theme}>
        <SortableRow
          editing={false}
          expectedTypes={[]}
          isLastRow
          item={{
            dataType: booleanDataType,
            id: "0_true",
            index: 0,
            value: true,
          }}
          onDiscardChanges={vi.fn()}
          onSaveChanges={onSaveChanges}
          readonly={false}
          selected
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText("Change"));

    expect(onSaveChanges).toHaveBeenCalledWith(0, false);
    expect(screen.getByText("False")).toBeDefined();
  });
});

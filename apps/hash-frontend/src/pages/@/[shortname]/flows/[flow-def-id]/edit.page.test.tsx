// @vitest-environment jsdom
import { ThemeProvider } from "@mui/material";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { theme } from "@hashintel/design-system/theme";

import FlowEditorPage from "./edit.page";

import type { FlowDefinitionToEdit } from "../../../../shared/use-flow-definitions";
import type { EntityEditionId } from "@blockprotocol/type-system";

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: { "flow-def-id": "7f9d2b1e-3c4a-4e5f-8a6b-9c0d1e2f3a4b" },
    push: vi.fn(),
  }),
}));

vi.mock("../../shared/use-route-namespace", () => ({
  useRouteNamespace: () => ({
    loading: false,
    routeNamespace: {
      webId: "0b5a5c4c-6d4d-4cd8-9d5e-2f2b0f7a6a11",
      shortname: "alice",
    },
  }),
}));

vi.mock("../../../../shared/use-flow-definitions", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useFlowDefinitionToEdit: (): {
    flow: FlowDefinitionToEdit;
    loading: boolean;
  } => ({
    flow: {
      flowDefinition: {
        name: "Someone else's flow",
        description: "",
        inputs: [],
        steps: [],
        outputs: [],
      },
      editionId: "edition-1" as EntityEditionId,
      userCanUpdate: false,
    },
    loading: false,
  }),
}));

describe("FlowEditorPage", () => {
  afterEach(cleanup);

  it("refuses a flow the user can't update", () => {
    render(
      <ThemeProvider theme={theme}>
        <FlowEditorPage />
      </ThemeProvider>,
    );

    expect(screen.getByText("You can't edit this flow")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Back to flows/ })).toBeTruthy();
    expect(screen.queryByText("Someone else's flow")).toBeNull();
  });
});

// @vitest-environment jsdom
import { ThemeProvider } from "@mui/material";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { theme } from "@hashintel/design-system/theme";
import { flowDefinitionIds } from "@local/hash-isomorphic-utils/flows/flow-definition-ids";

import FlowEditorPage from "./edit.page";

import type { FlowDefinitionToEdit } from "../../../../shared/use-flow-definitions";
import type { EntityEditionId } from "@blockprotocol/type-system";

const codeFlowUuid = vi.hoisted(() => "113ce2ec-6a12-56b6-b495-072475889b37");

vi.mock("next/router", () => ({
  useRouter: () => ({ query: { "flow-def-id": codeFlowUuid }, push: vi.fn() }),
}));

vi.mock("../../shared/use-route-namespace", () => ({
  useRouteNamespace: () => ({
    loading: false,
    routeNamespace: { webId: "0b5a5c4c-6d4d-4cd8-9d5e-2f2b0f7a6a11" },
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
        name: "Get Historical Flights",
        description: "",
        inputs: [],
        steps: [],
        outputs: [],
      },
      editionId: "edition-1" as EntityEditionId,
      userCanUpdate: true,
    },
    loading: false,
  }),
}));

describe("FlowEditorPage", () => {
  afterEach(cleanup);

  it("refuses a flow defined in code, even when the user can update it", () => {
    expect(codeFlowUuid).toBe(flowDefinitionIds.historicalFlights);

    render(
      <ThemeProvider theme={theme}>
        <FlowEditorPage />
      </ThemeProvider>,
    );

    expect(screen.getByText("This flow can't be edited")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Back to flows/ })).toBeTruthy();
    expect(screen.queryByText("Get Historical Flights")).toBeNull();
  });
});

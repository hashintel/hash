// @vitest-environment jsdom
import { ThemeProvider } from "@mui/material";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Buffer } from "buffer/";
import { afterEach, expect, it, vi } from "vitest";

import { DATA_TYPE_META_SCHEMA } from "@blockprotocol/type-system";
import { theme } from "@hashintel/design-system/theme";

import { CreateDataTypeForm } from "./create-data-type-form";

import type * as ApolloClient from "@apollo/client";
import type { DataType } from "@blockprotocol/type-system";

const { catalogue, push, queryDataTypes } = vi.hoisted(() => ({
  catalogue: {
    dataTypes: null as Record<string, { schema: DataType }> | null,
  },
  push: vi.fn<(url: string) => Promise<boolean>>(),
  queryDataTypes: vi.fn(),
}));

vi.mock("@apollo/client", async (importOriginal) => ({
  ...(await importOriginal<typeof ApolloClient>()),
  useLazyQuery: () => [queryDataTypes],
}));
vi.mock("next/router", () => ({ useRouter: () => ({ push }) }));
vi.mock("./data-types-context", () => ({
  useDataTypesContext: () => catalogue,
}));
vi.mock("./auth-info-context", () => ({
  useAuthenticatedUser: () => ({ authenticatedUser: { memberOf: [] } }),
}));
vi.mock("./slide-stack", () => ({
  useSlideStack: () => ({ closeSlideStack: vi.fn() }),
}));
vi.mock("./workspace-context", async () => {
  const { createContext } = await import("react");
  return {
    WorkspaceContext: createContext({
      activeWorkspace: { shortname: "alice" },
    }),
  };
});

afterEach(cleanup);

it("waits for the parent and rejects a submission started before it loaded", async () => {
  const parentId = "https://example.com/@alice/types/data-type/number/v/1";
  const validationResult = { data: { queryDataTypes: { dataTypes: [] } } };
  let finishValidation: (() => void) | undefined;
  queryDataTypes.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishValidation = () => resolve(validationResult);
      }),
  );

  const renderForm = () => (
    <ThemeProvider theme={theme}>
      <CreateDataTypeForm
        initialData={{
          extendsDataTypeId: parentId,
          title: "Custom Number",
          description: "A custom numeric data type.",
        }}
        onCancel={vi.fn()}
      />
    </ThemeProvider>
  );
  const { rerender } = render(renderForm());
  const formElement = screen.getByTestId("data-type-creation-form");
  expect(formElement.querySelector('button[type="submit"]')).toHaveProperty(
    "disabled",
    true,
  );

  fireEvent.submit(formElement);
  await waitFor(() => expect(queryDataTypes).toHaveBeenCalledOnce());

  catalogue.dataTypes = {
    [parentId]: {
      schema: {
        $schema: DATA_TYPE_META_SCHEMA,
        kind: "dataType",
        $id: parentId,
        title: "Number",
        description: "A numeric value.",
        abstract: false,
        type: "number",
      },
    },
  };
  rerender(renderForm());
  act(() => finishValidation?.());
  const createButton = await screen.findByRole("button", {
    name: "Create new data type",
  });
  expect(createButton).toHaveProperty("disabled", false);
  expect(push).not.toHaveBeenCalled();

  queryDataTypes.mockResolvedValue(validationResult);
  push.mockResolvedValue(true);
  fireEvent.click(createButton);
  await waitFor(() => expect(push).toHaveBeenCalledOnce());

  const drafts = push.mock.calls.map(([destination]) => {
    const draft = new URL(destination).searchParams.get("draft");
    return JSON.parse(Buffer.from(draft ?? "", "base64").toString());
  });
  expect(drafts).toEqual([
    expect.objectContaining({
      type: "number",
      allOf: [{ $ref: parentId }],
      title: "Custom Number",
    }),
  ]);
});

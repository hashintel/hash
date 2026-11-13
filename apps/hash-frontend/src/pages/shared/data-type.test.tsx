// @vitest-environment jsdom
import { MockedProvider } from "@apollo/client/testing";
import { Box } from "@mui/material";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useFormContext } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeOntologyTypeVersion } from "@blockprotocol/type-system";

import {
  createDataTypeMutation,
  queryDataTypeSubgraphQuery,
  updateDataTypeMutation,
} from "../../graphql/queries/ontology/data-type.queries";
import { DataType } from "./data-type";
import { DataTypesContext, useDataTypesContext } from "./data-types-context";

import type { DataTypeFormData } from "./data-type/data-type-form";
import type { DataTypesContextValue } from "./data-types-context";
import type { DataTypeWithMetadata, WebId } from "@blockprotocol/type-system";
import type * as MuiSystem from "@mui/system";
import type { PropsWithChildren } from "react";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/router", () => ({ useRouter: () => ({ push }) }));
vi.mock("next-seo", () => ({ NextSeo: () => null }));
vi.mock("@mui/system", async (importOriginal) => ({
  ...(await importOriginal<typeof MuiSystem>()),
  GlobalStyles: () => null,
}));
vi.mock("@blockprotocol/graph/stdlib", () => ({
  getRoots: (types: unknown) => types,
}));
vi.mock("@local/hash-graph-sdk/data-type", () => ({
  deserializeQueryDataTypeSubgraphResponse: (subgraph: unknown) => ({
    subgraph,
  }),
}));
vi.mock("../../shared/use-user-permissions-on-data-type", () => ({
  useUserPermissionsOnDataType: () => ({
    loading: false,
    userPermissions: { edit: true },
  }),
}));
vi.mock("./top-context-bar", () => ({ TopContextBar: () => null }));
vi.mock("./slide-stack", () => ({
  useSlideStack: () => ({ pushToSlideStack: vi.fn() }),
}));
vi.mock("./shared/type-editor-skeleton", () => ({
  TypeEditorSkeleton: () => <Box>Loading editor</Box>,
}));
vi.mock("./shared/type-editor-styling", () => ({
  TypeDefinitionContainer: ({ children }: PropsWithChildren) => children,
}));
vi.mock("./shared/type-header-container-styles", () => ({
  typeHeaderContainerStyles: {},
}));
vi.mock("./entity-type-page/edit-bar-type-editor", () => ({
  EditBarTypeEditor: () => (
    <Box component="button" type="submit">
      Save type
    </Box>
  ),
}));
vi.mock("./data-type/data-type-header", () => ({
  DataTypeHeader: () => {
    const { register } = useFormContext<DataTypeFormData>();
    return <Box component="input" aria-label="Title" {...register("title")} />;
  },
}));
vi.mock("./data-type/data-type-parents", () => ({
  DataTypesParents: () => null,
}));
vi.mock("./data-type/data-type-constraints", () => ({
  DataTypeConstraints: () => null,
}));
vi.mock("./data-type/data-type-labels", () => ({ DataTypeLabels: () => null }));
vi.mock("./data-type/shared/inherited-constraints-provider", () => ({
  InheritedConstraintsProvider: ({ children }: PropsWithChildren) => children,
}));
vi.mock("./data-type/data-type-conversions", () => ({
  DataTypeConversions: () => {
    const { dataTypes } = useDataTypesContext();
    if (dataTypes === null) {
      throw new Error("Conversion targets are unavailable");
    }
    return <Box component="input" aria-label="Conversion" defaultValue="1" />;
  },
}));

const dataType = (version: number) =>
  ({
    schema: {
      $id: `https://hash.ai/@test/types/data-type/length/v/${version}`,
      $schema:
        "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
      kind: "dataType",
      title: "Length",
      description: "Test length",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
    },
    metadata: {
      conversions: {},
      recordId: {
        baseUrl: "https://hash.ai/@test/types/data-type/length/",
        version: makeOntologyTypeVersion({ major: version }),
      },
    },
  }) as unknown as DataTypeWithMetadata;

const loadedContext = (): DataTypesContextValue => ({
  dataTypes: { [dataType(1).schema.$id]: dataType(1) },
  latestDataTypes: { [dataType(1).metadata.recordId.baseUrl]: dataType(1) },
  loading: false,
  refetch: vi.fn().mockResolvedValue(true),
  onDataTypeSaved: vi.fn(),
});

describe("data type editor catalogue synchronization", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("waits for the initial catalogue and preserves conversion input during refresh", () => {
    const context = loadedContext();
    const view = (value: DataTypesContextValue) => (
      <MockedProvider>
        <DataTypesContext.Provider value={value}>
          <DataType
            draftNewDataType={dataType(1)}
            requestedVersion={null}
            onDataTypeUpdated={vi.fn()}
          />
        </DataTypesContext.Provider>
      </MockedProvider>
    );
    const { rerender } = render(
      view({
        ...context,
        dataTypes: null,
        latestDataTypes: null,
        loading: true,
      }),
    );
    expect(screen.getByText("Loading editor")).toBeTruthy();
    expect(screen.queryByLabelText("Conversion")).toBeNull();
    rerender(view(context));
    const input = screen.getByLabelText<HTMLInputElement>("Conversion");
    fireEvent.change(input, { target: { value: "42" } });
    rerender(view({ ...context, loading: true }));
    expect(screen.getByLabelText("Conversion")).toBe(input);
    expect(input.value).toBe("42");
    expect(screen.queryByText("Loading editor")).toBeNull();
  });

  it.each([true, false])(
    "publishes the confirmed mutation result to the catalogue (draft: %s)",
    async (isDraft) => {
      const context = loadedContext();
      const existing = dataType(1);
      const saved = dataType(isDraft ? 1 : 2);
      const updated = vi.fn();
      render(
        <MockedProvider
          mocks={[
            {
              request: { query: queryDataTypeSubgraphQuery },
              variableMatcher: () => true,
              result: { data: { queryDataTypeSubgraph: [existing] } },
            },
            {
              request: {
                query: isDraft
                  ? createDataTypeMutation
                  : updateDataTypeMutation,
              },
              variableMatcher: () => true,
              result: {
                data: isDraft
                  ? { createDataType: saved }
                  : { updateDataType: saved },
              },
            },
          ]}
        >
          <DataTypesContext.Provider value={context}>
            <DataType
              draftNewDataType={isDraft ? existing : undefined}
              dataTypeBaseUrl={existing.metadata.recordId.baseUrl}
              requestedVersion={existing.metadata.recordId.version}
              webId={"test-web" as WebId}
              onDataTypeUpdated={updated}
            />
          </DataTypesContext.Provider>
        </MockedProvider>,
      );
      const input = await screen.findByLabelText("Title");
      fireEvent.change(input, { target: { value: "Updated length" } });
      fireEvent.click(screen.getByRole("button", { name: "Save type" }));
      await waitFor(() =>
        expect(context.onDataTypeSaved).toHaveBeenCalledWith(saved),
      );
      expect(context.onDataTypeSaved).toHaveBeenCalledTimes(1);
      if (isDraft) {
        expect(push).toHaveBeenCalledWith(saved.schema.$id);
      } else {
        expect(updated).toHaveBeenCalledWith(saved);
      }
    },
  );
});

// @vitest-environment jsdom
import { useQuery } from "@apollo/client";
import { ThemeProvider } from "@mui/material";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeOntologyTypeVersion } from "@blockprotocol/type-system";
import { theme } from "@hashintel/design-system/theme";

import { DataTypeConversions } from "./data-type-conversions";
import { ConversionEditor } from "./data-type-conversions/conversion-editor";

import type { FindDataTypeConversionTargetsQuery } from "../../../graphql/api-types.gen";
import type { InheritedConstraints } from "./data-type-constraints/types";
import type * as ApolloClient from "@apollo/client";
import type {
  BaseUrl,
  Conversions,
  DataType,
  DataTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

const state = vi.hoisted(
  (): {
    dataTypes: Record<VersionedUrl, DataTypeWithMetadata> | null;
    ownConversions: Record<BaseUrl, Conversions>;
    inheritedConstraints: InheritedConstraints;
    result: FindDataTypeConversionTargetsQuery | undefined;
  } => ({
    dataTypes: null,
    ownConversions: {},
    inheritedConstraints: {},
    result: undefined,
  }),
);

vi.mock("@apollo/client", async (importOriginal) => ({
  ...(await importOriginal<typeof ApolloClient>()),
  useQuery: vi.fn(() => ({ data: state.result, loading: false })),
}));
vi.mock("react-hook-form", () => ({
  useFormContext: () => ({ control: {} }),
  useWatch: ({ name }: { name: string }) =>
    name === "constraints.type" ? "number" : state.ownConversions,
}));
vi.mock("../data-types-context", () => ({
  useDataTypesContext: () => ({ dataTypes: state.dataTypes }),
}));
vi.mock("../slide-stack", () => ({
  useSlideStack: () => ({ pushToSlideStack: vi.fn() }),
}));
vi.mock("./shared/use-inherited-constraints", () => ({
  useInheritedConstraints: () => state.inheritedConstraints,
}));
vi.mock("../../../shared/ui/link", () => ({ Link: () => null }));
vi.mock("./data-type-conversions/conversion-editor", () => ({
  ConversionEditor: vi.fn(() => null),
}));
vi.mock("./data-type-conversions/conversion-target-editor", () => ({
  ConversionTargetEditor: () => null,
}));

const source: DataType = {
  $schema: "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
  kind: "dataType",
  $id: "https://hash.ai/@h/types/data-type/kiloampere-hours/v/1",
  title: "Kiloampere Hour",
  description: "A unit of electric charge.",
  type: "number",
};
const targetBaseUrl = "https://hash.ai/@h/types/data-type/coulombs/" as BaseUrl;
const ownConversion: Conversions = {
  from: { expression: ["/", "self", { const: 3600000, type: "number" }] },
  to: { expression: ["*", "self", { const: 3600000, type: "number" }] },
};
const inheritedConversion: Conversions = {
  from: { expression: ["/", "self", { const: 3600, type: "number" }] },
  to: { expression: ["*", "self", { const: 3600, type: "number" }] },
};
const target = (version: number): DataTypeWithMetadata =>
  ({
    schema: {
      ...source,
      $id: `${targetBaseUrl}v/${version}`,
      title: `Coulomb version ${version}`,
    },
    metadata: {
      recordId: {
        baseUrl: targetBaseUrl,
        version: makeOntologyTypeVersion({ major: version }),
      },
    },
  }) as DataTypeWithMetadata;
const renderConversions = () =>
  render(
    <ThemeProvider theme={theme}>
      <DataTypeConversions dataType={source} isReadOnly />
    </ThemeProvider>,
  );
const loadTargets = (versions: number[]) => {
  state.dataTypes = Object.fromEntries(
    versions.map((version) => {
      const dataType = target(version);
      return [dataType.schema.$id, dataType];
    }),
  );
  state.result = {
    findDataTypeConversionTargets: { [target(10).schema.$id]: {} },
  };
};
const inheritConversion = () => {
  state.inheritedConstraints = {
    conversions: {
      [targetBaseUrl]: {
        value: inheritedConversion,
        from: { ...source, title: "Parent charge unit" },
      },
    },
  };
};

describe("DataTypeConversions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.dataTypes = null;
    state.ownConversions = { [targetBaseUrl]: ownConversion };
    state.inheritedConstraints = {};
    state.result = undefined;
  });
  afterEach(cleanup);

  it("waits for the catalogue before resolving conversion targets", () => {
    const { container } = renderConversions();

    expect(container.innerHTML).toBe("");
    expect(useQuery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ skip: true }),
    );
  });

  it.each([
    { order: "oldest first", versions: [1, 2, 10] },
    { order: "newest first", versions: [10, 1, 2] },
  ])(
    "uses the latest inherited target with the catalogue ordered $order",
    ({ versions }) => {
      loadTargets(versions);
      state.ownConversions = {};
      inheritConversion();
      renderConversions();

      expect(useQuery).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({
          skip: false,
          variables: { dataTypeIds: [target(10).schema.$id] },
        }),
      );
      expect(vi.mocked(ConversionEditor).mock.lastCall?.[0]).toMatchObject({
        target: target(10),
        conversions: inheritedConversion,
        inheritedFromTitle: "Parent charge unit",
      });
      expect(ConversionEditor).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps own conversions ahead of inherited ones while using the latest target", () => {
    loadTargets([1, 2, 10]);
    inheritConversion();
    renderConversions();

    expect(useQuery).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        variables: { dataTypeIds: [target(10).schema.$id] },
      }),
    );
    expect(vi.mocked(ConversionEditor).mock.lastCall?.[0]).toMatchObject({
      target: target(10),
      conversions: ownConversion,
      inheritedFromTitle: null,
    });
    expect(ConversionEditor).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom
import { ThemeProvider } from "@mui/material";
import { cleanup, render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { afterEach, describe, expect, it } from "vitest";

import { theme } from "@hashintel/design-system/theme";

import {
  applyConversionDefinition,
  ConversionEditor,
} from "./conversion-editor";

import type { DataTypeFormData } from "../data-type-form";
import type {
  ConversionDefinition,
  Conversions,
  DataType,
  DataTypeWithMetadata,
} from "@blockprotocol/type-system";
import type { PropsWithChildren } from "react";

const dataType = { title: "Metres" } as unknown as DataType;

const target = {
  metadata: {
    recordId: {
      baseUrl: "https://example.com/types/data-type/centimetres/",
    },
  },
  schema: { title: "Centimetres" },
} as unknown as DataTypeWithMetadata;

const conversions: Conversions = {
  from: { expression: ["/", "self", { const: 100, type: "number" }] },
  to: { expression: ["*", "self", { const: 100, type: "number" }] },
};

const Form = ({ children }: PropsWithChildren) => {
  const formMethods = useForm<DataTypeFormData>({
    defaultValues: {
      conversions: {},
    },
  });

  return <FormProvider {...formMethods}>{children}</FormProvider>;
};

describe("ConversionEditor", () => {
  afterEach(cleanup);

  it("offers editable controls for a conversion defined on the type itself", () => {
    render(
      <ThemeProvider theme={theme}>
        <Form>
          <ConversionEditor
            conversions={conversions}
            dataType={dataType}
            inheritedFromTitle={null}
            isReadOnly={false}
            target={target}
          />
        </Form>
      </ThemeProvider>,
    );

    expect(
      screen.getAllByRole("combobox").length,
      "both operators can be changed",
    ).toBe(2);
    expect(
      screen.getAllByRole("spinbutton").length,
      "both constants can be changed",
    ).toBe(2);
  });

  it("offers no editable controls when the whole form is read-only", () => {
    render(
      <ThemeProvider theme={theme}>
        <Form>
          <ConversionEditor
            conversions={conversions}
            dataType={dataType}
            inheritedFromTitle={null}
            isReadOnly
            target={target}
          />
        </Form>
      </ThemeProvider>,
    );

    expect(
      screen.queryAllByRole("combobox").length,
      "a read-only operator cannot be changed",
    ).toBe(0);
    expect(
      screen.queryAllByRole("spinbutton").length,
      "a read-only constant cannot be changed",
    ).toBe(0);
  });

  it("offers no editable controls for a conversion inherited from a parent", () => {
    render(
      <ThemeProvider theme={theme}>
        <Form>
          <ConversionEditor
            conversions={conversions}
            dataType={dataType}
            inheritedFromTitle="Length"
            isReadOnly={false}
            target={target}
          />
        </Form>
      </ThemeProvider>,
    );

    expect(
      screen.queryAllByRole("combobox").length,
      "an inherited operator cannot be changed",
    ).toBe(0);
    expect(
      screen.queryAllByRole("spinbutton").length,
      "an inherited constant cannot be changed",
    ).toBe(0);
  });
});

describe("applyConversionDefinition", () => {
  const definition: ConversionDefinition = {
    expression: ["*", "self", { const: 1000, type: "number" }],
  };

  it("keeps the other direction when the 'to' definition changes", () => {
    expect(
      applyConversionDefinition({ conversions, definition, direction: "to" }),
    ).toEqual({ from: conversions.from, to: definition });
  });

  it("keeps the other direction when the 'from' definition changes", () => {
    expect(
      applyConversionDefinition({ conversions, definition, direction: "from" }),
    ).toEqual({ from: definition, to: conversions.to });
  });
});

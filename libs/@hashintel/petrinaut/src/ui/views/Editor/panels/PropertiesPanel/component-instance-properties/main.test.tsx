/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { use, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  createJsonDocHandle,
  createPetrinaut,
  resolveComponent,
  resolvedLibraries,
  type ComponentReference,
  type Library,
  type PetrinautRules,
  type Place,
} from "@hashintel/petrinaut-core";

import { CompositionContext } from "../../../../../../react/document/composition-context";
import { PetrinautInstanceContext } from "../../../../../../react/document/instance-context";
import { SDCPNContext } from "../../../../../../react/document/sdcpn-context";
import { ComponentInstanceProperties } from "./main";

afterEach(cleanup);

const place = (id: string, name: string): Place => ({
  id,
  name,
  colorId: null,
  dynamicsEnabled: false,
  isPort: true,
  x: 0,
  y: 0,
});

/** An interface, `scale`, and a component that runs behind it, `belt`. */
const logistics: Library = {
  id: "@hashintel/logistics",
  name: "Logistics",
  components: [
    {
      id: "scale",
      name: "Scale",
      ports: [
        { id: "in", name: "In", direction: "in" },
        { id: "out", name: "Out", direction: "out" },
      ],
    },
    {
      id: "belt",
      name: "Belt",
      ports: [
        { id: "in", name: "In" },
        { id: "out", name: "Out" },
      ],
      body: {
        places: [place("in", "In"), place("out", "Out")],
        transitions: [],
      },
    },
  ],
};
/** The same library, which the document imports and the host does not offer. */
const surplus: Library = {
  ...logistics,
  id: "@hashintel/surplus",
  name: "Surplus",
};
const scale = { from: logistics.id, id: "scale" };

/**
 * Opens the Implementation picker of an instance of `scale`, in a document
 * with a component of its own, `Bench`, that has the ports of `scale`, and gives
 * what the picker lists.
 */
const listedImplementations = async ({
  rules,
  implementation,
}: {
  rules?: PetrinautRules;
  implementation?: ComponentReference;
} = {}) => {
  const instance = createPetrinaut({
    document: createJsonDocHandle({
      initial: {
        places: [],
        transitions: [],
        types: [],
        differentialEquations: [],
        parameters: [],
        imports: [{ id: logistics.id }, { id: surplus.id }],
        components: [
          {
            id: "bench",
            name: "Bench",
            places: [place("in", "In"), place("out", "Out")],
            transitions: [],
            types: [],
            differentialEquations: [],
            parameters: [],
          },
        ],
        componentInstances: [
          {
            id: "a",
            name: "ScaleA",
            component: scale,
            parameterValues: {},
            implementation,
            x: 0,
            y: 0,
          },
        ],
      },
    }),
    resolveImport: (id) =>
      [logistics, surplus].find((library) => library.id === id),
    libraries: [logistics.id],
    rules,
  });
  const sdcpn = instance.definition.get();
  const imports = instance.imports.get();
  const libraries = resolvedLibraries(imports);
  const placed = sdcpn.componentInstances![0]!;

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <PetrinautInstanceContext value={instance}>
      <CompositionContext
        value={{
          imports,
          libraries,
          offered: instance.libraries,
          rules: instance.rules,
        }}
      >
        <SDCPNContext
          value={{
            ...use(SDCPNContext),
            petriNetDefinition: sdcpn,
            readonly: false,
          }}
        >
          {children}
        </SDCPNContext>
      </CompositionContext>
    </PetrinautInstanceContext>
  );
  render(
    <ComponentInstanceProperties
      instance={placed}
      component={resolveComponent(sdcpn, scale, libraries) ?? null}
    />,
    { wrapper: Wrapper },
  );

  fireEvent.click(screen.getByRole("combobox", { name: "Implementation" }));
  const options = await screen.findAllByRole("option");
  return options.map((option) => option.textContent);
};

describe("the Implementation picker of an instance of an interface", () => {
  it("lists the document's own components and those of its imports", async () => {
    expect(await listedImplementations()).toEqual([
      "Document default (none)",
      "Bench",
      "Belt, from Logistics",
      "Belt, from Surplus",
    ]);
  });

  it("lists the components of the libraries on offer alone, in an editor kept to composing", async () => {
    expect(await listedImplementations({ rules: { edit: "compose" } })).toEqual(
      ["Document default (none)", "Belt, from Logistics"],
    );
  });

  it("keeps what the instance runs listed, in an editor kept to composing", async () => {
    expect(
      await listedImplementations({
        rules: { edit: "compose" },
        implementation: { id: "bench" },
      }),
    ).toEqual(["Document default (none)", "Belt, from Logistics", "Bench"]);
  });
});

import { loader } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { use, useEffect, useState } from "react";

import type {
  Color,
  DifferentialEquation,
  Parameter,
  Place,
  Transition,
} from "../core/types/sdcpn";
import { EditorContext } from "../state/editor-context";
import { SDCPNContext } from "../state/sdcpn-context";

interface ReactTypeDefinitions {
  react: string;
  reactJsxRuntime: string;
  reactDom: string;
}

/**
 * Fetch React type definitions from unpkg CDN
 */
async function fetchReactTypes(): Promise<ReactTypeDefinitions> {
  const [react, reactJsxRuntime, reactDom] = await Promise.all([
    fetch("https://unpkg.com/@types/react@18/index.d.ts").then((response) =>
      response.text(),
    ),
    fetch("https://unpkg.com/@types/react@18/jsx-runtime.d.ts").then(
      (response) => response.text(),
    ),
    fetch("https://unpkg.com/@types/react-dom@18/index.d.ts").then((response) =>
      response.text(),
    ),
  ]);

  return { react, reactJsxRuntime, reactDom };
}

/**
 * Convert a transition to a TypeScript definition string
 */
function transitionToTsDefinitionString(
  transition: Transition,
  placeIdToNameMap: Map<string, string>,
  placeIdToTypeMap: Map<string, Color | undefined>,
): string {
  const input =
    transition.inputArcs.length === 0
      ? "never"
      : `
    {${transition.inputArcs
      // Only include arcs whose places have defined types
      .filter((arc) => placeIdToTypeMap.get(arc.placeId))
      .map((arc) => {
        const placeTokenType = `SDCPNPlaces['${arc.placeId}']['type']['object']`;
        return `"${placeIdToNameMap.get(arc.placeId)!}": [${Array.from({ length: arc.weight }).fill(placeTokenType).join(", ")}]`;
      })
      .join(", ")}
    }`;

  const output =
    transition.outputArcs.length === 0
      ? "never"
      : `{
    ${transition.outputArcs
      // Only include arcs whose places have defined types
      .filter((arc) => placeIdToTypeMap.get(arc.placeId))
      .map((arc) => {
        const placeTokenType = `SDCPNPlaces['${arc.placeId}']['type']['object']`;
        return `"${placeIdToNameMap.get(arc.placeId)!}": [${Array.from({ length: arc.weight }).fill(placeTokenType).join(", ")}]`;
      })
      .join(", ")}
    }`;

  return `{
    name: "${transition.name}";
    lambdaType: "${transition.lambdaType}";
    lambdaInputFn: (input: ${input}, parameters: SDCPNParametersValues) => ${transition.lambdaType === "predicate" ? "boolean" : "number"};
    transitionKernelFn: (input: ${input}, parameters: SDCPNParametersValues) => ${output};
  }`;
}

/**
 * Generate TypeScript type definitions for SDCPN types
 */
function generateTypesDefinition(types: Color[]): string {
  return `declare interface SDCPNTypes {
    ${types
      .map(
        (type) => `"${type.id}": {
        tuple: [${type.elements.map((el) => `${el.name}: ${el.type === "boolean" ? "boolean" : "number"}`).join(", ")}];
        object: {
          ${type.elements
            .map(
              (el) =>
                `${el.name}: ${el.type === "boolean" ? "boolean" : "number"};`,
            )
            .join("\n")}
        };
        dynamicsFn: (input: SDCPNTypes["${type.id}"]["object"][], parameters: SDCPNParametersValues) => SDCPNTypes["${type.id}"]["object"][];
      }`,
      )
      .join("\n")}
  }`;
}

/**
 * Generate TypeScript type definitions for SDCPN places
 */
function generatePlacesDefinition(places: Place[]): string {
  return `declare interface SDCPNPlaces {
    ${places
      .map(
        (place) => `"${place.id}": {
        name: ${JSON.stringify(place.name)};
        type: ${place.colorId ? `SDCPNTypes["${place.colorId}"]` : "null"};
        dynamicsEnabled: ${place.dynamicsEnabled ? "true" : "false"};
      };`,
      )
      .join("\n")}}`;
}

/**
 * Generate TypeScript type definitions for SDCPN transitions
 */
function generateTransitionsDefinition(
  transitions: Transition[],
  placeIdToNameMap: Map<string, string>,
  placeIdToTypeMap: Map<string, Color | undefined>,
): string {
  return `declare interface SDCPNTransitions {
      ${transitions
        .map(
          (transition) =>
            `"${transition.id}": ${transitionToTsDefinitionString(transition, placeIdToNameMap, placeIdToTypeMap)};`,
        )
        .join("\n")}
    }`;
}

/**
 * Generate TypeScript type definitions for SDCPN differential equations
 */
function generateDifferentialEquationsDefinition(
  differentialEquations: DifferentialEquation[],
): string {
  return `declare interface SDCPNDifferentialEquations {
    ${differentialEquations
      .map(
        (diffEq) => `"${diffEq.id}": {
        name: ${JSON.stringify(diffEq.name)};
        typeId: "${diffEq.colorId}";
        type: SDCPNTypes["${diffEq.colorId}"];
      };`,
      )
      .join("\n")}
  }`;
}

function generateParametersDefinition(parameters: Parameter[]): string {
  return `{${parameters
    .map(
      (param) =>
        `"${param.variableName}": ${param.type === "boolean" ? "boolean" : "number"}`,
    )
    .join(", ")}}`;
}

/**
 * Generate complete SDCPN type definitions
 */
function generateSDCPNTypings(
  types: Color[],
  places: Place[],
  transitions: Transition[],
  differentialEquations: DifferentialEquation[],
  parameters: Parameter[],
  currentlySelectedItemId?: string,
): string {
  // Generate a map from place IDs to names for easier reference
  const placeIdToNameMap = new Map(
    places.map((place) => [place.id, place.name]),
  );
  const typeIdToTypeMap = new Map(types.map((type) => [type.id, type]));
  const placeIdToTypeMap = new Map(
    places.map((place) => [
      place.id,
      place.colorId ? typeIdToTypeMap.get(place.colorId) : undefined,
    ]),
  );

  const parametersDefinition = generateParametersDefinition(parameters);
  const globalTypesDefinition = generateTypesDefinition(types);
  const placesDefinition = generatePlacesDefinition(places);
  const transitionsDefinition = generateTransitionsDefinition(
    transitions,
    placeIdToNameMap,
    placeIdToTypeMap,
  );
  const differentialEquationsDefinition =
    generateDifferentialEquationsDefinition(differentialEquations);

  return `
declare type SDCPNParametersValues = ${parametersDefinition};

${globalTypesDefinition}

${placesDefinition}

${transitionsDefinition}

${differentialEquationsDefinition}

// Define Lambda and TransitionKernel functions

declare type SDCPNTransitionID = keyof SDCPNTransitions;

${
  currentlySelectedItemId
    ? `type __SelectedTransitionID = "${currentlySelectedItemId}"`
    : `type __SelectedTransitionID = SDCPNTransitionID`
};

declare function Lambda<TransitionId extends SDCPNTransitionID = __SelectedTransitionID>(fn: SDCPNTransitions[TransitionId]['lambdaInputFn']): void;

declare function TransitionKernel<TransitionId extends SDCPNTransitionID = __SelectedTransitionID>(fn: SDCPNTransitions[TransitionId]['transitionKernelFn']): void;


// Define Dynamics function

type SDCPNDiffEqID = keyof SDCPNDifferentialEquations;

${
  currentlySelectedItemId
    ? `type __SelectedDiffEqID = "${currentlySelectedItemId}"`
    : `type __SelectedDiffEqID = SDCPNDiffEqID`
};

declare function Dynamics<DiffEqId extends SDCPNDiffEqID = __SelectedDiffEqID>(fn: SDCPNDifferentialEquations[DiffEqId]['type']['dynamicsFn']): void;


// Define Visualizer function

type SDCPNPlaceID = keyof SDCPNPlaces;

${
  currentlySelectedItemId
    ? `type __SelectedPlaceID = "${currentlySelectedItemId}"`
    : `type __SelectedPlaceID = SDCPNPlaceID`
};

declare function Visualization<PlaceId extends SDCPNPlaceID = __SelectedPlaceID>(fn: (props: { tokens: SDCPNPlaces[PlaceId]['type']['object'][], parameters: SDCPNParametersValues }) => React.JSX.Element): void;

  `.trim();
}

/**
 * Configure Monaco TypeScript compiler options
 */
function configureMonacoCompilerOptions(monaco: typeof Monaco): void {
  const ts = monaco.typescript;

  ts.typescriptDefaults.setCompilerOptions({
    target: ts.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    module: ts.ModuleKind.ESNext,
    noEmit: true,
    esModuleInterop: true,
    jsx: ts.JsxEmit.ReactJSX,
    allowJs: false,
    checkJs: false,
    typeRoots: ["node_modules/@types"],
  });

  ts.javascriptDefaults.setCompilerOptions({
    target: ts.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    noEmit: true,
    allowJs: true,
    checkJs: false,
  });

  ts.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
}

/**
 * Global hook to update Monaco's TypeScript context with SDCPN-derived typings.
 * Should be called once at the app level to avoid race conditions.
 */
export function useMonacoGlobalTypings() {
  const {
    petriNetDefinition: {
      types,
      transitions,
      parameters,
      places,
      differentialEquations,
    },
  } = use(SDCPNContext);

  const { selectedResourceId: currentlySelectedItemId } = use(EditorContext);

  const [reactTypes, setReactTypes] = useState<ReactTypeDefinitions | null>(
    null,
  );

  // Configure Monaco and load React types once at startup
  useEffect(() => {
    void loader.init().then((monaco: typeof Monaco) => {
      // Configure compiler options
      configureMonacoCompilerOptions(monaco);

      // Fetch and set React types once
      void fetchReactTypes().then((rTypes) => {
        setReactTypes(rTypes);

        // Set React types as base extra libs - this is done only once
        monaco.typescript.typescriptDefaults.setExtraLibs([
          {
            content: rTypes.react,
            filePath: "inmemory://sdcpn/node_modules/@types/react/index.d.ts",
          },
          {
            content: rTypes.reactJsxRuntime,
            filePath:
              "inmemory://sdcpn/node_modules/@types/react/jsx-runtime.d.ts",
          },
          {
            content: rTypes.reactDom,
            filePath:
              "inmemory://sdcpn/node_modules/@types/react-dom/index.d.ts",
          },
        ]);
      });
    });
  }, []); // Empty deps - run only once at startup

  // Update SDCPN typings whenever the model changes
  useEffect(() => {
    if (!reactTypes) {
      return; // Wait for React types to load first
    }

    void loader.init().then((monaco: typeof Monaco) => {
      const sdcpnTypings = generateSDCPNTypings(
        types,
        places,
        transitions,
        differentialEquations,
        parameters,
        currentlySelectedItemId ?? undefined,
      );

      // Create or update SDCPN typings model
      const sdcpnTypingsUri = monaco.Uri.parse(
        "inmemory://sdcpn/sdcpn-globals.d.ts",
      );
      const existingModel = monaco.editor.getModel(sdcpnTypingsUri);

      if (existingModel) {
        existingModel.setValue(sdcpnTypings);
      } else {
        monaco.editor.createModel(sdcpnTypings, "typescript", sdcpnTypingsUri);
      }
    });
  }, [
    reactTypes,
    types,
    parameters,
    places,
    transitions,
    differentialEquations,
    currentlySelectedItemId,
  ]);
}

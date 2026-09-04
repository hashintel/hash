/**
 * The stage every search prototype performs on: the REAL ad-hoc scenario
 * form (live LSP, Monaco, the worksheet keyboard model) mounted with the
 * large bottling fixture, plus the ref the prototypes use to find and focus
 * triggers. The prototypes differ only in the search layer they put around
 * this stage.
 */

import { useRef, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";
import { DEFAULT_PETRINAUT_EXTENSIONS } from "@hashintel/petrinaut-core";

import { LanguageClientProvider } from "../../../react/lsp/provider";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { AdHocScenarioForm } from "../../components/ad-hoc-scenario-form/ad-hoc-scenario-form";
import { MonacoProvider } from "../../monaco/provider";
import { bottlingContext, bottlingState } from "./big-fixture";
import { buildSearchIndex } from "./search-index";

import type { SDCPNContextValue } from "../../../react/state/sdcpn-context";
import type { SearchEntry } from "./search-index";
import type { SDCPN } from "@hashintel/petrinaut-core";

const bottlingSdcpn: SDCPN = {
  places: bottlingContext.places,
  transitions: [],
  types: bottlingContext.types,
  parameters: bottlingContext.netParameters,
  differentialEquations: [],
};

const sdcpnContextValue: SDCPNContextValue = {
  createNewNet: () => {},
  existingNets: [],
  loadPetriNet: () => {},
  petriNetId: "search-prototype-net",
  petriNetDefinition: bottlingSdcpn,
  readonly: false,
  extensions: DEFAULT_PETRINAUT_EXTENSIONS,
  setTitle: () => {},
  title: "Bottling Plant",
  getItemType: () => null,
};

const pageStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  fontFamily: "mono",
});

const explainerStyle = css({
  fontSize: "sm",
  color: "neutral.s90",
  lineHeight: "[1.5]",
  maxWidth: "[72ch]",
  fontFamily: "[ui-sans-serif, system-ui]",
  whiteSpace: "pre-line",
});

const titleStyle = css({
  fontSize: "lg",
  fontWeight: "semibold",
  fontFamily: "[ui-sans-serif, system-ui]",
});

const formHostStyle = css({
  width: "[820px]",
  maxWidth: "full",
});

/**
 * Mounts the form with the big fixture and hands the prototype its search
 * surface: the index, the root element jumps resolve inside, and the form
 * element itself — the layer decides where the form sits (above, beside…).
 */
export const SearchHarness = ({
  title,
  explainer,
  children,
}: {
  title: string;
  explainer: string;
  /** The search layer, laying out the given form element itself. */
  children: (surface: {
    index: SearchEntry[];
    rootRef: React.RefObject<HTMLDivElement | null>;
    form: React.ReactNode;
  }) => React.ReactNode;
}) => {
  const [state, setState] = useState(bottlingState);
  const rootRef = useRef<HTMLDivElement>(null);
  const index = buildSearchIndex(state, bottlingContext);

  const form = (
    <div ref={rootRef} className={formHostStyle}>
      <AdHocScenarioForm
        state={state}
        onChange={setState}
        context={bottlingContext}
        selection="optimize"
      />
    </div>
  );

  return (
    <SDCPNContext value={sdcpnContextValue}>
      <LanguageClientProvider>
        <MonacoProvider>
          <div className={pageStyle}>
            <div className={titleStyle}>{title}</div>
            <p className={explainerStyle}>{explainer}</p>
            {children({ index, rootRef, form })}
          </div>
        </MonacoProvider>
      </LanguageClientProvider>
    </SDCPNContext>
  );
};

import { useState } from "react";

import { css } from "@hashintel/ds-helpers/css";
import {
  mergeDslDocument,
  parsePetrinautDsl,
  parseSDCPNDocument,
  printPetrinautDsl,
  serializeSDCPN,
  type SDCPN,
} from "@hashintel/petrinaut-core";
import {
  assemblyLine,
  cafeQueue,
  dronePatrol,
  probabilisticSatellitesSDCPN,
  sirModel,
} from "@hashintel/petrinaut-core/examples";

import {
  dslLanguageId,
  registerDslLanguage,
} from "../../builtin-plugins/code-view/dsl-language";
import { CodeEditor } from "../../monaco/code-editor";

const examples = [
  assemblyLine,
  cafeQueue,
  sirModel,
  dronePatrol,
  probabilisticSatellitesSDCPN,
];

const layoutStyle = css({
  display: "grid",
  gridTemplateColumns: "[1fr 1fr]",
  gridTemplateRows: "[auto 1fr]",
  gap: "3",
  height: "[calc(100vh - 32px)]",
  minHeight: "[0]",
});

const toolbarStyle = css({
  gridColumn: "[1 / -1]",
  display: "flex",
  alignItems: "center",
  gap: "3",
  fontSize: "sm",
});

const paneStyle = css({
  display: "flex",
  flexDirection: "column",
  minHeight: "[0]",
  gap: "1",
  "& > div:last-child": { flex: "[1]", minHeight: "[0]" },
});

const paneTitleStyle = css({
  fontSize: "xs",
  fontWeight: "semibold",
  textTransform: "uppercase",
  letterSpacing: "wide",
  color: "neutral.s85",
});

const roundTripStyle = css({
  fontSize: "xs",
  color: "neutral.s85",
  whiteSpace: "pre-wrap",
});

const errorStyle = css({
  color: "[#dc2626]",
  fontSize: "sm",
  whiteSpace: "pre-wrap",
});

/** The projection read back and merged onto its document, printed again: the same text, or why not. */
const roundTrip = (sdcpn: SDCPN, title: string | undefined, text: string) => {
  const parsed = parsePetrinautDsl(text);
  const describe = (
    diagnostics: readonly { message: string; range: { startLine: number } }[],
  ) =>
    diagnostics
      .map(({ message, range }) => `line ${range.startLine}: ${message}`)
      .join("\n");
  if (parsed.diagnostics.length > 0) {
    return `Round trip: the text does not parse.\n${describe(parsed.diagnostics)}`;
  }
  const merged = mergeDslDocument(sdcpn, parsed.document);
  if (!merged.ok) {
    return `Round trip: the text does not merge.\n${describe(merged.diagnostics)}`;
  }
  const again = printPetrinautDsl({ sdcpn: merged.sdcpn, title }).text;
  return again === text
    ? "Round trip: parsed, merged and printed again, the text is the same."
    : "Round trip: the merged net prints differently.";
};

/**
 * Two panes: a YAML document on the left, edited freely, and its DSL
 * projection on the right, re-printed on every keystroke. An example picker
 * fills the left pane; under the projection, whether it reads back as the
 * same document.
 */
export const DslPlayground = () => {
  const [source, setSource] = useState(() =>
    serializeSDCPN({
      petriNetDefinition: assemblyLine.petriNetDefinition,
      title: assemblyLine.title,
      removeVisualInfo: true,
    }),
  );
  const parsed = parseSDCPNDocument(source);
  const projection = parsed.ok
    ? printPetrinautDsl({ sdcpn: parsed.sdcpn, title: parsed.sdcpn.title })
    : null;

  return (
    <div className={layoutStyle}>
      <div className={toolbarStyle}>
        <label>
          Example{" "}
          <select
            onChange={(event) => {
              const example = examples[Number(event.target.value)];
              if (example) {
                setSource(
                  serializeSDCPN({
                    petriNetDefinition: example.petriNetDefinition,
                    title: example.title,
                    removeVisualInfo: true,
                  }),
                );
              }
            }}
          >
            {examples.map((example, index) => (
              <option key={example.title} value={index}>
                {example.title}
              </option>
            ))}
          </select>
        </label>
        <span>Edit the YAML on the left; the DSL on the right follows.</span>
      </div>
      <div className={paneStyle}>
        <div className={paneTitleStyle}>Document (YAML)</div>
        <div>
          <CodeEditor
            language="yaml"
            value={source}
            height="100%"
            onChange={(value) => setSource(value ?? "")}
            options={{ lineNumbers: "on", wordWrap: "on" }}
          />
        </div>
      </div>
      <div className={paneStyle}>
        <div className={paneTitleStyle}>Petrinaut DSL (projection)</div>
        {projection !== null && parsed.ok ? (
          <div className={roundTripStyle}>
            {roundTrip(parsed.sdcpn, parsed.sdcpn.title, projection.text)}
          </div>
        ) : null}
        {projection === null ? (
          <div className={errorStyle}>{parsed.ok ? "" : parsed.error}</div>
        ) : (
          <div>
            <CodeEditor
              language={dslLanguageId}
              value={projection.text}
              height="100%"
              beforeMount={registerDslLanguage}
              options={{
                readOnly: true,
                domReadOnly: true,
                lineNumbers: "on",
                wordWrap: "on",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

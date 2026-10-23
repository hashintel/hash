import { useState } from "react";

import { css } from "@hashintel/ds-helpers/css";
import {
  parseSDCPNDocument,
  printPetrinautDsl,
  serializeSDCPN,
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

const errorStyle = css({
  color: "[#dc2626]",
  fontSize: "sm",
  whiteSpace: "pre-wrap",
});

/**
 * Two panes: a YAML document on the left, edited freely, and its DSL
 * projection on the right, re-printed on every keystroke. An example picker
 * fills the left pane.
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

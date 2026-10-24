/**
 * @layerRoot website.custom-dsl
 * @role The DSL as the document: one text file in this browser, edited beside a read-only editor that follows it
 */

import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";
import {
  createJsonDocHandle,
  dslExamples,
  replaceDefinition,
  type DslDiagnostic,
  type DslExample,
  type SDCPN,
} from "@hashintel/petrinaut-core";
import { DslEditor, MonacoProvider, Petrinaut } from "@hashintel/petrinaut/ui";

import { deriveNet, emptyNet } from "./custom-dsl-page/derive-net";
import {
  defaultDslText,
  loadDslFile,
  saveDslFile,
} from "./custom-dsl-page/dsl-file";

const pageStyle = css({
  display: "grid",
  gridTemplateColumns: "[minmax(360px, 2fr) 3fr]",
  width: "[100vw]",
  height: "[100vh]",
  overflow: "hidden",
});

const filePaneStyle = css({
  display: "flex",
  flexDirection: "column",
  minWidth: "0",
  minHeight: "0",
  borderRightWidth: "[1px]",
  borderRightStyle: "solid",
  borderRightColor: "neutral.s30",
  backgroundColor: "neutral.s00",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  flexShrink: "0",
  paddingX: "4",
  paddingY: "2",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.s30",
  fontSize: "sm",
  color: "neutral.s100",
});

const headerTitleStyle = css({
  fontWeight: "semibold",
  whiteSpace: "nowrap",
});

const headerStatusStyle = css({
  flex: "[1]",
  minWidth: "0",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "neutral.s85",
});

const headerWarningStyle = css({
  color: "[#b45309]",
});

const examplePickerStyle = css({
  flexShrink: "0",
  maxWidth: "[11rem]",
  paddingX: "2",
  paddingY: "1",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.s40",
  borderRadius: "md",
  backgroundColor: "neutral.s00",
  color: "neutral.s100",
  fontSize: "sm",
});

const noticeStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  flexShrink: "0",
  paddingX: "4",
  paddingY: "2",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.s30",
  backgroundColor: "neutral.s10",
  fontSize: "sm",
  color: "neutral.s100",
});

const noticeTextStyle = css({
  flex: "[1]",
  minWidth: "0",
});

const noticeButtonStyle = css({
  paddingX: "3",
  paddingY: "1",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.s40",
  borderRadius: "md",
  backgroundColor: "neutral.s00",
  color: "neutral.s100",
  fontSize: "sm",
  cursor: "pointer",
});

const headerLinkStyle = css({
  whiteSpace: "nowrap",
  color: "neutral.s85",
  textDecoration: "underline",
});

const editorPaneStyle = css({
  minWidth: "0",
  minHeight: "0",
  position: "relative",
});

type SaveState = "saved" | "refused";

type Derived = {
  title: string | null;
  diagnostics: readonly DslDiagnostic[];
  /** Why the last text could not be written, when deriving it threw. */
  failure: string | null;
};

const countErrors = (diagnostics: readonly DslDiagnostic[]): number =>
  diagnostics.filter(({ severity }) => severity === "error").length;

const statusText = (
  { diagnostics, failure }: Derived,
  saveState: SaveState,
): string => {
  if (failure !== null) {
    return `The net could not be updated: ${failure}`;
  }
  const errors = countErrors(diagnostics);
  if (errors > 0) {
    return `${errors} ${errors === 1 ? "error" : "errors"}. The net shows the last text that read.`;
  }
  return saveState === "saved"
    ? "Saved in this browser."
    : "This browser refused to save. The text lives in this tab only.";
};

/**
 * One DSL file beside a read-only editor that follows it. The text is the
 * document: it is kept in this browser's local storage, and each change is
 * parsed and written onto the net the editor shows, so a declaration keeps
 * its node across edits and a new one is laid out.
 */
export const CustomDslPage = () => {
  const [text, setText] = useState(() => loadDslFile() ?? defaultDslText());
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [derived, setDerived] = useState<Derived>({
    title: null,
    diagnostics: [],
    failure: null,
  });
  const [handle] = useState(() =>
    createJsonDocHandle({
      id: "custom-dsl",
      initial: emptyNet,
      historyLimit: 0,
    }),
  );
  // What the handle holds, for the merge to match names against.
  const netRef = useRef<SDCPN>(emptyNet);

  // The document follows the text: merged onto what it holds, new nodes laid
  // out, then written in one change. A result that lands after the text
  // changed again is dropped.
  useEffect(() => {
    let current = true;
    deriveNet(netRef.current, text)
      .then((result) => {
        if (!current) {
          return;
        }
        const { net } = result;
        if (net !== null) {
          netRef.current = net;
          handle.change((draft) => replaceDefinition(draft, net));
        }
        setDerived({
          title: result.title,
          diagnostics: result.diagnostics,
          failure: null,
        });
      })
      .catch((error: unknown) => {
        if (current) {
          setDerived((previous) => ({
            ...previous,
            failure: error instanceof Error ? error.message : String(error),
          }));
        }
      });
    return () => {
      current = false;
    };
  }, [handle, text]);

  const title = derived.title ?? "Custom DSL";

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} · Custom DSL · Petrinaut`;
    return () => {
      document.title = previousTitle;
    };
  }, [title]);

  const save = (next: string) => {
    setSaveState(saveDslFile(next) ? "saved" : "refused");
  };

  // Loading an example replaces the one file this page keeps, so a text
  // that is not the example already waits for a word.
  const [pendingExample, setPendingExample] = useState<DslExample | null>(null);
  const applyExample = (example: DslExample) => {
    setPendingExample(null);
    setText(example.text);
    save(example.text);
  };
  const loadExample = (id: string) => {
    const example = dslExamples.find((candidate) => candidate.id === id);
    if (example === undefined || example.text === text) {
      return;
    }
    if (text.trim() === "") {
      applyExample(example);
    } else {
      setPendingExample(example);
    }
  };

  return (
    <div className={cx(pageStyle, "petrinaut-root")}>
      <section aria-label="DSL file" className={filePaneStyle}>
        <header className={headerStyle}>
          <span className={headerTitleStyle}>Custom DSL</span>
          <span
            className={cx(
              headerStatusStyle,
              derived.failure !== null ||
                countErrors(derived.diagnostics) > 0 ||
                saveState === "refused"
                ? headerWarningStyle
                : undefined,
            )}
          >
            {statusText(derived, saveState)}
          </span>
          <select
            aria-label="Load example"
            className={examplePickerStyle}
            onChange={(event) => loadExample(event.target.value)}
            value=""
          >
            <option disabled value="">
              Load example…
            </option>
            {dslExamples.map((example) => (
              <option
                key={example.id}
                title={example.description}
                value={example.id}
              >
                {example.title}
              </option>
            ))}
          </select>
          <Link className={headerLinkStyle} to="/">
            Back to Petrinaut
          </Link>
        </header>
        {pendingExample !== null ? (
          <div
            className={noticeStyle}
            role="alertdialog"
            aria-label="Replace the text"
          >
            <span className={noticeTextStyle}>
              Replace the text with the "{pendingExample.title}" example? The
              file in this browser is overwritten.
            </span>
            <button
              className={noticeButtonStyle}
              onClick={() => setPendingExample(null)}
              type="button"
            >
              Keep mine
            </button>
            <button
              className={noticeButtonStyle}
              onClick={() => applyExample(pendingExample)}
              type="button"
            >
              Replace
            </button>
          </div>
        ) : null}
        <MonacoProvider>
          <DslEditor
            value={text}
            onChange={(next) => {
              setText(next);
              save(next);
            }}
            onSave={() => save(text)}
            diagnostics={derived.diagnostics}
          />
        </MonacoProvider>
      </section>
      <main className={editorPaneStyle}>
        <Petrinaut
          handle={handle}
          hideNetManagementControls="except-title"
          presentationProfile="review"
          readonly
          title={title}
        />
      </main>
    </div>
  );
};

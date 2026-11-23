import { useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useStoreSelector } from "../react/shared/use-store";
import { AssistantPanelTitle } from "./plugins/assistant-panel-title";
import { useAssistantPanel } from "./plugins/plugin-assistant";

import type { PluginDocumentReader } from "./plugins/plugin-access";

const placeCountStyle = css({ whiteSpace: "nowrap" });

export const PlaceCount = ({
  document,
}: {
  document: PluginDocumentReader;
}) => {
  const count = useStoreSelector(document.net, (net) => net.places.length);

  return <span className={placeCountStyle}>{`${count} places`}</span>;
};

const echoLinesStyle = css({
  flex: "[1]",
  overflowY: "auto",
  padding: "3",
  fontSize: "sm",
});

const echoFormStyle = css({
  display: "flex",
  gap: "2",
  padding: "3",
  borderTop: "[1px solid {colors.neutral.bd.subtle}]",
});

/** An assistant panel's content: the title bar's title and Clear, and a transcript that echoes. */
export const EchoChat = () => {
  const { isOpen } = useAssistantPanel();
  const [lines, setLines] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  return (
    <>
      <AssistantPanelTitle
        actions={
          lines.length > 0 ? (
            <Button size="xs" variant="ghost" onClick={() => setLines([])}>
              Clear
            </Button>
          ) : null
        }
      >
        Echo
      </AssistantPanelTitle>
      <div className={echoLinesStyle}>
        {lines.map((line, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- lines repeat and never reorder
          <p key={index}>{line}</p>
        ))}
      </div>
      <form
        className={echoFormStyle}
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim() === "") return;
          setLines([...lines, draft]);
          setDraft("");
        }}
      >
        <input
          aria-label="Message Echo"
          data-autofocus
          disabled={!isOpen}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button size="xs" type="submit">
          Send
        </Button>
      </form>
    </>
  );
};

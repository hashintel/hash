import { lazy, Suspense, use, useRef, useState } from "react";

import { Toggle, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  generateDefaultNetVisualizerCode,
  getDocumentUri,
  netVisualizerId,
} from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../../../../../react/document/active-net-context";
import { useSDCPNState } from "../../../../../../react/document/sdcpn-context";
import {
  useOpenExecutableNet,
  useOpenNetStatePath,
} from "../../../../../../react/document/use-composition-state";
import { usePetrinautMutations } from "../../../../../../react/editing/use-petrinaut-mutations";
import { CodeEditor } from "../../../../../monaco/code-editor";
import { useElementSize } from "../../../../../shared/use-element-size";
import { VisualizerLoading } from "../../../../../visualizer/visualizer-loading";
import { UI_MESSAGES } from "../../../shared/ui-messages";
import { CodeTemplateMenu } from "../../PropertiesPanel/code-template-menu";

const NetStateVisualization = lazy(() =>
  import("../../../../../visualizer/net-state-visualization").then(
    (module) => ({ default: module.NetStateVisualization }),
  ),
);

const layoutStyle = css({
  display: "flex",
  gap: "[8px]",
  height: "full",
  minHeight: "[0]",
  padding: "[0 6px 6px]",
});

const editorPaneStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[3]",
  minWidth: "[0]",
});

const previewPaneStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[2]",
  minWidth: "[160px]",
  gap: "[4px]",
});

const previewStyle = css({
  position: "relative",
  flex: "[1]",
  minHeight: "[0]",
  overflow: "hidden",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  backgroundColor: "neutral.s00",
});

const captionStyle = css({
  flexShrink: "0",
  fontSize: "[11px]",
  color: "neutral.s100",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const messageStyle = css({
  padding: "[12px]",
  fontSize: "xs",
  color: "neutral.fg.muted",
  lineHeight: "[1.5]",
});

const headerActionsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
});

/** The visualizer code of the open net, the root net's or a component's. */
const useOpenNetVisualizerCode = (): string | undefined => {
  const { activeComponentId } = use(ActiveNetContext);
  return useSDCPNState((document) => {
    const definition = document.petriNetDefinition;
    return activeComponentId === null
      ? definition.visualizerCode
      : definition.components?.find(({ id }) => id === activeComponentId)
          ?.visualizerCode;
  });
};

/**
 * What the picture beside the code shows. The root net shows its own state.
 * A component is a definition: it shows the state of one of its instances.
 */
const describeShownState = (
  isComponent: boolean,
  statePath: readonly string[] | null,
): string => {
  if (!isComponent) {
    return "The state of the net";
  }
  return statePath === null
    ? "No instance of this component yet: drawn with no token"
    : "The state of its first instance";
};

/** The open net's picture, at the size of the pane it sits in. */
const NetVisualizerPreview: React.FC = () => {
  const net = useOpenExecutableNet();
  const statePath = useOpenNetStatePath();
  const { activeComponentId } = use(ActiveNetContext);
  const previewRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(previewRef);

  return (
    <div className={previewPaneStyle}>
      <div ref={previewRef} className={previewStyle}>
        {net && size ? (
          <Suspense fallback={<VisualizerLoading />}>
            <NetStateVisualization net={net} path={statePath} size={size} />
          </Suspense>
        ) : null}
      </div>
      <div className={captionStyle}>
        {describeShownState(activeComponentId !== null, statePath)}
      </div>
    </div>
  );
};

/**
 * The Visualizer tab: the code that draws the whole state of the open net,
 * and the picture it gives. The open net is the root net or a component,
 * whose picture is also drawn on the cards of its instances.
 */
export const NetVisualizerContent: React.FC = () => {
  const { activeComponentId } = use(ActiveNetContext);
  const code = useOpenNetVisualizerCode();
  const readonly = useSDCPNState((document) => document.readonly);
  const { setNetVisualizer } = usePetrinautMutations();

  if (code === undefined) {
    return (
      <div className={messageStyle}>
        {activeComponentId === null
          ? "Turn the visualizer on to draw the whole state of this net: every place, with its tokens, in one picture."
          : "Turn the visualizer on to draw the whole state of this component in one picture. Each of its instances shows it on its card."}
      </div>
    );
  }

  return (
    <div className={layoutStyle}>
      <div className={editorPaneStyle}>
        <CodeEditor
          path={getDocumentUri(
            "net-visualizer",
            netVisualizerId(activeComponentId),
          )}
          language="typescript"
          height="100%"
          value={code}
          options={{ readOnly: readonly }}
          onChange={(value) =>
            setNetVisualizer({ visualizerCode: value ?? "" })
          }
        />
      </div>
      <NetVisualizerPreview />
    </div>
  );
};

/** Turns the open net's visualizer on and off, and loads its template. */
export const NetVisualizerHeaderAction: React.FC = () => {
  const { activeNet, activeComponentId } = use(ActiveNetContext);
  const code = useOpenNetVisualizerCode();
  const readonly = useSDCPNState((document) => document.readonly);
  const { setNetVisualizer } = usePetrinautMutations();
  // What a net's code was before it was turned off, to turn it back on with.
  // The tab outlives the open net, so the code is kept with its net.
  const [saved, setSaved] = useState<{ netId: string; code: string }>();
  const netId = netVisualizerId(activeComponentId);

  const defaultCode = () =>
    generateDefaultNetVisualizerCode(
      activeNet.places.map((place) => place.name),
    );

  return (
    <div className={headerActionsStyle}>
      <Tooltip content={UI_MESSAGES.READ_ONLY_MODE} disableTooltip={!readonly}>
        <Toggle
          aria-label="Net visualizer"
          size="sm"
          tone="success"
          value={code !== undefined}
          disabled={readonly}
          onChange={(checked) => {
            if (checked) {
              setNetVisualizer({
                visualizerCode:
                  saved?.netId === netId ? saved.code : defaultCode(),
              });
            } else {
              if (code) {
                setSaved({ netId, code });
              }
              setNetVisualizer({ visualizerCode: null });
            }
          }}
        />
      </Tooltip>
      {code !== undefined ? (
        <CodeTemplateMenu
          disabled={readonly}
          onLoadDefault={() =>
            setNetVisualizer({ visualizerCode: defaultCode() })
          }
        />
      ) : null}
    </div>
  );
};

import { use, useEffect, useState } from "react";

import { Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import { analyzeCompilation } from "@hashintel/petrinaut-core/webgpu";

import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";

import type { SubView } from "../../../../../components/sub-view/types";
import type {
  CompilationItemReport,
  CompilationReport,
} from "@hashintel/petrinaut-core/webgpu";

const rootStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  fontSize: "xs",
});

const mutedStyle = css({
  color: "neutral.s100",
  fontStyle: "italic",
});

const verdictRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flexWrap: "wrap",
});

const pillStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  paddingX: "1.5",
  paddingY: "0.5",
  borderRadius: "md",
  fontWeight: "medium",
  whiteSpace: "nowrap",
});

const pillReadyStyle = css({
  backgroundColor: "green.s30",
  color: "green.s110",
});

const pillBlockedStyle = css({
  backgroundColor: "neutral.s30",
  color: "neutral.s120",
});

const pillWarnStyle = css({
  backgroundColor: "orange.s30",
  color: "orange.s110",
});

const factStyle = css({
  color: "neutral.s100",
});

const groupTitleStyle = css({
  fontSize: "[11px]",
  fontWeight: "semibold",
  letterSpacing: "wide",
  textTransform: "uppercase",
  color: "neutral.s105",
});

const listStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  margin: "[0]",
  padding: "[0]",
  listStyle: "none",
});

const reasonButtonStyle = css({
  display: "flex",
  alignItems: "baseline",
  gap: "1.5",
  width: "[100%]",
  textAlign: "left",
  padding: "[2px 4px]",
  border: "none",
  borderRadius: "sm",
  background: "[transparent]",
  color: "neutral.s115",
  cursor: "pointer",
  _hover: { backgroundColor: "neutral.a10" },
});

const reasonStaticStyle = css({
  display: "flex",
  alignItems: "baseline",
  gap: "1.5",
  padding: "[2px 4px]",
  color: "neutral.s115",
});

const codeStyle = css({
  fontFamily: "mono",
  fontSize: "[11px]",
  color: "neutral.s100",
  flexShrink: "[0]",
});

const itemRowStyle = css({
  display: "grid",
  gridTemplateColumns: "[minmax(0, 1fr) auto auto]",
  alignItems: "center",
  gap: "2",
  padding: "[2px 4px]",
  borderRadius: "sm",
  width: "[100%]",
  border: "none",
  background: "[transparent]",
  textAlign: "left",
  cursor: "pointer",
  color: "neutral.s115",
  _hover: { backgroundColor: "neutral.a10" },
});

const itemRowSelectedStyle = css({
  backgroundColor: "blue.s20",
});

const itemNameStyle = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const detailStyle = css({
  paddingLeft: "[4px]",
  color: "neutral.s100",
  fontFamily: "mono",
  fontSize: "[11px]",
  wordBreak: "break-word",
  userSelect: "text",
  cursor: "text",
});

const KIND_LABEL = {
  lambda: "condition",
  kernel: "kernel",
  dynamics: "dynamics",
} as const;

const STATUS_LABEL = {
  "gpu-ready": "GPU",
  "cpu-only": "CPU",
  // The net was refused before emission, so this was never tested either way.
  "not-attempted": "untested",
  "no-hir": "no HIR",
  disabled: "unused",
} as const;

function statusPillStyle(status: CompilationItemReport["status"]): string {
  if (status === "gpu-ready") {
    return pillReadyStyle;
  }
  return status === "no-hir" ? pillWarnStyle : pillBlockedStyle;
}

/** Shown when nothing is selected, to explain how to see per-item detail. */
const SELECT_HINT = "Select a node to see its detail.";

const Group = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div>
    <div className={groupTitleStyle}>{title}</div>
    <ul className={listStyle}>{children}</ul>
  </div>
);

const CompilationContent: React.FC = () => {
  const { petriNetDefinition, extensions, getItemType } = use(SDCPNContext);
  const { requestHirArtifacts } = use(LanguageClientContext);
  const { selection, selectItem } = use(EditorContext);

  const [report, setReport] = useState<CompilationReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Compiling in the language worker is asynchronous, and the net changes as the
  // user edits, so a stale result must never overwrite a newer one.
  useEffect(() => {
    let cancelled = false;

    const analyze = async () => {
      try {
        const { artifacts } = await requestHirArtifacts(
          petriNetDefinition,
          extensions,
          // The report reads the HIR trees themselves, so they have to be asked
          // for — they are not carried by default.
          { includeHir: true },
        );
        if (cancelled) {
          return;
        }
        const parameterValues: Record<string, number> = {};
        for (const parameter of petriNetDefinition.parameters) {
          const value = Number(parameter.defaultValue);
          if (Number.isFinite(value)) {
            parameterValues[parameter.variableName] = value;
          }
        }
        setReport(
          analyzeCompilation({
            sdcpn: petriNetDefinition,
            artifacts,
            extensions,
            parameterValues,
          }),
        );
        setError(null);
      } catch (caught) {
        if (cancelled) {
          return;
        }
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    };

    void analyze();

    return () => {
      cancelled = true;
    };
  }, [petriNetDefinition, extensions, requestHirArtifacts]);

  if (error !== null) {
    return <div className={mutedStyle}>Could not analyse the net: {error}</div>;
  }
  if (report === null) {
    return <div className={mutedStyle}>Compiling…</div>;
  }

  const selectedIds = new Set(selection.keys());
  // With something selected, narrow to it — that is the question being asked.
  const shownItems =
    selectedIds.size > 0
      ? report.items.filter((item) => selectedIds.has(item.itemId))
      : report.items;
  const isNarrowed = selectedIds.size > 0 && shownItems.length > 0;

  const select = (itemId: string) => {
    const itemType = getItemType(itemId);
    if (itemType) {
      selectItem({ type: itemType, id: itemId });
    }
  };

  return (
    <div className={rootStyle}>
      <div className={verdictRowStyle}>
        <span
          className={cx(
            pillStyle,
            report.gpuReady ? pillReadyStyle : pillBlockedStyle,
          )}
        >
          <Icon name={report.gpuReady ? "circleCheck" : "dash"} size="xs" />
          {report.gpuReady ? "Runs on GPU" : "CPU only"}
        </span>
        {report.bytesPerRun !== null && (
          <span className={factStyle}>{report.bytesPerRun} B/run</span>
        )}
        {report.wgsl !== null && (
          <span className={factStyle}>
            {report.wgsl.split("\n").length} lines of WGSL
          </span>
        )}
        <span className={factStyle}>
          {report.items.length} compiled item
          {report.items.length === 1 ? "" : "s"}
        </span>
      </div>

      {report.eligibilityReasons.length > 0 && (
        <Group title="Blocks GPU compilation">
          {report.eligibilityReasons.map((reason) => (
            <li key={`${reason.code}:${reason.itemId ?? ""}`}>
              {reason.itemId === undefined ? (
                <span className={reasonStaticStyle}>
                  <span className={codeStyle}>{reason.code}</span>
                  <span>{reason.message}</span>
                </span>
              ) : (
                <button
                  type="button"
                  className={reasonButtonStyle}
                  onClick={() => select(reason.itemId!)}
                >
                  <span className={codeStyle}>{reason.code}</span>
                  <span>{reason.message}</span>
                </button>
              )}
            </li>
          ))}
        </Group>
      )}

      {report.shaderFailure !== null && (
        <Group title="Shader emission failed">
          <li className={reasonStaticStyle}>
            <span className={detailStyle}>{report.shaderFailure}</span>
          </li>
        </Group>
      )}

      {report.metricFailure !== null && (
        <Group title="Metrics">
          <li className={reasonStaticStyle}>
            <span>{report.metricFailure}</span>
          </li>
        </Group>
      )}

      {report.items.length > 0 && (
        <Group title={isNarrowed ? "Selected item" : "Compiled code"}>
          {shownItems.map((item) => (
            <li key={`${item.itemId}:${item.kind}`}>
              <button
                type="button"
                className={cx(
                  itemRowStyle,
                  selectedIds.has(item.itemId) && itemRowSelectedStyle,
                )}
                onClick={() => select(item.itemId)}
              >
                <span className={itemNameStyle}>
                  {item.itemName}{" "}
                  <span className={factStyle}>{KIND_LABEL[item.kind]}</span>
                </span>
                <span className={factStyle}>
                  {item.hirNodeCount === null
                    ? ""
                    : `${item.hirNodeCount} node${item.hirNodeCount === 1 ? "" : "s"}`}
                </span>
                <span className={cx(pillStyle, statusPillStyle(item.status))}>
                  {STATUS_LABEL[item.status]}
                </span>
              </button>
              {/* Only when narrowed, so the full list stays scannable. */}
              {isNarrowed && item.detail !== null && (
                <div className={detailStyle}>{item.detail}</div>
              )}
            </li>
          ))}
          {!isNarrowed && report.items.some((item) => item.detail !== null) && (
            <li className={mutedStyle}>{SELECT_HINT}</li>
          )}
        </Group>
      )}

      {report.items.length === 0 && (
        <div className={mutedStyle}>This net has no user code to compile.</div>
      )}
    </div>
  );
};

/**
 * SubView definition for Compilation output. Registered only when the
 * `showCompilationOutput` setting is on — see `ui-subviews.ts`.
 */
export const compilationSubView: SubView = {
  id: "compilation",
  title: "Compilation",
  tooltip:
    "How this net's code lowered to HIR, and what stops it running on the GPU.",
  component: CompilationContent,
};

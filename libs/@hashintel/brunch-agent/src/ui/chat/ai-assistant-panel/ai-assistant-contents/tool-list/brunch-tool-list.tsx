import { Collapsible } from "@ark-ui/react/collapsible";
import { useState } from "react";

import { Icon, LoadingSpinner } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { collapsibleContentStyle } from "../shared/collapsible-content-style";
import { useElapsedTime } from "../shared/use-elapsed-time";
import { InteractiveToolItem } from "./shared/interactive-tool-item";
import {
  toolDetailStyle,
  toolItemCollapsibleStyle,
  toolListStyle,
  toolSubItemListStyle,
  toolSubItemStyle,
  toolTextStyle,
} from "./shared/tool-row-styles";

import type { AiToolTarget } from "../../tool-summaries";
import type { OnInteractiveToolSubmit, ToolRenderItem } from "../tool-list";

const statusDotStyle = css({
  width: "[6px]",
  height: "[6px]",
  borderRadius: "full",
  flexShrink: 0,
  backgroundColor: "yellow.s90",
  '&[data-tool-status="ok"]': { backgroundColor: "green.s90" },
  '&[data-tool-status="error"]': { backgroundColor: "red.s90" },
  '&[data-tool-status="cancelled"]': {
    backgroundColor: "neutral.s80",
    height: "[2px]",
  },
});

const toolItemStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "2",
    width: "full",
    minHeight: "8",
    paddingX: "2",
    paddingY: "[5px]",
    border: "none",
    borderRadius: "md",
    backgroundColor: "[transparent]",
    color: "neutral.s90",
    fontSize: "xs",
    fontWeight: "medium",
    textAlign: "left",
    cursor: "default",
    _enabled: {
      cursor: "pointer",
    },
    _hover: { backgroundColor: "neutral.a20" },
    "& svg[data-chevron]": {
      marginLeft: "auto",
      transition: "[transform 150ms ease-out]",
    },
    "&[data-state=closed] svg[data-chevron]": {
      transform: "[rotate(90deg)]",
    },
    "&[data-state=open] svg[data-chevron]": {
      transform: "[rotate(180deg)]",
    },
  },
  variants: {
    tone: {
      danger: {
        color: "red.s100",
      },
      info: {
        color: "neutral.s100",
      },
      neutral: {
        color: "neutral.s90",
      },
      pending: {
        color: "neutral.s90",
      },
      success: {
        color: "neutral.s90",
      },
    },
    group: {
      true: {
        display: "inline-flex",
        width: "[fit-content]",
        minHeight: "[0]",
        padding: "[2px 6px 2px 2px]",
        gap: "1",
        color: "neutral.s80",
        _hover: { color: "neutral.s90" },
        _focusVisible: { outline: "[2px solid {colors.blue.s90}]" },
        "& svg[data-chevron]": { marginLeft: "0" },
      },
    },
  },
});

const toolPayloadStyle = css({
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
});

const ToolItem = ({
  onInteractiveToolSubmit,
  onSelectToolTarget,
  tool,
  active = false,
  stopped = false,
}: {
  onInteractiveToolSubmit?: OnInteractiveToolSubmit;
  onSelectToolTarget?: (target: AiToolTarget) => void;
  tool: ToolRenderItem;
  active?: boolean;
  stopped?: boolean;
}) => {
  const inProgress =
    tool.state === "input-streaming" || tool.state === "input-available";
  const cancelled = stopped && inProgress;
  const duration = useElapsedTime(active && inProgress && !tool.interactive);
  if (tool.interactive && !cancelled) {
    return (
      <InteractiveToolItem
        onInteractiveToolSubmit={onInteractiveToolSubmit}
        presentation="brunch"
        tool={tool}
      />
    );
  }

  const complete = tool.state === "output-available";
  const errored = tool.state === "output-error";
  const stateLabel = cancelled ? "Cancelled" : tool.stateLabel || undefined;
  const target = tool.summary.target;
  const href = tool.summary.href;
  const children = tool.summary.items ?? [];
  const title =
    errored && !tool.hasConfiguredTitle
      ? (tool.errorText ?? "Tool failed")
      : tool.summary.title;

  const button = (
    <button
      type="button"
      className={toolItemStyle({ tone: tool.tone })}
      data-tone={tool.tone}
      aria-busy={inProgress && !cancelled ? true : undefined}
      onClick={() => {
        if (target) {
          onSelectToolTarget?.(target);
        }
      }}
    >
      <span
        className={statusDotStyle}
        data-tool-status={
          cancelled
            ? "cancelled"
            : errored
              ? "error"
              : complete
                ? "ok"
                : "pending"
        }
        aria-label={
          cancelled
            ? "Cancelled"
            : errored
              ? "Error"
              : complete
                ? "Complete"
                : "Pending"
        }
      />
      <span className={toolTextStyle}>
        <span>{title}</span>
        {errored && !tool.hasConfiguredTitle ? (
          <span className={toolDetailStyle} data-testid="tool-detail">
            {tool.toolName}
          </span>
        ) : tool.summary.detail ? (
          <span className={toolDetailStyle} data-testid="tool-detail">
            {tool.summary.detail}
          </span>
        ) : null}
        {stateLabel && <span className={toolDetailStyle}>{stateLabel}</span>}
      </span>
      <span
        className={toolDetailStyle}
        title={duration === undefined ? "Duration unavailable" : undefined}
      >
        {duration === undefined ? "—" : `${(duration / 1_000).toFixed(1)}s`}
      </span>
      <Icon name="chevronUp" data-chevron size="sm" />
    </button>
  );

  return (
    <Collapsible.Root className={toolItemCollapsibleStyle} defaultOpen={false}>
      <Collapsible.Trigger asChild>{button}</Collapsible.Trigger>
      <Collapsible.Content className={collapsibleContentStyle}>
        <div className={toolSubItemListStyle}>
          <strong>{tool.toolName}</strong>
          {href && !errored && (
            <a href={href} target="_blank" rel="noopener noreferrer">
              Open user guide
            </a>
          )}
          <strong>Arguments</strong>
          <pre className={toolPayloadStyle}>
            {tool.input === undefined
              ? "Not available"
              : JSON.stringify(tool.input, null, 2)}
          </pre>
          <strong>Result</strong>
          <pre className={toolPayloadStyle}>
            {tool.errorText ??
              (tool.output === undefined
                ? cancelled
                  ? "Cancelled before a result was received"
                  : "Pending"
                : JSON.stringify(tool.output, null, 2))}
          </pre>
          {children.map((item, index) => (
            // oxlint-disable-next-line react/no-array-index-key
            <div className={toolSubItemStyle} key={`${tool.id}-${index}`}>
              {item}
            </div>
          ))}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};

/**
 * Tools folded behind a "Used N tools" summary, with pending interactive
 * tools kept outside the fold so their questions stay visible. A produced
 * card renders its tool directly.
 */
export const BrunchToolList = ({
  onInteractiveToolSubmit,
  onSelectToolTarget,
  tools,
  active,
  stopped,
  producedCard,
  preserveOpen,
}: {
  onInteractiveToolSubmit?: OnInteractiveToolSubmit;
  onSelectToolTarget?: (target: AiToolTarget) => void;
  tools: ToolRenderItem[];
  active: boolean;
  stopped: boolean;
  producedCard: boolean;
  preserveOpen: boolean;
}) => {
  const running =
    active &&
    !stopped &&
    tools.some(
      (tool) =>
        !tool.interactive &&
        (tool.state === "input-streaming" || tool.state === "input-available"),
    );
  const [disclosure, setDisclosure] = useState({
    running,
    open: preserveOpen ? active : running,
  });
  if (disclosure.running !== running)
    setDisclosure({ running, open: preserveOpen ? disclosure.open : running });
  if (tools.length === 0) {
    return null;
  }

  if (producedCard) {
    return (
      <div className={toolListStyle}>
        {tools.map((tool) => (
          <ToolItem
            key={tool.id}
            tool={tool}
            onInteractiveToolSubmit={onInteractiveToolSubmit}
            onSelectToolTarget={onSelectToolTarget}
          />
        ))}
      </div>
    );
  }

  return (
    <>
      <Collapsible.Root
        open={disclosure.open}
        onOpenChange={({ open }) => setDisclosure({ running, open })}
      >
        <Collapsible.Trigger
          className={toolItemStyle({ tone: "neutral", group: true })}
        >
          {running ? (
            <LoadingSpinner size="xs" aria-hidden="true" />
          ) : (
            <Icon name="lightning" size="xs" />
          )}
          {running
            ? "Running tools"
            : `${stopped ? "Stopped after" : "Used"} ${tools.length} ${tools.length === 1 ? "tool" : "tools"}`}
          <Icon name="chevronUp" size="xs" data-chevron />
        </Collapsible.Trigger>
        <Collapsible.Content className={collapsibleContentStyle}>
          <div
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "1",
              margin: "[2px 0 4px 7px]",
              paddingLeft: "2.5",
              borderLeft: "[2px solid {colors.neutral.a30}]",
            })}
          >
            {tools
              .filter(
                (tool) => !tool.interactive || tool.state !== "input-available",
              )
              .map((tool) => (
                <ToolItem
                  key={tool.id}
                  tool={tool}
                  active={active && !stopped}
                  stopped={stopped}
                  onInteractiveToolSubmit={onInteractiveToolSubmit}
                  onSelectToolTarget={onSelectToolTarget}
                />
              ))}
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
      {tools
        .filter((tool) => tool.interactive && tool.state === "input-available")
        .map((tool) => (
          <ToolItem
            key={tool.id}
            tool={tool}
            stopped={stopped}
            onInteractiveToolSubmit={onInteractiveToolSubmit}
            onSelectToolTarget={onSelectToolTarget}
          />
        ))}
    </>
  );
};

import { Collapsible } from "@ark-ui/react/collapsible";

import { Icon, LoadingSpinner } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { collapsibleContentStyle } from "../shared/collapsible-content-style";
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

const toolItemStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "2",
    width: "full",
    minHeight: "8",
    paddingX: "2",
    paddingY: "[5px]",
    borderWidth: "thin",
    borderStyle: "solid",
    borderRadius: "lg",
    color: "neutral.s90",
    fontSize: "sm",
    fontWeight: "medium",
    textAlign: "left",
    cursor: "default",
    _enabled: {
      cursor: "pointer",
    },
    "& svg[data-chevron]": {
      transition: "[transform 150ms ease-out]",
    },
    "&[data-state=closed] svg[data-chevron]": {
      transform: "[rotate(180deg)]",
    },
  },
  variants: {
    tone: {
      danger: {
        backgroundColor: "red.s20",
        borderColor: "red.a40",
      },
      info: {
        backgroundColor: "[#eff9ff]",
        borderColor: "[#bee6ff]",
        color: "[#0666c6]",
      },
      neutral: {
        backgroundColor: "neutral.s10",
        borderColor: "neutral.a30",
      },
      pending: {
        backgroundColor: "yellow.s20",
        borderColor: "yellow.a40",
      },
      success: {
        backgroundColor: "green.s20",
        borderColor: "green.a40",
      },
    },
    link: {
      true: {
        cursor: "pointer",
        textDecoration: "none",
      },
    },
  },
});

const toolStatusStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "[14px]",
    height: "[14px]",
    borderRadius: "full",
    flexShrink: 0,
    boxShadow: "[0px 0px 0px 1px white]",
    color: "white",
  },
  variants: {
    tone: {
      danger: {
        backgroundColor: "red.s90",
      },
      info: {
        backgroundColor: "[#2a80c8]",
      },
      neutral: {
        backgroundColor: "neutral.s90",
      },
      pending: {
        backgroundColor: "yellow.s90",
      },
      success: {
        backgroundColor: "green.s90",
      },
    },
    state: {
      active: {
        backgroundColor: "white",
        borderWidth: "thin",
        borderStyle: "dashed",
        borderColor: "blue.s70",
        color: "blue.s70",
      },
      complete: {},
      error: {
        backgroundColor: "red.s90",
      },
    },
  },
});

const toolProgressSpinnerStyle = css({
  "@media (prefers-reduced-motion: reduce)": {
    animation: "[none !important]",
  },
});

const ToolItem = ({
  onInteractiveToolSubmit,
  onSelectToolTarget,
  tool,
  stopped,
}: {
  onInteractiveToolSubmit?: OnInteractiveToolSubmit;
  onSelectToolTarget?: (target: AiToolTarget) => void;
  tool: ToolRenderItem;
  stopped: boolean;
}) => {
  const cancelled =
    stopped &&
    (tool.state === "input-streaming" || tool.state === "input-available");
  if (tool.interactive && !cancelled) {
    return (
      <InteractiveToolItem
        onInteractiveToolSubmit={onInteractiveToolSubmit}
        presentation="stock"
        tool={tool}
      />
    );
  }

  const complete = tool.state === "output-available";
  const errored = tool.state === "output-error";
  const stateLabel = cancelled ? "Cancelled" : tool.stateLabel || undefined;
  const inProgress =
    !cancelled &&
    (tool.state === "input-streaming" || tool.state === "input-available");
  const toolStatus = cancelled ? "cancelled" : undefined;
  const target = tool.summary.target;
  const href = tool.summary.href;
  const children = tool.summary.items ?? [];
  const expandable = children.length > 0;
  const title =
    errored && !tool.hasConfiguredTitle
      ? (tool.errorText ?? "Tool failed")
      : tool.summary.title;

  if (href && !errored) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={toolItemStyle({ tone: tool.tone, link: true })}
        data-tone={tool.tone}
        aria-busy={inProgress ? true : undefined}
      >
        <span
          className={toolStatusStyle({
            state: complete ? "complete" : "active",
            tone: tool.tone,
          })}
          data-tool-status={toolStatus}
        >
          {complete ? (
            <Icon name="check" size="xs" />
          ) : inProgress ? (
            <LoadingSpinner
              aria-hidden="true"
              className={toolProgressSpinnerStyle}
              data-tool-progress-spinner
              size="xs"
              variant="bars"
            />
          ) : null}
        </span>
        <span className={toolTextStyle}>
          <span>{title}</span>
          {tool.summary.detail && (
            <span className={toolDetailStyle} data-testid="tool-detail">
              {tool.summary.detail}
            </span>
          )}
          {stateLabel && <span className={toolDetailStyle}>{stateLabel}</span>}
        </span>
      </a>
    );
  }

  const button = (
    <button
      type="button"
      className={toolItemStyle({ tone: tool.tone })}
      data-tone={tool.tone}
      disabled={!target && !expandable}
      aria-busy={inProgress ? true : undefined}
      onClick={() => {
        if (target) {
          onSelectToolTarget?.(target);
        }
      }}
    >
      <span
        className={toolStatusStyle({
          state: errored ? "error" : complete ? "complete" : "active",
          tone: tool.tone,
        })}
        data-tool-status={toolStatus}
      >
        {errored ? (
          <Icon name="close" size="xs" />
        ) : tool.notApplied ? (
          <Icon name="dash" size="xs" data-tool-result-icon="not-applied" />
        ) : complete ? (
          <Icon name="check" size="xs" data-tool-result-icon="complete" />
        ) : inProgress ? (
          <LoadingSpinner
            aria-hidden="true"
            className={toolProgressSpinnerStyle}
            data-tool-progress-spinner
            size="xs"
            variant="bars"
          />
        ) : null}
      </span>
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
      {expandable && <Icon name="chevronUp" data-chevron size="sm" />}
    </button>
  );

  if (!expandable) {
    return button;
  }

  return (
    <Collapsible.Root className={toolItemCollapsibleStyle} defaultOpen={false}>
      <Collapsible.Trigger asChild>{button}</Collapsible.Trigger>
      <Collapsible.Content className={collapsibleContentStyle}>
        <div className={toolSubItemListStyle}>
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

/** Every tool as its own bordered row, in call order. */
export const StockToolList = ({
  onInteractiveToolSubmit,
  onSelectToolTarget,
  tools,
  stopped,
}: {
  onInteractiveToolSubmit?: OnInteractiveToolSubmit;
  onSelectToolTarget?: (target: AiToolTarget) => void;
  tools: ToolRenderItem[];
  stopped: boolean;
}) =>
  tools.length === 0 ? null : (
    <div className={toolListStyle}>
      {tools.map((tool) => (
        <ToolItem
          key={tool.id}
          tool={tool}
          stopped={stopped}
          onInteractiveToolSubmit={onInteractiveToolSubmit}
          onSelectToolTarget={onSelectToolTarget}
        />
      ))}
    </div>
  );

import { Box, Popper } from "@mui/material";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { openColumnWidth } from "./dependent-types-table-layout";
import {
  ellipsisWidth,
  getVersionGraphLayout,
  getVersionGraphTooltipMaxWidth,
  graphHeight,
  parentPillTop,
  pillHeight,
  pillTop,
  pillWidth,
} from "./version-graph-layout";

import type { DependentTypeRow } from "./dependent-type-rows";
import type { PopperProps, Theme } from "@mui/material";
import type { KeyboardEvent, ReactNode, RefObject } from "react";

export type VersionGraphTooltipTriggerProps = {
  /** Spread on the row: hovering it shows the tooltip, and the tooltip is placed against it. */
  rowProps: {
    ref: (element: HTMLElement | null) => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
  /** Spread on the row's toggle button: focusing it with the keyboard shows the tooltip at once. */
  toggleProps: {
    "aria-describedby"?: string;
    onFocusVisible: () => void;
    onBlur: () => void;
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  };
  /** Hides the tooltip, for example when the row is toggled. */
  hide: () => void;
};

const showDelay = 300;
const hideDelay = 120;
const arrowKeyScroll = 120;

/** Places the tooltip's right edge level with the left edge of the row's open column. */
const popperModifiers: PopperProps["modifiers"] = [
  { name: "offset", options: { offset: [-openColumnWidth, 0] } },
];

/** Hides the open tooltip, so that hovering another row can replace it at once. */
let hideOpenTooltip: (() => void) | null = null;

const visuallyHidden = {
  position: "absolute",
  width: 1,
  height: 1,
  m: "-1px",
  p: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

type PillLook = "parent" | "version" | "gap";

const pillLooks = ({ palette }: Theme) =>
  ({
    parent: {
      border: `1.5px solid ${palette.gray[70]}`,
      background: palette.common.white,
      color: palette.black,
      fontWeight: 700,
    },
    version: {
      border: `1px solid ${palette.gray[50]}`,
      background: palette.common.white,
      color: palette.gray[90],
      fontWeight: 500,
    },
    gap: {
      border: `1.5px dotted ${palette.gray[50]}`,
      background: "transparent",
      color: palette.gray[70],
      fontWeight: 500,
    },
  }) satisfies Record<PillLook, object>;

const Pill = ({
  x,
  top,
  version,
  look,
}: {
  x: number;
  top: number;
  version: number;
  look: PillLook;
}) => (
  <Box
    sx={(theme) => ({
      position: "absolute",
      left: x,
      top,
      width: pillWidth,
      height: pillHeight,
      boxSizing: "border-box",
      borderRadius: `${pillHeight / 2}px`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 11,
      lineHeight: 1,
      ...pillLooks(theme)[look],
    })}
  >
    {`v${version}`}
  </Box>
);

const Ellipsis = ({ x, top }: { x: number; top: number }) => (
  <Box
    sx={({ palette }) => ({
      position: "absolute",
      left: x,
      top,
      width: ellipsisWidth,
      height: pillHeight,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 13,
      lineHeight: 1,
      color: palette.gray[70],
    })}
  >
    …
  </Box>
);

/** A title that stays in view while the graph scrolls sideways. */
const GraphLabel = ({ x, children }: { x: number; children: ReactNode }) => (
  <Box
    sx={({ palette }) => ({
      position: "sticky",
      left: 0,
      width: "max-content",
      ml: `${x}px`,
      whiteSpace: "nowrap",
      fontSize: 12,
      lineHeight: "16px",
      fontWeight: 600,
      color: palette.black,
    })}
  >
    {children}
  </Box>
);

const VersionGraphCard = ({
  row,
  parentTitle,
  parentLatestVersion,
  maxWidth,
  scrollRef,
}: {
  row: DependentTypeRow;
  parentTitle: string;
  parentLatestVersion: number;
  maxWidth: number;
  scrollRef: RefObject<HTMLDivElement | null>;
}) => {
  const { title } = row.entityType.schema;

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element) {
      element.scrollLeft = element.scrollWidth;
    }
  }, [scrollRef]);

  const layout = getVersionGraphLayout({
    row,
    title,
    parentTitle,
    parentLatestVersion,
  });

  return (
    <Box
      sx={({ palette, boxShadows }) => ({
        width: "max-content",
        maxWidth,
        boxSizing: "border-box",
        px: 1.75,
        py: 1.5,
        background: palette.common.white,
        border: `1px solid ${palette.gray[30]}`,
        borderRadius: 1.5,
        boxShadow: boxShadows.md,
      })}
    >
      <Box component="span" sx={visuallyHidden}>
        {layout.summary}
      </Box>
      <Box
        ref={scrollRef}
        aria-hidden
        sx={{ overflowX: "auto", overflowY: "hidden" }}
      >
        <Box sx={{ width: layout.width }}>
          <GraphLabel x={layout.parentLabelX}>{parentTitle}</GraphLabel>
          <Box sx={{ position: "relative", height: graphHeight }}>
            <Box
              component="svg"
              width={layout.width}
              height={graphHeight}
              viewBox={`0 0 ${layout.width} ${graphHeight}`}
              sx={({ palette }) => ({
                position: "absolute",
                left: 0,
                top: 0,
                overflow: "visible",
                fill: "none",
                stroke: palette.gray[50],
                strokeWidth: 1.25,
                strokeLinecap: "round",
              })}
            >
              {layout.lines.map(({ version, parentVersion, path }) => (
                <path key={`${version}-${parentVersion}`} d={path} />
              ))}
            </Box>
            {layout.parentPills.map(({ version, x }) => (
              <Pill
                key={version}
                x={x}
                top={parentPillTop}
                version={version}
                look="parent"
              />
            ))}
            {layout.parentMoreX === null ? null : (
              <Ellipsis x={layout.parentMoreX} top={parentPillTop} />
            )}
            {layout.pills.map(({ version, x, gap }) => (
              <Pill
                key={version}
                x={x}
                top={pillTop}
                version={version}
                look={gap ? "gap" : "version"}
              />
            ))}
            {layout.moreX === null ? null : (
              <Ellipsis x={layout.moreX} top={pillTop} />
            )}
          </Box>
          <GraphLabel x={layout.labelX}>{title}</GraphLabel>
        </Box>
      </Box>
      {layout.pills.some(({ gap }) => gap) ? (
        <Box
          aria-hidden
          sx={({ palette }) => ({
            display: "flex",
            alignItems: "center",
            gap: 1,
            mt: 1.25,
            pt: 1,
            borderTop: `1px solid ${palette.gray[20]}`,
            fontSize: 12,
            lineHeight: "16px",
            color: palette.gray[80],
          })}
        >
          <Box
            component="span"
            sx={({ palette }) => ({
              flex: "none",
              width: 20,
              height: 14,
              boxSizing: "border-box",
              borderRadius: "7px",
              border: `1.5px dotted ${palette.gray[50]}`,
            })}
          />
          <span>{`version that doesn't extend ${parentTitle} now`}</span>
        </Box>
      ) : null}
    </Box>
  );
};

/**
 * Shows a graph of a dependent type's versions against the parent's versions
 * while its row is hovered or its toggle has focus.
 */
export const VersionGraphTooltip = ({
  row,
  parentTitle,
  parentLatestVersion,
  children,
}: {
  row: DependentTypeRow;
  parentTitle: string;
  parentLatestVersion: number;
  children: (props: VersionGraphTooltipTriggerProps) => ReactNode;
}) => {
  const id = useId();
  const [rowElement, setRowElement] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [maxWidth, setMaxWidth] = useState(0);
  const showTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scrollElement = useRef<HTMLDivElement | null>(null);

  const clearTimers = useCallback(() => {
    clearTimeout(showTimer.current);
    clearTimeout(hideTimer.current);
  }, []);

  const hide = useCallback(() => {
    clearTimers();
    setOpen(false);
  }, [clearTimers]);

  const show = useCallback(() => {
    clearTimers();
    if (hideOpenTooltip !== hide) {
      hideOpenTooltip?.();
    }
    setMaxWidth(
      getVersionGraphTooltipMaxWidth(rowElement?.offsetWidth ?? Infinity),
    );
    setOpen(true);
  }, [clearTimers, hide, rowElement]);

  const showSoon = useCallback(() => {
    if (hideOpenTooltip) {
      show();
      return;
    }
    clearTimers();
    showTimer.current = setTimeout(show, showDelay);
  }, [clearTimers, show]);

  const hideSoon = useCallback(() => {
    clearTimers();
    hideTimer.current = setTimeout(hide, hideDelay);
  }, [clearTimers, hide]);

  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    hideOpenTooltip = hide;
    const hideOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        hide();
      }
    };
    document.addEventListener("keydown", hideOnEscape);

    return () => {
      if (hideOpenTooltip === hide) {
        hideOpenTooltip = null;
      }
      document.removeEventListener("keydown", hideOnEscape);
    };
  }, [open, hide]);

  const scrollWithArrowKeys = (event: KeyboardEvent<HTMLElement>) => {
    if (
      !open ||
      !scrollElement.current ||
      (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
    ) {
      return;
    }
    scrollElement.current.scrollBy({
      left: event.key === "ArrowRight" ? arrowKeyScroll : -arrowKeyScroll,
      behavior: "smooth",
    });
    event.preventDefault();
  };

  return (
    <>
      {children({
        rowProps: {
          ref: setRowElement,
          onMouseEnter: showSoon,
          onMouseLeave: hideSoon,
        },
        toggleProps: {
          "aria-describedby": open ? id : undefined,
          onFocusVisible: show,
          onBlur: hide,
          onKeyDown: scrollWithArrowKeys,
        },
        hide,
      })}
      <Popper
        id={id}
        open={open}
        anchorEl={rowElement}
        placement="bottom-end"
        modifiers={popperModifiers}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        sx={{
          zIndex: "tooltip",
          pt: 0.75,
          '&[data-popper-placement^="top"]': { pt: 0, pb: 0.75 },
        }}
      >
        <VersionGraphCard
          row={row}
          parentTitle={parentTitle}
          parentLatestVersion={parentLatestVersion}
          maxWidth={maxWidth}
          scrollRef={scrollElement}
        />
      </Popper>
    </>
  );
};

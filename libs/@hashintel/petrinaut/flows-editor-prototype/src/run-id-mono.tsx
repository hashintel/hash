/**
 * Run IDs in JetBrains Mono, Petrinaut's mono (#lib-designsystem, 9 Nov: use the app's existing mono). `?runidmono=`
 * picks a styling take; unset keeps today's IDs. Every take shows 4 characters and sets the size in em, so it follows
 * the text around it (13/14 or 12/14 of a 14 px row). Take c was a with another font, so it now shows a.
 *
 * | take | case  | tracking | size | weight | chip | copy               |
 * | a    | CAPS  | 0.02em   | 13   | 500    | –    | icon on hover      |
 * | b    | CAPS  | 0.05em   | 12   | 500    | yes  | icon on hover      |
 * | d    | CAPS  | 0.05em   | 12   | 400    | yes  | click, then toast  |
 * | e    | lower | 0        | 13   | 400    | –    | click, then toast  |
 * | f    | lower | 0        | 13   | 500    | –    | click, then toast  |
 *
 * The chip shows only where the ID stands alone (the Logs ID column, the run panel title). Copying takes the full
 * UUID. The run picker and its menu rows show the ID without a copy control, since the whole
 * control already opens the menu.
 */
import { type MouseEvent, type PointerEvent, useEffect, useState } from "react";

import { Icon, Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { CODE_FONT_FAMILY } from "../../src/ui/constants/fonts";

import { Toast } from "./ui";

export type RunIdMonoTake = "a" | "b" | "d" | "e" | "f";

type MonoSpec = {
  caps: boolean;
  tracking: string;
  size: number;
  weight: number;
  chip: boolean;
  copy: "icon" | "toast";
};

export const monoSpecs: Record<RunIdMonoTake, MonoSpec> = {
  a: { caps: true, tracking: "0.02em", size: 13, weight: 500, chip: false, copy: "icon" },
  b: { caps: true, tracking: "0.05em", size: 12, weight: 500, chip: true, copy: "icon" },
  d: { caps: true, tracking: "0.05em", size: 12, weight: 400, chip: true, copy: "toast" },
  e: { caps: false, tracking: "0", size: 13, weight: 400, chip: false, copy: "toast" },
  f: { caps: false, tracking: "0", size: 13, weight: 500, chip: false, copy: "toast" },
};

export const runIdMonoTake = (): RunIdMonoTake | null => {
  const query = new URLSearchParams(globalThis.location.search);
  const value = query.get("runidmono");
  // The copy takes hold the styling at a.
  if (!value && runIdCopyTake()) {
    return "a";
  }
  if (value === "c") {
    return "a";
  }
  return value && value in monoSpecs ? (value as RunIdMonoTake) : null;
};

// JetBrains Mono is loaded in main.tsx, as Petrinaut loads it.
const monoFont = CODE_FONT_FAMILY;

const wrapStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  verticalAlign: "baseline",
  "& [data-copy-id]": { opacity: "0" },
  "&:hover [data-copy-id], & [data-copy-id]:focus-visible": { opacity: "1" },
});

const chipStyle = css({
  paddingX: "1",
  borderRadius: "sm",
  backgroundColor: "neutral.bg.subtle",
  lineHeight: "[1.5]",
});

const copyButtonStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[16px]",
  height: "[16px]",
  borderRadius: "sm",
  color: "neutral.fg.subtle",
  cursor: "pointer",
  _hover: { color: "neutral.fg.body", backgroundColor: "neutral.bg.subtle" },
});

const clickCopyStyle = css({
  cursor: "copy",
  borderRadius: "sm",
  _hover: {
    textDecoration: "underline",
    textDecorationColor: "neutral.bd.solid",
    textUnderlineOffset: "[3px]",
  },
});

/**
 * `?runidcopy=h1|h2|h4|h1t` (inbox run-id-mono; Aakarsh, 10 Nov: click opens the run, copy is the hover icon only).
 * Styling stays at take a. A click anywhere on the row, the ID included, opens the run; only the icon copies.
 * h1 · the icon right after the ID, shown while the row is hovered; its space is kept, so nothing shifts.
 * h2 · the same icon, shown only while the ID itself is hovered.
 * h4 · on row hover the ID gets a faint chip with the icon inside it.
 * h1t · h1, with the "Copied run ID 2C07" toast after copying instead of the tick.
 * After copying (h1, h2, h4) the icon turns into a tick for 1.5 s and its tooltip reads "Copied".
 */
export type RunIdCopyTake = "h1" | "h2" | "h4" | "h1t";

export const runIdCopyTake = (): RunIdCopyTake | null => {
  const value = new URLSearchParams(globalThis.location.search).get(
    "runidcopy",
  );
  // Picked H2 (Aakarsh, 10 Nov 16:15): the icon shows only when the ID is hovered. ?runidcopy=today keeps the old IDs.
  if (value === "today") {
    return null;
  }
  return value === "h1" || value === "h2" || value === "h4" || value === "h1t"
    ? value
    : "h2";
};

const hoverWrapStyle = css({
  display: "inline-flex",
  alignItems: "center",
  // DS xs button: 4 px between label and icon (Aakarsh, 10 Nov).
  gap: "1",
  verticalAlign: "middle",
  borderRadius: "md",
  "& [data-copy-id]": { opacity: "0", transition: "[opacity 120ms ease]" },
  "& [data-copy-id]:focus-visible, & [data-copy-id][data-copied]": { opacity: "1" },
  "&[data-take=h1] , &[data-take=h1t]": {
    ":is(tr, [role=menuitem], [data-highlighted], [data-run-id-row]):hover &": { "& [data-copy-id]": { opacity: "1" } },
  },
  "&[data-take=h2]:hover [data-copy-id]": { opacity: "1" },
  // A row that opens the run: a Logs table row, a run dropdown row, the run panel header.
  // h4: the chip's padding is always there, so the text never moves; only its fill comes in.
  "&[data-take=h4]": {
    paddingLeft: "[4px]",
    marginLeft: "[-4px]",
    transition: "[background-color 120ms ease]",
    ":is(tr, [role=menuitem], [data-highlighted], [data-run-id-row]):hover &": {
      // One alpha step over whatever the row's hover fill is, so the chip reads on a grey row and a white one.
      backgroundColor: "neutral.a10",
      "& [data-copy-id]": { opacity: "1" },
      "& [data-copy-id]:hover": { backgroundColor: "neutral.a10" },
    },
  },
});

const hoverButtonStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: "[20px]",
  height: "[20px]",
  padding: "[0]",
  border: "none",
  borderRadius: "sm",
  background: "[transparent]",
  color: "neutral.fg.subtle",
  cursor: "pointer",
  "& svg": { width: "[14px !important]", height: "[14px !important]" },
  // An alpha step, so the fill darkens a grey hovered row instead of showing a white square on it.
  _hover: { color: "neutral.fg.heading", backgroundColor: "neutral.a10" },
});

/** The copy-take ID: the text, then the icon button; only the button copies. */
const HoverCopyId = ({
  text,
  uuid,
  take,
  style,
}: {
  text: string;
  uuid: string;
  take: RunIdCopyTake;
  style: React.CSSProperties;
}) => {
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!copied) {
      return undefined;
    }
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  // The menu and the row act on pointer down and up as well as click, so the icon keeps all three to itself.
  const keep = (event: MouseEvent | PointerEvent) => {
    event.stopPropagation();
  };
  return (
    <span className={hoverWrapStyle} data-take={take} data-run-id-mono="a" data-run-id-copy={take}>
      <span style={style}>{text}</span>
      <Tooltip content={copied ? "Copied" : "Copy run ID"} position="top" openDelay="fast">
        <button
          type="button"
          className={hoverButtonStyle}
          aria-label={`Copy run ID ${text}`}
          data-copy-id
          data-copied={copied || undefined}
          onPointerDown={keep}
          onPointerUp={keep}
          onMouseDown={keep}
          onMouseUp={keep}
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            copyText(uuid);
            if (take === "h1t") {
              setToast(`Copied run ID ${text}`);
            } else {
              setCopied(true);
            }
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Icon name={copied ? "check" : "copy"} size="xs" />
        </button>
      </Tooltip>
      {toast ? <Toast text={toast} onDone={() => setToast(null)} /> : null}
    </span>
  );
};

const copyText = (text: string) => {
  void navigator.clipboard?.writeText(text).catch(() => undefined);
};

/** The short ID in the take's mono. With `copyable`, it copies the full UUID: an icon on hover, or a click and a toast. */
export const MonoRunId = ({
  id,
  uuid,
  monoTake,
  copyable = false,
}: {
  id: string;
  uuid: string;
  monoTake: RunIdMonoTake;
  copyable?: boolean;
}) => {
  const spec = monoSpecs[monoTake];
  const [toast, setToast] = useState<string | null>(null);
  const style = {
    fontFamily: monoFont,
    fontSize: `${(spec.size / 14).toFixed(3)}em`,
    fontWeight: spec.weight,
    letterSpacing: spec.tracking,
    fontVariantNumeric: "normal",
  };
  const text = spec.caps ? id.toUpperCase() : id.toLowerCase();
  const stop = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
  };
  // Inside a line ("Run 2C07 · Today, 08:15") the chip breaks the sentence, so it stays bare there.
  if (!copyable) {
    return (
      <span
        style={style}
        data-run-id-mono={monoTake}
      >
        {text}
      </span>
    );
  }
  const copyTake = runIdCopyTake();
  if (copyTake) {
    return <HoverCopyId text={text} uuid={uuid} take={copyTake} style={style} />;
  }
  if (spec.copy === "icon") {
    return (
      <span className={wrapStyle} data-run-id-mono={monoTake}>
        <span className={cx(spec.chip && chipStyle)} style={style}>
          {text}
        </span>
        <button
          type="button"
          className={copyButtonStyle}
          aria-label={`Copy run ID ${text}`}
          title="Copy run ID"
          data-copy-id
          onClick={(event) => {
            stop(event);
            copyText(uuid);
          }}
        >
          <Icon name="copy" size="xs" />
        </button>
      </span>
    );
  }
  return (
    <>
      <span
        role="button"
        tabIndex={0}
        className={cx(clickCopyStyle, spec.chip && chipStyle)}
        style={style}
        title="Copy run ID"
        data-run-id-mono={monoTake}
        onClick={(event) => {
          stop(event);
          copyText(uuid);
          setToast(`Copied run ID ${text}`);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            copyText(uuid);
            setToast(`Copied run ID ${text}`);
          }
        }}
      >
        {text}
      </span>
      {toast ? <Toast text={toast} onDone={() => setToast(null)} /> : null}
    </>
  );
};

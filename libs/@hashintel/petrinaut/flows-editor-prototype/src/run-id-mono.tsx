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
import { type MouseEvent, useState } from "react";

import { Icon } from "@hashintel/ds-components";
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
  const value = new URLSearchParams(globalThis.location.search).get(
    "runidmono",
  );
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

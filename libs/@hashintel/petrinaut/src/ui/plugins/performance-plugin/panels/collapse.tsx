import { useId, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";
import { ChevronDownIcon } from "@hashintel/ds-icons";

import type { ReactNode } from "react";

export const Collapse = ({
  open,
  animate,
  id,
  children,
}: {
  open: boolean;
  animate: boolean;
  id?: string;
  children: ReactNode;
}) => {
  const [retained, setRetained] = useState(open);
  if ((open || !animate) && retained !== open) setRetained(open);
  return (
    <div
      id={id}
      aria-hidden={!open}
      inert={!open}
      data-open={open || undefined}
      data-animated={animate || undefined}
      className={css({
        display: "grid",
        gridTemplateRows: "[0fr]",
        opacity: "0",
        "&[data-open]": { gridTemplateRows: "[1fr]", opacity: "1" },
        "&[data-animated]": {
          transition:
            "[grid-template-rows 220ms cubic-bezier(0.2, 0, 0, 1), opacity 180ms ease]",
        },
      })}
      onTransitionEnd={(event) => {
        if (
          event.target === event.currentTarget &&
          event.propertyName === "grid-template-rows" &&
          !open
        )
          setRetained(false);
      }}
    >
      <div className={css({ minHeight: "[0]", overflow: "hidden" })}>
        {retained && children}
      </div>
    </div>
  );
};

export const Disclosure = ({
  title,
  animate,
  initiallyOpen = false,
  children,
}: {
  title: string;
  animate: boolean;
  initiallyOpen?: boolean;
  children: ReactNode;
}) => {
  const [open, setOpen] = useState(initiallyOpen);
  const id = useId();
  return (
    <div
      className={css({
        borderTop: "[1px solid rgba(255,255,255,0.10)]",
        paddingTop: "[10px]",
        marginTop: "[10px]",
      })}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "[6px]",
          width: "[100%]",
          textAlign: "left",
          cursor: "pointer",
          fontSize: "[12px]",
          fontWeight: "medium",
          color: "[#f6f7f9]",
          _focusVisible: {
            outline: "[2px solid #6b8aff]",
            outlineOffset: "[3px]",
          },
        })}
      >
        <ChevronDownIcon
          size={12}
          style={{
            transform: open ? undefined : "rotate(-90deg)",
            transition: animate ? "transform 220ms ease" : undefined,
          }}
        />
        {title}
      </button>
      <Collapse open={open} animate={animate} id={id}>
        <div className={css({ paddingTop: "[8px]" })}>{children}</div>
      </Collapse>
    </div>
  );
};

import { useRef, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { focusForward, focusLands } from "./focus-flow";
import { FocusRoot } from "./focus-stack";
import { useFocusMember } from "./use-focus-member";

import type { FocusAxis, FocusDirection } from "./focus-flow";

const contentsStyle = css({ display: "contents" });

export const FocusControls: React.FC<{
  children: React.ReactNode;
  axis?: FocusAxis;
}> = ({ children, axis = "vertical" }) => {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const remembered = useRef<HTMLElement | null>(null);
  const controls = () =>
    Array.from(
      root?.querySelectorAll<HTMLElement>(
        'button, input:not([type="hidden"]), textarea, select, [tabindex="0"]',
      ) ?? [],
    ).filter(
      (control) =>
        control.closest("[data-focus-controls]") === root &&
        !control.closest('[inert], [hidden], [aria-hidden="true"]') &&
        !control.matches(
          ':disabled, [aria-disabled="true"], span[data-scope="tooltip"][data-part="trigger"]',
        ) &&
        control.tabIndex >= 0,
    );
  const member = useFocusMember((entry) => {
    const candidates = controls();
    if (remembered.current && candidates.includes(remembered.current)) {
      return focusLands(remembered.current);
    }
    return (
      focusForward(entry.direction) ? candidates : candidates.reverse()
    ).some((control) => focusLands(control));
  });

  return (
    <div
      ref={(element) => {
        setRoot(element);
        member.attach(element);
      }}
      className={contentsStyle}
      data-focus-controls={axis}
      onFocus={(event) => {
        if (event.target instanceof HTMLElement) {
          remembered.current = event.target;
        }
      }}
      onKeyDownCapture={(event) => {
        const target = event.target;
        if (
          !(target instanceof HTMLElement) ||
          target.closest("[data-focus-controls]") !== root ||
          target.closest('.monaco-editor, [contenteditable="true"]') ||
          event.altKey ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          target.closest('[data-scope="select"][data-part="content"]') ||
          (target.hasAttribute("aria-haspopup") &&
            target.getAttribute("aria-expanded") === "true")
        ) {
          return;
        }
        const direction: FocusDirection | undefined = {
          ArrowLeft: "left",
          ArrowRight: "right",
          ArrowUp: "up",
          ArrowDown: "down",
        }[event.key] as FocusDirection | undefined;
        if (!direction) {
          return;
        }
        const horizontal = direction === "left" || direction === "right";
        if (
          horizontal &&
          (target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement)
        ) {
          if (
            target.selectionStart !== null &&
            target.selectionEnd !== null &&
            (target.selectionStart !== target.selectionEnd ||
              (direction === "left"
                ? target.selectionStart > 0
                : target.selectionEnd < target.value.length))
          ) {
            return;
          }
        }
        const candidates = controls();
        const index = candidates.indexOf(target);
        if (index < 0) {
          if (remembered.current === target && member.moveFrom(direction)) {
            event.preventDefault();
            event.stopPropagation();
          }
          return;
        }
        const alongAxis = horizontal === (axis === "horizontal");
        const next = alongAxis
          ? candidates[index + (focusForward(direction) ? 1 : -1)]
          : undefined;
        if (focusLands(next) || member.moveFrom(direction)) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <FocusRoot>{children}</FocusRoot>
    </div>
  );
};

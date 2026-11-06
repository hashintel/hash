/**
 * The bottom-left settings: a gear button opening a panel with the fields
 * the deck puts in it, then the presenter window. A native popover, so
 * focus, Escape and light dismiss come from the browser.
 */

import { useId, useRef, useState } from "react";

import { ExternalLinkIcon, SettingsIcon } from "@hashintel/ds-icons";

import { usePointerProximity } from "./use-pointer-proximity";

import type { ReactNode } from "react";

export const Settings = ({
  onOpenPresenter,
  children,
}: {
  onOpenPresenter: () => void;
  children: ReactNode;
}) => {
  const shellRef = useRef<HTMLDivElement>(null);
  const near = usePointerProximity(shellRef);
  const popoverId = useId();
  const [open, setOpen] = useState(false);
  return (
    <div ref={shellRef} className="deck-settings" data-near={near}>
      <button
        type="button"
        className="deck-settings__trigger"
        popoverTarget={popoverId}
        aria-label="Settings"
        title="Settings"
      >
        <SettingsIcon open={open} />
      </button>
      <div
        id={popoverId}
        popover="auto"
        className="deck-settings__content"
        onToggle={(event) => setOpen(event.newState === "open")}
      >
        {children}
        <button type="button" onClick={onOpenPresenter}>
          <ExternalLinkIcon size={14} />
          Open presenter notes
        </button>
        <p>Arrow keys step. F for fullscreen.</p>
      </div>
    </div>
  );
};

export const SettingsSelect = <Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
}) => {
  const id = useId();
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const chosen = options.find(
            (option) => option.value === event.target.value,
          );
          if (chosen !== undefined) {
            onChange(chosen.value);
          }
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  );
};

export const SettingsSwitch = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <label className="deck-settings__switch">
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
    {label}
  </label>
);

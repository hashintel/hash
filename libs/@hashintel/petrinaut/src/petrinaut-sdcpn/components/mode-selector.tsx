import { css } from "@hashintel/ds-helpers/css";

export interface ModeSelectorProps {
  mode: "edit" | "simulate";
  onChange: (mode: "edit" | "simulate") => void;
}

export const ModeSelector = ({ mode, onChange }: ModeSelectorProps) => {
  return (
    <div
      className={css({
        background: "[white]",
        border: "1px solid",
        borderColor: "core.gray.20",
        borderRadius: "radius.8",
        padding: "spacing.1",
        display: "flex",
        gap: "spacing.1",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
      })}
    >
      <button
        type="button"
        onClick={() => onChange("edit")}
        className={css({
          padding: "spacing.2",
          paddingX: "spacing.4",
          fontSize: "size.textsm",
          fontWeight: "medium",
          border: "none",
          borderRadius: "radius.6",
          cursor: "pointer",
          transition: "[all 150ms]",
          background: mode === "edit" ? "core.gray.90" : "[transparent]",
          color: mode === "edit" ? "[white]" : "core.gray.70",
          _hover: {
            backgroundColor: mode === "edit" ? "core.gray.80" : "core.gray.10",
          },
        })}
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => onChange("simulate")}
        className={css({
          padding: "spacing.2",
          paddingX: "spacing.4",
          fontSize: "size.textsm",
          fontWeight: "medium",
          border: "none",
          borderRadius: "radius.6",
          cursor: "pointer",
          transition: "[all 150ms]",
          background: mode === "simulate" ? "core.gray.90" : "[transparent]",
          color: mode === "simulate" ? "[white]" : "core.gray.70",
          _hover: {
            backgroundColor:
              mode === "simulate" ? "core.gray.80" : "core.gray.10",
          },
        })}
      >
        Simulate
      </button>
    </div>
  );
};

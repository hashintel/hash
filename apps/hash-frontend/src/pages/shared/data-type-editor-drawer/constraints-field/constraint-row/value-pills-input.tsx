import { Box } from "@mui/material";
import { useState } from "react";

import { Chip } from "@hashintel/ds-components";

/**
 * A free-text pill input styled to match the multi Combobox at size `sm`:
 * same ds frame tokens (resting/hover border, hover fill, focus outline,
 * radius, paddings) and the same chip size the Combobox uses in an `sm`
 * input.
 */
export const ValuePillsInput = ({
  values,
  numeric,
  onChange,
  readonly,
}: {
  values: (string | number)[];
  numeric: boolean;
  onChange: (values: (string | number)[]) => void;
  readonly?: boolean;
}) => {
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);

  const commitDraft = () => {
    const text = draft.trim();

    if (!text) {
      return;
    }

    const value: string | number = numeric ? Number(text) : text;

    if (typeof value === "number" && !Number.isFinite(value)) {
      setInvalid(true);
      return;
    }

    if (!values.includes(value)) {
      onChange([...values, value]);
    }
    setDraft("");
  };

  return (
    <Box
      component="label"
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 0.5,
        flex: 1,
        maxWidth: 420,
        padding: "2px 10px",
        background: "var(--colors-white)",
        border: "1px solid var(--colors-neutral-s40)",
        borderRadius: "var(--radii-lg)",
        cursor: "text",
        transition: "background 0.15s ease, border 0.15s ease",
        "&:hover": {
          borderColor: "var(--colors-neutral-s80)",
          background: "var(--colors-neutral-s10)",
        },
        "&:focus-within": {
          outline: "1px solid var(--colors-neutral-s40)",
        },
      }}
    >
      {values.map((value) => (
        <Chip
          key={String(value)}
          size="md"
          removeable={
            readonly
              ? false
              : {
                  onRemove: () =>
                    onChange(values.filter((existing) => existing !== value)),
                  "aria-label": `Remove ${String(value)}`,
                }
          }
        >
          {String(value)}
        </Chip>
      ))}
      <Box
        component="input"
        readOnly={readonly}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setInvalid(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitDraft();
          } else if (
            event.key === "Backspace" &&
            !readonly &&
            draft === "" &&
            values.length > 0
          ) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={commitDraft}
        placeholder={
          values.length > 0 || readonly
            ? ""
            : numeric
              ? "Type a number, press Enter"
              : "Type a value, press Enter"
        }
        aria-label="Add a permitted value"
        aria-invalid={invalid || undefined}
        // Inline style: the ds layer polyfill's specificity boost beats an
        // sx class, but not an inline declaration
        style={{
          color: invalid ? "var(--colors-status-error-s90)" : undefined,
        }}
        sx={{
          flex: 1,
          minWidth: 100,
          border: "none",
          outline: "none",
          background: "transparent",
          fontFamily: "inherit",
          fontSize: 14,
          lineHeight: 1.6,
          padding: "2px 0",
          color: "var(--colors-fg-body)",
          "&::placeholder": {
            color: "var(--colors-neutral-s80)",
          },
        }}
      />
    </Box>
  );
};

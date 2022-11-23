import { TextField } from "@hashintel/hash-design-system";

export const InlineTextEditor = ({
  value,
  onChange,
  onEnterPressed,
}: {
  value: string;
  onChange: (value: string) => void;
  onEnterPressed: () => void;
}) => {
  return (
    <TextField
      value={value}
      onChange={(event) => onChange(event.target.value)}
      autoFocus
      placeholder="Start typing..."
      variant="standard"
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.stopPropagation();
          onEnterPressed();
        }
      }}
      sx={{ p: 2, width: "100%" }}
    />
  );
};

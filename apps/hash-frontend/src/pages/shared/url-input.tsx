import { Select, TextField } from "@hashintel/design-system";
import { Stack } from "@mui/material";

import { MenuItem } from "../../shared/ui/menu-item";

const protocols = ["https", "http"] as const;

type Protocol = (typeof protocols)[number];

const partsFromUrl = (url: string): { protocol: Protocol; rest: string } => {
  if (!url) {
    return { protocol: "https", rest: "" };
  }

  const [protocol, rest] = url.split("://");

  if (!protocol) {
    return { protocol: "https", rest: "" };
  }

  return { protocol: protocol as Protocol, rest: rest ?? "" };
};

export const UrlInput = ({
  autoFocus,
  onChange,
  placeholder,
  value,
}: {
  autoFocus: boolean;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) => {
  const { protocol, rest } = partsFromUrl(value);

  return (
    <Stack direction="row" gap={2}>
      <Select
        value={protocol}
        onChange={(event) => {
          const newProtocol = event.target.value as Protocol;
          onChange(`${newProtocol}://${rest}`);
        }}
        sx={{
          width: 110,
          "& svg": { color: ({ palette }) => palette.gray[30] },
        }}
      >
        {protocols.map((option) => (
          <MenuItem key={option} value={option}>
            {option}://
          </MenuItem>
        ))}
      </Select>
      <TextField
        autoFocus={autoFocus}
        inputProps={{
          pattern: "\\S+\\.\\w+(\\/\\S*)?",
          title: "Please enter a valid domain",
        }}
        onChange={(event) => {
          const newRest = event.target.value;
          onChange(`${protocol}://${newRest}`);
        }}
        placeholder={placeholder}
        sx={{ width: "100%" }}
        type="text"
        value={rest}
      />
    </Stack>
  );
};

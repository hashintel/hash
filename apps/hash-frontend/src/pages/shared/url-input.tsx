import { Select, TextField } from "@hashintel/design-system";
import { Stack } from "@mui/material";
import debounce from "lodash/debounce";
import { useEffect, useState } from "react";

import { MenuItem } from "../../shared/ui/menu-item";

const protocols = ["https://", "http://"] as const;

type Protocol = (typeof protocols)[number];

const protocolFromUrl = (url: string): Protocol => {
  if (!url) {
    return "https://";
  }

  try {
    const urlObject = new URL(url);
    if (!protocols.includes(urlObject.protocol as Protocol)) {
      return "https://";
    }

    return urlObject.protocol as Protocol;
  } catch {
    return "https://";
  }
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
  const [protocol, setProtocol] = useState<Protocol>(() => {
    return protocolFromUrl(value);
  });
  const [rest, setRest] = useState(() => value.split("://").at(-1));

  useEffect(() => {
    setProtocol(protocolFromUrl(value));
    setRest(value.split("://").at(-1));
  }, [value]);

  const updateValue = debounce((fullUrl: string) => {
    onChange(fullUrl);
  }, 300);

  return (
    <Stack direction="row" gap={2}>
      <Select
        value={protocol}
        onChange={(event) => {
          const newProtocol = event.target.value as Protocol;
          setProtocol(newProtocol);
          updateValue(newProtocol + rest);
        }}
        sx={{ width: 100 }}
      >
        {protocols.map((option) => (
          <MenuItem key={option} value={option}>
            {option}
          </MenuItem>
        ))}
      </Select>
      <TextField
        autoFocus={autoFocus}
        inputProps={{
          pattern: "\\S+\\.\\w+",
          title: "Please enter a valid domain",
        }}
        onChange={(event) => {
          const newRest = event.target.value;
          setRest(newRest);
          updateValue(protocol + newRest);
        }}
        placeholder={placeholder}
        sx={{ width: "100%" }}
        type="text"
        value={rest}
      />
    </Stack>
  );
};

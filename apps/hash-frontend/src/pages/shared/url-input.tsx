import { Select, TextField } from "@hashintel/design-system";
import { outlinedInputClasses, Stack } from "@mui/material";
import { useState } from "react";

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
  disabled,
  onChange,
  placeholder,
  value,
  width,
}: {
  autoFocus: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  placeholder: string;
  width?: number;
  value: string;
}) => {
  const { protocol: protocolFromValue, rest } = partsFromUrl(value);

  /**
   * We track changes to the protocol internally because we want to send an empty string to onChange if there is no domain set,
   * but still want to track user changing the protocol when editing even if the domain is empty.
   */
  const [protocol, setProtocol] = useState<Protocol>(protocolFromValue);

  return (
    <Stack direction="row">
      <Select
        disabled={disabled}
        value={protocol}
        onChange={(event) => {
          const newProtocol = event.target.value as Protocol;

          setProtocol(newProtocol);

          if (rest.trim()) {
            onChange(`${newProtocol}://${rest}`);
          } else {
            /**
             * Set the value to an empty string if the domain is empty, because it's not yet a valid URL.
             */
            onChange("");
          }
        }}
        sx={{
          [`& .${outlinedInputClasses.root}`]: {
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0,
          },
          [`.${outlinedInputClasses.notchedOutline}`]: {
            borderRight: "none",
          },
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
        disabled={disabled}
        inputProps={{
          pattern: "\\S+\\.\\w+(\\/\\S*)?",
          title: "Please enter a valid domain",
        }}
        onChange={(event) => {
          /**
           * Account for users entering the protocol into the rest field, e.g. by pasting a full URL
           */
          const [_, maybeProtocol, maybeRest] =
            event.target.value.match("^(https?)://(.*)$") ?? [];

          if (maybeProtocol) {
            setProtocol(maybeProtocol as Protocol);
          }

          const domain = maybeRest?.replace(/\/$/, "") ?? event.target.value;

          if (!domain.trim()) {
            /**
             * Wipe the entire string if the domain is empty, because it's not yet a valid URL.
             * We will still have captured any protocol if one is pasted in (i.e. user pastes in 'https://' or 'http://')
             */
            onChange("");
          } else {
            const newProtocol = maybeProtocol
              ? (maybeProtocol as Protocol)
              : protocol;
            onChange(`${newProtocol}://${domain}`);
          }
        }}
        placeholder={placeholder}
        sx={{
          width: width ?? "100%",
          [`.${outlinedInputClasses.notchedOutline}`]: {
            borderLeftColor: "transparent",
          },
          [`& .${outlinedInputClasses.root}`]: {
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
          },
        }}
        type="text"
        value={rest}
      />
    </Stack>
  );
};

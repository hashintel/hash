import { Box, SxProps, Theme, Typography } from "@mui/material";
import { ReactElement, useEffect, useRef, useState } from "react";
import { useKey } from "rooks";

import { SpinnerIcon } from "../../../shared/icons";

export interface SuggesterProps<T> {
  options: T[];
  renderItem(item: T): ReactElement;
  error?: ReactElement | null;
  onChange(item: T): void;
  loading?: boolean;
  itemKey(option: T): string;
  sx?: SxProps<Theme>;
}

/**
 * used to present list of suggestions to choose from to the user
 */
export const Suggester = <T,>({
  onChange,
  options,
  loading,
  itemKey,
  renderItem,
  error,
  sx = [],
}: SuggesterProps<T>) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // reset selected index if it exceeds the options available
  if (selectedIndex >= options.length) {
    setSelectedIndex(options.length - 1);
  }

  // scroll the selected option into view
  const selectedRef = useRef<HTMLLIElement>(null);
  useEffect(
    () => selectedRef.current?.scrollIntoView({ block: "nearest" }),
    [selectedIndex],
  );

  // enable cyclic arrow-key navigation
  useKey(["ArrowUp", "ArrowDown"], (event) => {
    event.preventDefault();
    let index = selectedIndex + (event.key === "ArrowUp" ? -1 : 1);
    index += options.length;
    index %= options.length;
    setSelectedIndex(index);
  });

  useKey(["Enter"], (event) => {
    event.preventDefault();

    const option = options[selectedIndex];
    if (option) {
      onChange(option);
    }
  });

  return (
    <Box
      sx={[
        ({ palette }) => ({
          width: "340px",
          maxHeight: 400,
          borderRadius: "6px",
          boxShadow:
            "0px 20px 41px rgba(61, 78, 133, 0.07), 0px 16px 25px rgba(61, 78, 133, 0.0531481), 0px 12px 12px rgba(61, 78, 133, 0.0325), 0px 2px 3.13px rgba(61, 78, 133, 0.02)",
          border: `1px solid ${palette.gray[20]}`,
          display: "grid",
          gridTemplateRows: "1fr auto",
          overflow: "hidden",
          textAlign: "left",
          zIndex: 2000,
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box component="ul" sx={{ overflow: "auto" }}>
        {loading && (
          <li
            style={{
              display: "flex",
              justifyContent: "center",
              paddingBottom: "0.25rem",
              paddingTop: "0.25rem",
            }}
          >
            <SpinnerIcon
              style={{
                animation: "spin 1s linear infinite",
                color: "#6B7280",
                height: "0.75rem",
                width: "0.75rem",
              }}
            />
          </li>
        )}
        {options.length === 0 && (
          <Box
            component="li"
            display="flex"
            justifyContent="center"
            alignItems="center"
            py={1.5}
          >
            <Typography>No results</Typography>
          </Box>
        )}
        {options.map((option, index) => (
          <Box
            component="li"
            ref={index === selectedIndex ? selectedRef : undefined}
            key={itemKey(option)}
            sx={({ palette }) => ({
              backgroundColor:
                index !== selectedIndex
                  ? palette.common.white
                  : palette.gray[20],
              display: "flex",
              "&:hover": {
                backgroundColor: palette.gray[20],
              },
            })}
            onClick={() => onChange(option)}
          >
            {renderItem(option)}
          </Box>
        ))}
      </Box>
      {error}
    </Box>
  );
};

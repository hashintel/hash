import { Box, SxProps, Theme } from "@mui/material";
import React, { ReactElement, useEffect, useRef, useState } from "react";
import { useKey } from "rooks";
import { tw } from "twind";
import { SpinnerIcon } from "../../../components/icons";

export interface SuggesterProps<T> {
  options: T[];
  renderItem(item: T): ReactElement;
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
  renderItem,
  loading,
  itemKey,
  sx = [],
}: SuggesterProps<T>): ReactElement => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // reset selected index if it exceeds the options available
  if (selectedIndex >= options.length) {
    setSelectedIndex(options.length - 1);
  }

  // enable cyclic arrow-key navigation
  useKey(["ArrowUp", "ArrowDown"], (event) => {
    event.preventDefault();
    let index = selectedIndex + (event.key === "ArrowUp" ? -1 : 1);
    index += options.length;
    index %= options.length;
    setSelectedIndex(index);
  });

  // scroll the selected option into view
  const selectedRef = useRef<HTMLLIElement>(null);
  useEffect(
    () => selectedRef.current?.scrollIntoView({ block: "nearest" }),
    [selectedIndex],
  );

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
          position: "absolute",
          width: "340px",
          maxHeight: 400,
          borderRadius: "6px",
          boxShadow:
            "0px 20px 41px rgba(61, 78, 133, 0.07), 0px 16px 25px rgba(61, 78, 133, 0.0531481), 0px 12px 12px rgba(61, 78, 133, 0.0325), 0px 2px 3.13px rgba(61, 78, 133, 0.02)",
          borderWidth: `1px`,
          borderStyle: "solid",
          borderColor: palette.gray[20],
          display: "grid",
          gridTemplateRows: "1fr auto",
          overflow: "hidden",
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box component="ul" sx={{ zIndex: 10, overflow: "auto" }}>
        {loading && (
          <li className={tw`flex justify-center py-1`}>
            <SpinnerIcon className={tw`h-3 w-3 text-gray-500 animate-spin`} />
          </li>
        )}
        {options.map((option, index) => (
          /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */
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
      <Box sx={({ palette }) => ({ backgroundColor: palette.common.white })}>
        Error
      </Box>
    </Box>
  );
};

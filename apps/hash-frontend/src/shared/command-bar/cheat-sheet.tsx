import { Box, Typography } from "@mui/material";
import { useEffect, useReducer, useState } from "react";

import { Modal } from "../ui/modal";
import type { CommandBarOption } from "./command-bar-options";
import { menu } from "./command-bar-options";
import { HotKey } from "./hot-key";

export const CheatSheet = () => {
  const [open, setOpen] = useState(false);
  const [, forceRender] = useReducer((count: number) => count + 1, 0);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const unsubscribe = menu.addUpdateListener(forceRender);

    return () => {
      unsubscribe();
    };
  }, []);

  const groups = menu.options.reduce<Record<string, CommandBarOption[]>>(
    (acc, option) => {
      if (option.keysList && (showAll || option.isActive())) {
        const group = acc[option.group] ?? [];
        group.push(option);
        acc[option.group] = group;
      }

      return acc;
    },
    {},
  );

  /**
   * @todo reinstate this when we have enough shortcuts for a cheatsheet, and style it properly
   */
  // const setKeyboardShortcuts = useSetKeyboardShortcuts();
  // const unsetKeyboardShortcuts = useUnsetKeyboardShortcuts();
  //
  // useEffect(() => {
  //   const shortcut = {
  //     keys: ["?"],
  //     callback: (evt: KeyboardEvent) => {
  //       // Hack to detect if pressed inside an input or textarea
  //       if (
  //         evt.target &&
  //         !("defaultValue" in evt.target) &&
  //         !(evt.target as HTMLElement).isContentEditable
  //       ) {
  //         setOpen(true);
  //       }
  //     },
  //   };
  //
  //   setKeyboardShortcuts([shortcut]);
  //
  //   return () => {
  //     unsetKeyboardShortcuts([shortcut]);
  //   };
  // }, [setKeyboardShortcuts, unsetKeyboardShortcuts]);

  return (
    <Modal open={open} onClose={() => setOpen(false)}>
      <Box bgcolor="white" margin="40px auto" width={600} px={2} py={1}>
        <label>
          <input
            type="checkbox"
            checked={showAll}
            onChange={(evt) => setShowAll(evt.target.checked)}
          />{" "}
          Show All
        </label>
        <ul>
          {Object.entries(groups).map(([group, options]) => (
            <Box component="li" mb={2} key={group}>
              <Typography variant="mediumCaps">{group}</Typography>
              <ul>
                {options.map((option) => (
                  <Box
                    component="li"
                    sx={{ opacity: option.isActive() ? 1 : 0.5 }}
                    mb={1}
                    key={option.label}
                  >
                    <HotKey label={option.label} keysList={option.keysList} />
                  </Box>
                ))}
              </ul>
            </Box>
          ))}
        </ul>
      </Box>
    </Modal>
  );
};

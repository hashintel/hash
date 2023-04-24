import { TextField } from "@hashintel/design-system";
import {
  Autocomplete,
  autocompleteClasses,
  Box,
  Modal,
  Paper,
} from "@mui/material";
import { bindPopover, usePopupState } from "material-ui-popup-state/hooks";
import { useRouter } from "next/router";
import { HTMLAttributes } from "react";
import { useKeys } from "rooks";

const CustomPaperComponent = ({
  children,
  ...props
}: HTMLAttributes<HTMLElement>) => (
  <Paper
    {...props}
    sx={{
      [`.${autocompleteClasses.listbox}`]: {
        height: 461,
        maxHeight: "none",
      },
    }}
  >
    {children}
  </Paper>
);

const options = [
  {
    group: "Blocks",
    label: "Find a block…",
    href: "https://google.com/",
  },
  {
    group: "Blocks",
    label: "Generate new block with AI…",
    href: "/",
  },
  {
    group: "Entities",
    label: "Search for an entity…",
    href: "/",
  },
  {
    group: "Entities",
    label: "Insert a link to an entity…",
    href: "/",
  },
  {
    group: "Entities",
    label: "Create new entity…",
    href: "/",
  },
  {
    group: "Types",
    label: "Create new type…",
    href: "/",
  },
  {
    group: "Apps",
    label: "Find an app…",
    href: "/",
  },
  {
    group: "Apps",
    label: "Create an app…",
    href: "/",
  },
  {
    group: "Apps",
    label: "Generate new app…",
    href: "/",
  },
];

export const CommandBar = () => {
  const popupState = usePopupState({
    popupId: "kbar",
    variant: "popover",
  });

  useKeys(["Meta", "k"], () => {
    popupState.toggle();
  });

  const router = useRouter();

  return (
    <Modal {...bindPopover(popupState)}>
      <Box
        width="100vw"
        height="100vh"
        display="flex"
        alignItems="center"
        margin="0 auto"
      >
        <Box
          height={518}
          maxWidth={560}
          width="100vw"
          display="flex"
          justifyContent="center"
          margin="0 auto"
        >
          <Autocomplete
            autoHighlight
            options={options}
            open
            onClose={() => popupState.close()}
            sx={{ width: "100%" }}
            renderInput={(props) => (
              <TextField
                onBlur={() => popupState.close()}
                autoFocus
                placeholder="Type a command or search…"
                {...props}
              />
            )}
            onChange={(_, __, reason, details) => {
              if (details && reason === "selectOption") {
                popupState.close();
                if ("href" in details.option) {
                  if (details.option.href.startsWith("https:")) {
                    window.open(details.option.href, "_blank", "noopener");
                  } else {
                    void router.push(details.option.href);
                  }
                }
              }
            }}
            groupBy={(option) => option.group}
            getOptionLabel={(option) => option.label}
            PaperComponent={CustomPaperComponent}
          />
        </Box>
      </Box>
    </Modal>
  );
};

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
import { HTMLAttributes, useRef, useState } from "react";
import { useKeys } from "rooks";

const CustomPaperComponent = ({
  children,
  ...props
}: HTMLAttributes<HTMLElement>) => (
  <Paper
    {...props}
    sx={{
      [`.${autocompleteClasses.listbox}`]: {
        maxHeight: 461,
      },
    }}
  >
    {children}
  </Paper>
);

type Option = {
  group: string;
  label: string;
  href?: string;
  options?: Option[];
};

const options: Option[] = [
  {
    group: "Blocks",
    label: "Find a block…",
    options: [
      {
        group: "General",
        label: "Option A",
      },
      {
        group: "General",
        label: "Option B",
      },
      {
        group: "Other",
        label: "Option C",
      },
    ],
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

  const [selectedOptionPath, setSelectedOptionPath] = useState<Option[]>([]);
  const selectedOptions =
    selectedOptionPath[selectedOptionPath.length - 1]?.options ?? options;

  const closeBar = () => {
    setSelectedOptionPath([]);
    popupState.close();
  };

  const inputRef = useRef<HTMLInputElement>(null);

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
            // This forces the autocomplete to be recreated when the options
            // change, which clears the input value.
            key={selectedOptionPath.length}
            disableCloseOnSelect
            autoHighlight
            options={selectedOptions}
            open
            onClose={() => closeBar()}
            sx={{ width: "100%" }}
            renderInput={(props) => {
              return (
                <TextField
                  onBlur={() => closeBar()}
                  autoFocus
                  placeholder="Type a command or search…"
                  inputRef={inputRef}
                  {...props}
                />
              );
            }}
            onChange={(_, __, reason, details) => {
              if (details && reason === "selectOption") {
                const option = details.option;

                if (option.href) {
                  closeBar();
                  if (option.href.startsWith("https:")) {
                    window.open(option.href, "_blank", "noopener");
                  } else {
                    void router.push(option.href);
                  }
                } else if (option.options) {
                  setSelectedOptionPath([...selectedOptionPath, option]);
                } else {
                  closeBar();
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

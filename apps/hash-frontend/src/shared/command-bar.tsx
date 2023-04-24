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
import { HTMLAttributes, ReactNode, useRef, useState } from "react";
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
  selected?: (
    props: HTMLAttributes<HTMLLIElement>,
    option: Option,
  ) => ReactNode;
  options?: Option[];
};

export const CommandBar = () => {
  const options: Option[] = [
    {
      group: "Blocks",
      label: "Find a block…",
      options: [
        {
          group: "General",
          label: "Option A",
          selected: (props, { label }) => <li {...props}>Foo</li>,
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

  const popupState = usePopupState({
    popupId: "kbar",
    variant: "popover",
  });

  const router = useRouter();

  const [selectedOptionPath, setSelectedOptionPath] = useState<string[]>([]);
  const selectedOptions =
    selectedOptionPath.reduce<Option[] | null>((acc, path) => {
      return acc?.find((option) => option.label === path)?.options ?? null;
    }, options) ?? options;

  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const closeBar = () => {
    setSelectedOption(null);
    setSelectedOptionPath([]);
    popupState.close();
  };

  useKeys(["Meta", "k"], () => {
    if (popupState.isOpen) {
      closeBar();
    } else {
      popupState.open();
    }
  });

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
            renderOption={(props, option) => {
              if (selectedOption) {
                if (option.label === selectedOption) {
                  if (!option.selected) {
                    throw new Error("Cannot render selected option");
                  }

                  return option.selected(props, option);
                }
                return null;
              }

              return <li {...props}>{option.label}</li>;
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
                  setSelectedOptionPath([...selectedOptionPath, option.label]);
                } else if (option.selected) {
                  setSelectedOption(option.label);
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

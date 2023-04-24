import { Chip, TextField } from "@hashintel/design-system";
import {
  Autocomplete,
  autocompleteClasses,
  Box,
  createFilterOptions,
  Modal,
  Paper,
} from "@mui/material";
import { usePopupState } from "material-ui-popup-state/hooks";
import { useRouter } from "next/router";
import {
  createContext,
  HTMLAttributes,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useKeys } from "rooks";

const RESET_BAR_TIMEOUT = 5_000;

const CustomScreenContext = createContext<ReactNode | null>(null);

const CustomPaperComponent = ({
  children,
  ...props
}: HTMLAttributes<HTMLElement>) => {
  const value = useContext(CustomScreenContext);

  return (
    <Paper
      {...props}
      sx={{
        [`.${autocompleteClasses.listbox}`]: {
          maxHeight: 461,
        },
      }}
    >
      {value ? (
        <Box py={3} px={2}>
          {value}
        </Box>
      ) : (
        children
      )}
    </Paper>
  );
};

type Option = {
  group: string;
  label: string;
  href?: string;
  selected?: (option: Option) => ReactNode;
  options?: Option[];
  command?: (option: Option) => void;
};

const getSelectedOptions = (
  selectedOptionPath: string[],
  options: Option[],
) => {
  let selectedOptions = options;
  let selectedOption = null;
  for (const path of selectedOptionPath) {
    const next = selectedOptions.find((option) => option.label === path);

    if (next) {
      if (next.options) {
        selectedOptions = next.options;
      } else if (next.selected) {
        selectedOption = next.label;
        break;
      }
    } else {
      break;
    }
  }

  return [selectedOptions, selectedOption] as const;
};

type OptionWithPath = Option & { path: string[] };

const flattenOptions = (
  options: Option[],
  parentOption?: OptionWithPath,
): OptionWithPath[] => {
  return options.flatMap((option) => {
    const nextOption = {
      ...option,
      path: parentOption ? [...parentOption.path, parentOption.label] : [],
    };

    return [
      nextOption,
      ...flattenOptions(nextOption.options ?? [], nextOption),
    ];
  });
};

const defaultFilterOptions = createFilterOptions<OptionWithPath>();

const options: Option[] = [
  {
    group: "Blocks",
    label: "Find a block…",
    options: [
      {
        group: "General",
        label: "Option A",
        selected: ({ label }) => <div>You selected {label}</div>,
      },
      {
        group: "General",
        label: "Option B",
        selected: ({ label }) => <div>You selected {label}</div>,
      },
      {
        group: "Other",
        label: "Option C",
        href: "https://google.com/",
      },
      {
        group: "Other",
        label: "Option D",
        href: "/",
      },
    ],
  },
  {
    group: "Blocks",
    label: "Generate new block with AI…",
    command(option) {
      // eslint-disable-next-line no-alert
      alert(`You picked option ${option.label}`);
    },
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

const flattenedOptions = flattenOptions(options);

export const CommandBar = () => {
  const popupState = usePopupState({
    popupId: "kbar",
    variant: "popover",
  });

  const router = useRouter();

  const [inputValue, setInputValue] = useState("");
  const [selectedOptionPath, setSelectedOptionPath] = useState<string[]>([]);
  const [selectedOptions, selectedOption] = getSelectedOptions(
    selectedOptionPath,
    options,
  );

  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      const timer = closeTimer.current;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, []);

  const resetBar = () => {
    setSelectedOptionPath([]);
    setInputValue("");
  };

  const closeBar = (reset: "immediate" | "never" | "delayed") => {
    popupState.close();

    const timer = closeTimer.current;
    if (timer) {
      clearTimeout(timer);
    }

    switch (reset) {
      case "immediate":
        resetBar();
        break;
      case "delayed":
        closeTimer.current = setTimeout(resetBar, RESET_BAR_TIMEOUT);
        break;
      case "never":
        // Do nothing
        break;
    }
  };

  useKeys(["Meta", "k"], () => {
    if (popupState.isOpen) {
      closeBar("delayed");
    } else {
      const timer = closeTimer.current;
      if (timer) {
        clearTimeout(timer);
      }

      popupState.open();
    }
  });

  const inputRef = useRef<HTMLInputElement>(null);

  const selected = selectedOptions.find(
    (option) => option.label === selectedOption,
  );
  const selectedOptionValue = selected?.selected?.(selected);

  return (
    <Modal open={popupState.isOpen} onClose={closeBar}>
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
          sx={{ pointerEvents: "none" }}
        >
          <Box sx={{ pointerEvents: "all", width: "100%" }}>
            <CustomScreenContext.Provider value={selectedOptionValue}>
              <Autocomplete
                inputValue={inputValue}
                // prevents the autocomplete ever having an internal value, as we have custom logic for handling the selected option
                value={null}
                onInputChange={(_, value, reason) => {
                  setInputValue(reason === "reset" ? "" : value);
                }}
                disableCloseOnSelect
                autoHighlight
                options={flattenedOptions}
                filterOptions={(allOptions, state) =>
                  defaultFilterOptions(
                    allOptions.filter(
                      (option) =>
                        JSON.stringify(option.path) ===
                        JSON.stringify(selectedOptionPath),
                    ),
                    state,
                  )
                }
                open
                popupIcon={null}
                onClose={(_, reason) => {
                  if (reason !== "toggleInput") {
                    closeBar(reason === "escape" ? "immediate" : "delayed");
                  }
                }}
                sx={{ width: "100%" }}
                renderInput={(props) => {
                  return (
                    <>
                      {selectedOptionPath.map((path, index) => (
                        <Chip
                          key={path}
                          label={path}
                          onDelete={() =>
                            setSelectedOptionPath(
                              selectedOptionPath.slice(0, index),
                            )
                          }
                        />
                      ))}
                      <TextField
                        autoFocus
                        placeholder="Type a command or search…"
                        inputRef={inputRef}
                        onKeyDown={(evt) => {
                          if (
                            evt.key === "Backspace" &&
                            !inputRef.current?.value
                          ) {
                            setSelectedOptionPath(
                              selectedOptionPath.slice(0, -1),
                            );
                          }
                        }}
                        {...props}
                      />
                    </>
                  );
                }}
                onChange={(_, __, reason, details) => {
                  if (details && reason === "selectOption") {
                    const option = details.option;

                    if (option.options || option.selected) {
                      setSelectedOptionPath([
                        ...selectedOptionPath,
                        option.label,
                      ]);
                    } else {
                      closeBar("immediate");

                      if (option.href) {
                        if (option.href.startsWith("https:")) {
                          window.open(option.href, "_blank", "noopener");
                        } else {
                          void router.push(option.href);
                        }
                      } else if (option.command) {
                        option.command(option);
                      }
                    }
                  }
                }}
                groupBy={(option) => option.group}
                getOptionLabel={(option) => option.label}
                PaperComponent={CustomPaperComponent}
              />
            </CustomScreenContext.Provider>
          </Box>
        </Box>
      </Box>
    </Modal>
  );
};

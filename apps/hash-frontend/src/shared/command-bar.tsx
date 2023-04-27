import { Chip, TextField } from "@hashintel/design-system";
import {
  Autocomplete,
  AutocompleteChangeDetails,
  AutocompleteChangeReason,
  autocompleteClasses,
  AutocompleteRenderInputParams,
  Box,
  createFilterOptions,
  Modal,
  Paper,
} from "@mui/material";
import { useRouter } from "next/router";
import {
  createContext,
  forwardRef,
  HTMLAttributes,
  PropsWithChildren,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useKeys } from "rooks";

type Option = {
  group: string;
  label: string;
  href?: string;
  // Used to render a custom screen inside the popup when the option is selected
  renderCustomScreen?: (option: Option) => ReactNode;
  // Used to render a submenu when the option is selected
  options?: Option[];
  // Used to trigger a command when the option is selected
  // @todo handle promise
  command?: (option: Option) => void | Promise<void>;
  // Command to trigger when the option is selected and the user has entered text into the bar
  // @todo handle promise
  textCommand?: (text: string, option: Option) => void | Promise<void>;
  // The path of parent option labels to the current option
  path: string[];
};

type OptionWithoutPath = Omit<Option, "options" | "path"> & {
  options?: OptionWithoutPath[];
};

// The state of the command bar is not immediately reset when exited via the backdrop or command+K.
// This is the number of milliseconds to wait before resetting the state when exited in this way.
// The state is immediately reset when exited via the escape key or by selecting an option.
const RESET_BAR_TIMEOUT = 5_000;

const defaultFilterOptions = createFilterOptions<Option>();

// This function recursively adds a "path" property to each option representing
// an array of labels denoting the path from the root option to each option
const addPathToOptions = (
  options: OptionWithoutPath[],
  parentPath?: string[],
): Option[] =>
  options.map((option) => {
    const { options: childOptions, ...optionWithoutOptions } = option;

    return {
      ...optionWithoutOptions,
      ...(childOptions
        ? {
            options: addPathToOptions(childOptions, [
              ...(parentPath ?? []),
              option.label,
            ]),
          }
        : {}),
      path: parentPath ?? [],
    };
  });

// Ensures the modal is vertically centered and correctly sized when there are enough options to fill the popup
const CenterContainer = forwardRef<HTMLDivElement, PropsWithChildren>(
  ({ children }: PropsWithChildren, ref) => (
    <Box
      width="100vw"
      height="100vh"
      display="flex"
      alignItems="center"
      margin="0 auto"
      ref={ref}
    >
      <Box
        height={518}
        maxWidth={560}
        width="100vw"
        display="flex"
        justifyContent="center"
        margin="0 auto"
        // Ensures pointer events pass through to the modal backdrop
        sx={{ pointerEvents: "none" }}
      >
        <Box sx={{ pointerEvents: "all", width: "100%" }}>{children}</Box>
      </Box>
    </Box>
  ),
);

// Used to pass the node to render inside the popup from the command bar to the paper component
const CustomScreenContext = createContext<ReactNode | null>(null);

// Used to render a custom screen inside the popup when the option is selected,
// and to set the max height of the popup
const CustomPaperComponent = ({
  children,
  ...props
}: HTMLAttributes<HTMLElement>) => {
  const customScreen = useContext(CustomScreenContext);

  return (
    <Paper
      {...props}
      sx={{
        [`.${autocompleteClasses.listbox}`]: {
          maxHeight: 460,
        },
      }}
    >
      {customScreen ? (
        <Box py={3} px={2}>
          {customScreen}
        </Box>
      ) : (
        children
      )}
    </Paper>
  );
};

const getSelectedOption = (
  selectedOptionPath: string[],
  flattenedOptions: Option[],
) => {
  const stringPath = JSON.stringify(selectedOptionPath);

  const option = flattenedOptions.find(
    (optionCandidate) =>
      (optionCandidate.renderCustomScreen || optionCandidate.textCommand) &&
      JSON.stringify([...optionCandidate.path, optionCandidate.label]) ===
        stringPath,
  );

  return option ?? null;
};

type DelayedCallbackTiming = "immediate" | "delayed";

// This hook is used to optionally delay the execution of a callback until a certain amount of time has passed
const useDelayedCallback = (callback: () => void, delay: number) => {
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      const timer = resetTimer.current;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, []);

  const callbackRef = useRef(callback);
  useLayoutEffect(() => {
    callbackRef.current = callback;
  });

  const handler = useCallback(
    (timing: DelayedCallbackTiming) => {
      const timer = resetTimer.current;
      if (timer) {
        clearTimeout(timer);
      }

      switch (timing) {
        case "immediate":
          callbackRef.current();
          break;
        case "delayed":
          resetTimer.current = setTimeout(() => {
            callbackRef.current();
            resetTimer.current = null;
          }, delay);
          break;
      }
    },
    [delay],
  );

  const cancel = useCallback(() => {
    const timer = resetTimer.current;
    if (timer) {
      clearTimeout(timer);
    }
  }, []);

  return [handler, cancel] as const;
};

// Flattens the options into a single array
const flattenOptions = (options: Option[]): Option[] =>
  options.flatMap((option) => [
    option,
    ...(option.options ? flattenOptions(option.options) : []),
  ]);

export const CommandBar = () => {
  const [visible, setVisible] = useState(false);

  const router = useRouter();

  const [inputValue, setInputValue] = useState("");
  const [selectedOptionPath, setSelectedOptionPath] = useState<string[]>([]);

  const [resetBar, cancelReset] = useDelayedCallback(() => {
    setSelectedOptionPath([]);
    setInputValue("");
  }, RESET_BAR_TIMEOUT);

  const closeBar = useCallback(
    (timing: DelayedCallbackTiming) => {
      setVisible(false);
      resetBar(timing);
    },
    [resetBar],
  );

  useEffect(() => {
    const handler = () => {
      closeBar("immediate");
    };
    router.events.on("routeChangeStart", handler);
    return () => {
      router.events.off("routeChangeStart", handler);
    };
  }, [router.events, closeBar]);

  useKeys(["Meta", "k"], () => {
    if (visible) {
      closeBar("delayed");
    } else {
      cancelReset();

      setVisible(true);
    }
  });

  const inputRef = useRef<HTMLInputElement>(null);

  // These are the options that are displayed in the command bar
  const options = useMemo(
    () =>
      addPathToOptions([
        // @todo colocate this functionality with the page component
        ...(router.pathname === "/[shortname]/[page-slug]"
          ? [
              {
                group: "Page",
                label: "Generate text from prompt",
                textCommand(text: string) {
                  alert(text);
                },
              },
            ]
          : []),
        {
          group: "Blocks",
          label: "Find a block…",
          options: [
            {
              group: "General",
              label: "Option A",
              renderCustomScreen: ({ label }) => (
                <div>You selected {label}</div>
              ),
            },
            {
              group: "General",
              label: "Option B",
              renderCustomScreen: ({ label }) => (
                <div>You selected {label}</div>
              ),
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
      ]),
    [router.pathname],
  );

  const flattenedOptions = useMemo(() => flattenOptions(options), [options]);

  const selectedOption = getSelectedOption(
    selectedOptionPath,
    flattenedOptions,
  );
  const customScreen =
    selectedOption?.renderCustomScreen?.(selectedOption) ?? null;

  const handleChange = (
    _: unknown,
    __: unknown,
    reason: AutocompleteChangeReason,
    details: AutocompleteChangeDetails<Option> | undefined,
  ) => {
    if (details && reason === "selectOption") {
      const option = details.option;

      if (option.options || option.renderCustomScreen || option.textCommand) {
        setSelectedOptionPath([...selectedOptionPath, option.label]);
      } else {
        closeBar("immediate");

        if (option.command) {
          void option.command(option);
        }

        if (option.href) {
          if (option.href.startsWith("https:")) {
            // Uses noopener to prevent the new tab from accessing the window.opener property
            window.open(option.href, "_blank", "noopener");
          } else {
            void router.push(option.href);
          }
        }
      }
    }
  };

  // This is used to render the input with the selected options as chips
  const renderInput = (props: AutocompleteRenderInputParams) => (
    <>
      {selectedOptionPath.map((path, index) => (
        <Chip
          key={path}
          label={path}
          onDelete={() =>
            setSelectedOptionPath(selectedOptionPath.slice(0, index))
          }
        />
      ))}
      <TextField
        autoFocus
        placeholder="Type a command or search…"
        inputRef={inputRef}
        onKeyDown={(evt) => {
          // If the user presses backspace and there is no input value, then go back to the previous selectedOption
          switch (evt.key) {
            case "Backspace":
              if (!inputRef.current?.value) {
                setSelectedOptionPath(selectedOptionPath.slice(0, -1));
              }
              break;
            case "Enter":
              if (inputValue && selectedOption?.textCommand) {
                // @todo wait for the text command to finish before closing the bar
                closeBar("immediate");

                // @todo display a loading indicator while the text command is running
                void selectedOption.textCommand(inputValue, selectedOption);
              }
          }
        }}
        {...props}
      />
    </>
  );

  return (
    <Modal open={visible} onClose={closeBar}>
      <CenterContainer>
        <CustomScreenContext.Provider value={customScreen}>
          <Autocomplete
            options={flattenedOptions}
            sx={{ width: "100%" }}
            renderInput={renderInput}
            PaperComponent={CustomPaperComponent}
            onChange={handleChange}
            groupBy={(option) => option.group}
            getOptionLabel={(option) => option.label}
            // The popup should always be open when the modal is open
            open
            popupIcon={null}
            // This is used to prevent the autocomplete from closing when the user clicks on an option (as we have custom logic for handling selecting an option)
            disableCloseOnSelect
            // The first option should be highlighted by default to make activating the first option quicker
            autoHighlight
            // prevents the autocomplete ever having an internal value, as we have custom logic for handling the selectedOption option
            value={null}
            inputValue={inputValue}
            onInputChange={(_, value, reason) => {
              setInputValue(reason === "reset" ? "" : value);
            }}
            filterOptions={(optionsToFilter, state) =>
              // Combine the default filtering with filtering by the selectedOptionPath
              // so that only options that are in the selectedOptionPath are shown
              defaultFilterOptions(
                optionsToFilter.filter(
                  (option) =>
                    JSON.stringify(option.path) ===
                    JSON.stringify(selectedOptionPath),
                ),
                state,
              )
            }
            noOptionsText={
              selectedOption?.textCommand
                ? inputValue
                  ? "Press Enter to run command"
                  : "Type your prompt and press enter"
                : undefined
            }
            onClose={(_, reason) => {
              // Prevent the autocomplete from closing when the user clicks on the input
              if (reason !== "toggleInput") {
                closeBar(reason === "escape" ? "immediate" : "delayed");
              }
            }}
          />
        </CustomScreenContext.Provider>
      </CenterContainer>
    </Modal>
  );
};

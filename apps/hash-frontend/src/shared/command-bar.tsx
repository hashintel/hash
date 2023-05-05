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
import { usePopupState } from "material-ui-popup-state/hooks";
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
  useRef,
  useState,
} from "react";
import { useKeys } from "rooks";

import {
  Option,
  OptionWithoutPath,
  useCommandBarOptions,
} from "./command-bar/options";

// The state of the command bar is not immediately reset when exited via the backdrop or command+K.
// This is the number of milliseconds to wait before resetting the state when exited in this way.
// The state is immediately reset when exited via the escape key or by selecting an option.
const RESET_BAR_TIMEOUT = 5_000;

const defaultFilterOptions = createFilterOptions<Option>();

// Ensures the modal is vertically centered and correctly sized when there are enough options to fill the popup
const CenterContainer = forwardRef(({ children }: PropsWithChildren, ref) => (
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
));

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

// Use the path of the selected option to find the option that renders a custom screen
const getSelectedOptions = (
  selectedOptionPath: string[],
  options: OptionWithoutPath[],
) => {
  let selectedOptions = options;
  let selectedOption = null;
  for (const path of selectedOptionPath) {
    const next = selectedOptions.find((option) => option.label === path);

    if (next) {
      if (next.options) {
        selectedOptions = next.options;
      } else if (next.renderCustomScreen) {
        selectedOption = next;
        break;
      }
    } else {
      break;
    }
  }

  return selectedOption;
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

  const cancel = () => {
    const timer = resetTimer.current;
    if (timer) {
      clearTimeout(timer);
    }
  };

  return [handler, cancel] as const;
};

export const CommandBar = () => {
  const popupState = usePopupState({
    popupId: "kbar",
    variant: "popover",
  });

  const router = useRouter();

  const [inputValue, setInputValue] = useState("");
  const [selectedOptionPath, setSelectedOptionPath] = useState<string[]>([]);

  const [resetBar, cancelReset] = useDelayedCallback(() => {
    setSelectedOptionPath([]);
    setInputValue("");
  }, RESET_BAR_TIMEOUT);

  const closeBar = (timing: DelayedCallbackTiming) => {
    popupState.close();
    resetBar(timing);
  };

  useKeys(["Meta", "k"], () => {
    if (popupState.isOpen) {
      closeBar("delayed");
    } else {
      cancelReset();

      popupState.open();
    }
  });

  const inputRef = useRef<HTMLInputElement>(null);

  const { allOptions, flattenedOptions } = useCommandBarOptions();

  const selectedOption = getSelectedOptions(selectedOptionPath, allOptions);
  const customScreen = selectedOption?.renderCustomScreen?.(selectedOption);

  const handleChange = (
    _: unknown,
    __: unknown,
    reason: AutocompleteChangeReason,
    details: AutocompleteChangeDetails<Option> | undefined,
  ) => {
    if (details && reason === "selectOption") {
      const option = details.option;

      if (option.options || option.renderCustomScreen) {
        setSelectedOptionPath([...selectedOptionPath, option.label]);
      } else {
        closeBar("immediate");

        if (option.command) {
          option.command(option);
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
          if (evt.key === "Backspace" && !inputRef.current?.value) {
            setSelectedOptionPath(selectedOptionPath.slice(0, -1));
          }
        }}
        {...props}
      />
    </>
  );

  return (
    <Modal open={popupState.isOpen} onClose={closeBar}>
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

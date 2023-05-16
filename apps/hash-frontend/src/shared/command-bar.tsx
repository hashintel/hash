import { Chip, TextField } from "@hashintel/design-system";
import {
  Autocomplete,
  AutocompleteChangeDetails,
  AutocompleteChangeReason,
  autocompleteClasses,
  AutocompleteRenderInputParams,
  Box,
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
  useReducer,
  useRef,
  useState,
} from "react";
import { useKeys } from "rooks";

type CommandBarOptionCommand = {
  href?: string;
  // Used to render a custom screen inside the popup when the option is selected
  renderCustomScreen?: (option: CommandBarOption) => ReactNode;
  // Used to render a submenu when the option is selected
  options?: OptionWithoutPath[];
  // Used to trigger a command when the option is selected
  command?: (option: CommandBarOption) => void;
};

class CommandBarOption {
  private command: CommandBarOptionCommand | null = null;

  constructor(
    private readonly menu: CommandBarMenu,
    public readonly label: string,
    public readonly group: string,
    public readonly keysList?: string[],
  ) {}

  activate(command: CommandBarOptionCommand) {
    this.command = command;
    this.menu.update();

    let removed = false;

    return () => {
      if (!removed) {
        this.command = null;
        this.menu.update();
      }

      removed = true;
    };
  }

  isActive() {
    return !!this.command;
  }

  getCommand() {
    return this.command;
  }
}

class CommandBarMenu {
  public subOptions: CommandBarOption[] = [];
  public options: CommandBarOption[] = [];

  protected listeners: (() => void)[] = [];

  private readonly root: CommandBarMenu;

  constructor(root?: CommandBarMenu) {
    this.root = root ?? this;
  }

  addOption(label: string, group: string, keysList?: string[]) {
    const option = new CommandBarOption(this, label, group, keysList);

    this.subOptions.push(option);
    this.root.options.push(option);

    return option;
  }

  addListener(listener: () => void) {
    this.root.listeners.push(listener);

    return () => {
      this.root.listeners.splice(this.root.listeners.indexOf(listener), 1);
    };
  }

  update() {
    this.root.triggerListeners();
  }

  protected triggerListeners() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

const menu = new CommandBarMenu();
const testOption = menu.addOption("Test", "General", ["Meta", "g"]);

testOption.activate({
  command: () => {
    // eslint-disable-next-line no-console
    console.log("Test activated");
  },
});

export const childMenu = new CommandBarMenu(menu);

childMenu.addOption("Child", "General", ["Meta", "c"]).activate({
  command: () => {
    alert("Child");
  },
});

export const secondOption = menu.addOption("Second", "Page", ["Meta", "s"]);

export const useCommandBarOption = (
  option: CommandBarOption,
  command: CommandBarOptionCommand,
) => {
  useEffect(() => {
    const deactivate = option.activate(command);

    return () => {
      deactivate();
    };
  }, [option, command]);
};

// In order to make declaring the options easier, we use a type that doesn't require the path to be specified.
// The path is added later by flattening the options
type OptionWithoutPath = {
  group: string;
  label: string;
  href?: string;
  // Used to render a custom screen inside the popup when the option is selected
  renderCustomScreen?: (option: OptionWithoutPath) => ReactNode;
  // Used to render a submenu when the option is selected
  options?: OptionWithoutPath[];
  // Used to trigger a command when the option is selected
  command?: (option: OptionWithoutPath) => void;
};

// The state of the command bar is not immediately reset when exited via the backdrop or command+K.
// This is the number of milliseconds to wait before resetting the state when exited in this way.
// The state is immediately reset when exited via the escape key or by selecting an option.
const RESET_BAR_TIMEOUT = 5_000;

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

// borrowed from rooks
const doesIdentifierMatchKeyboardEvent = (
  error: KeyboardEvent,
  identifier: number | string,
): boolean =>
  error.key === identifier ||
  error.code === identifier ||
  error.keyCode === identifier ||
  error.which === identifier ||
  error.charCode === identifier;

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

  const closeBar = useCallback(
    (timing: DelayedCallbackTiming) => {
      popupState.close();
      resetBar(timing);
    },
    [popupState, resetBar],
  );

  useKeys(["Meta", "k"], () => {
    if (popupState.isOpen) {
      closeBar("delayed");
    } else {
      cancelReset();
      popupState.open();
    }
  });

  const inputRef = useRef<HTMLInputElement>(null);

  // const selectedOption = getSelectedOptions(selectedOptionPath, allOptions);
  // const customScreen = selectedOption?.renderCustomScreen?.(selectedOption);
  const customScreen = null;

  const triggerOption = useCallback(
    (option: CommandBarOption) => {
      const command = option.getCommand();

      if (command) {
        if (command.options || command.renderCustomScreen) {
          cancelReset();
          popupState.open();

          setSelectedOptionPath((current) => [...current, option.label]);
        } else {
          closeBar("immediate");

          if (command.command) {
            command.command(option);
          }

          if (command.href) {
            if (command.href.startsWith("https:")) {
              // Uses noopener to prevent the new tab from accessing the window.opener property
              window.open(command.href, "_blank", "noopener");
            } else {
              void router.push(command.href);
            }
          }
        }
      }
    },
    [cancelReset, closeBar, popupState, router],
  );

  const handleChange = (
    _: unknown,
    __: unknown,
    reason: AutocompleteChangeReason,
    details: AutocompleteChangeDetails<CommandBarOption> | undefined,
  ) => {
    if (details && reason === "selectOption") {
      const option = details.option;
      triggerOption(option);
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

  const [, forceRender] = useReducer((val: number) => val + 1, 0);

  useEffect(() => {
    const remove = menu.addListener(forceRender);

    const mapping: Record<string, boolean | undefined> = {};

    // adapted from rooks to handle multiple sets of keys
    const handleKeyDown = (event: KeyboardEvent) => {
      let pressedKeyIdentifier: string | null = null;
      // First detect the key that was pressed;
      for (const option of menu.options) {
        let areAllKeysFromListPressed = false;

        if (option.keysList && option.isActive()) {
          for (const identifier of option.keysList) {
            if (doesIdentifierMatchKeyboardEvent(event, identifier)) {
              mapping[identifier] = true;
              pressedKeyIdentifier = identifier;
            }
          }

          if (
            option.keysList.every((identifier) => Boolean(mapping[identifier]))
          ) {
            areAllKeysFromListPressed = true;
          }

          if (areAllKeysFromListPressed) {
            event.preventDefault();
            triggerOption(option);

            if (pressedKeyIdentifier) {
              mapping[pressedKeyIdentifier] = false;
            }
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    const handleKeyUp = (event: KeyboardEvent) => {
      for (const option of menu.options) {
        for (const identifier of option.keysList ?? []) {
          if (doesIdentifierMatchKeyboardEvent(event, identifier)) {
            mapping[identifier] = undefined;
          }
        }
      }
    };

    document.addEventListener("keyup", handleKeyUp);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      remove();
    };
  });

  return (
    <Modal open={popupState.isOpen} onClose={closeBar}>
      <CenterContainer>
        <CustomScreenContext.Provider value={customScreen}>
          <Autocomplete
            options={menu.options.filter((option) => option.isActive())}
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
            // filterOptions={(optionsToFilter, state) =>
            //   // Combine the default filtering with filtering by the selectedOptionPath
            //   // so that only options that are in the selectedOptionPath are shown
            //   defaultFilterOptions(
            //     optionsToFilter.filter(
            //       (option) =>
            //         JSON.stringify(option.path) ===
            //         JSON.stringify(selectedOptionPath),
            //     ),
            //     state,
            //   )
            // }
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

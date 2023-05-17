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
  options?: CommandBarMenu;
  // Used to trigger a command when the option is selected
  command?: (option: CommandBarOption) => void;

  asyncCommand?: (input: string) => Promise<CommandBarOption | null>;
};

class CommandBarOption {
  private command: CommandBarOptionCommand | null = null;
  private active = false;

  constructor(
    public readonly menu: CommandBarMenu | null,
    public readonly label: string,
    public readonly group: string,
    public readonly keysList?: string[],
  ) {}

  setCommand(command: CommandBarOptionCommand) {
    this.command = command;
    this.menu?.update();

    return this;
  }

  activate(command?: CommandBarOptionCommand) {
    if (command) {
      this.command = command;
    }

    this.active = true;
    this.menu?.update();

    let removed = false;

    return () => {
      if (!removed) {
        this.active = false;
        if (command) {
          this.command = null;
        }

        this.menu?.update();
      }

      removed = true;
    };
  }

  isActive() {
    return !!this.command && this.active;
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

childMenu.addOption("Third", "General").activate({
  renderCustomScreen: () => <div>Custom screen</div>,
});

childMenu.addOption("Fourth", "General").activate({
  asyncCommand: async (input) => {
    return new Promise((resolve) => {
      setTimeout(resolve, 1_000);
    }).then(() => {
      return new CommandBarOption(null, input, "General").setCommand({
        renderCustomScreen: () => <div>Custom screen 2 {input}</div>,
      });
    });
  },
});

export const secondOption = menu
  .addOption("Second", "Page", ["Meta", "s"])
  .setCommand({
    options: childMenu,
  });

export const useCommandBarOption = (
  option: CommandBarOption,
  command?: CommandBarOptionCommand,
) => {
  useEffect(() => {
    const deactivate = option.activate(command);

    return () => {
      deactivate();
    };
  }, [option, command]);
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
  const [selectedOptionPath, setSelectedOptionPath] = useState<
    CommandBarOption[]
  >([]);

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
    if (popupState.isOpen) {
      closeBar("delayed");
    } else {
      cancelReset();
      popupState.open();
    }
  });

  const inputRef = useRef<HTMLInputElement>(null);

  const triggerOption = useCallback(
    (option: CommandBarOption) => {
      const command = option.getCommand();

      if (command) {
        if (
          command.options ||
          command.renderCustomScreen ||
          command.asyncCommand
        ) {
          cancelReset();
          popupState.open();

          setSelectedOptionPath((current) => [...current, option]);
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

  const selectedOption = selectedOptionPath[selectedOptionPath.length - 1];
  const selectedCommand = selectedOption?.getCommand();

  const activeMenu =
    selectedOptionPath.length > 0 ? selectedCommand?.options : menu;

  const customScreen = selectedOption
    ? selectedCommand?.renderCustomScreen?.(selectedOption)
    : null;

  // This is used to render the input with the selected options as chips
  const renderInput = (props: AutocompleteRenderInputParams) => (
    <>
      {selectedOptionPath.map(({ label }, index) => (
        <Chip
          key={label}
          label={label}
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
              if (!inputValue) {
                return;
              }

              if (selectedCommand?.asyncCommand) {
                setInputValue("");

                void selectedCommand
                  .asyncCommand(inputValue)
                  .then((nextOption) => {
                    if (nextOption) {
                      setSelectedOptionPath((current) =>
                        current[current.length - 1] === selectedOption
                          ? [...current, nextOption]
                          : current,
                      );
                    }
                  });
              }
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
      // First detect the key that was pressed;
      for (const option of menu.options) {
        let areAllKeysFromListPressed = false;

        if (option.keysList && option.isActive()) {
          for (const identifier of option.keysList) {
            if (doesIdentifierMatchKeyboardEvent(event, identifier)) {
              mapping[identifier] = true;
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

            for (const key of Object.keys(mapping)) {
              delete mapping[key];
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
            options={
              activeMenu?.subOptions.filter((option) => option.isActive()) ?? []
            }
            sx={{ width: "100%" }}
            renderInput={renderInput}
            PaperComponent={CustomPaperComponent}
            onChange={handleChange}
            groupBy={(option) => option.group}
            getOptionLabel={(option) => option.label}
            renderOption={(props, option) => (
              <li {...props}>
                <Box display="flex" alignItems="center" width="100%">
                  {option.label}
                  {option.keysList ? (
                    <Box
                      display="flex"
                      alignItems="center"
                      gap={0.5}
                      marginLeft="auto"
                      flexGrow={0}
                    >
                      {option.keysList.map((key) => (
                        <Box
                          key={key}
                          borderRadius={1}
                          bgcolor={(theme) => theme.palette.blue[30]}
                          px={1}
                        >
                          {key.toLowerCase() === "meta"
                            ? "⌘"
                            : key.toUpperCase()}
                        </Box>
                      ))}
                    </Box>
                  ) : null}{" "}
                </Box>
              </li>
            )}
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
            noOptionsText={
              selectedCommand?.asyncCommand
                ? inputValue
                  ? "Press Enter to run command"
                  : "Type your prompt and press enter"
                : undefined
            }
            onClose={(_, reason) => {
              // Prevent the autocomplete from closing when the user clicks on the input
              if (
                reason !== "toggleInput" &&
                (reason !== "blur" || !selectedCommand?.renderCustomScreen)
              ) {
                closeBar(reason === "escape" ? "immediate" : "delayed");
              }
            }}
          />
        </CustomScreenContext.Provider>
      </CenterContainer>
    </Modal>
  );
};

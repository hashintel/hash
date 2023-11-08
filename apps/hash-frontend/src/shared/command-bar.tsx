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
  FunctionComponent,
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

import { useAccountPages } from "../components/hooks/use-account-pages";
import { useCreatePage } from "../components/hooks/use-create-page";
import { useHashInstance } from "../components/hooks/use-hash-instance";
import { useActiveWorkspace } from "../pages/shared/workspace-context";
// import { CheatSheet } from "./command-bar/cheat-sheet";
import {
  // childMenu,
  CommandBarOption,
  CommandBarOptionCommand,
  createEntityOption,
  createPageOption,
  createTypeOption,
  menu,
} from "./command-bar/command-bar-options";
import { HotKey } from "./command-bar/hot-key";

// childMenu.addOption("Child", "General", ["Meta", "c"]).activate({
//   command: () => {
//     alert("Child");
//   },
// });

// childMenu.addOption("Third", "General").activate({
//   renderCustomScreen: () => <div>Custom screen</div>,
// });

// childMenu.addOption("Fourth", "General").activate({
//   asyncCommand: async (input) => {
//     return new Promise((resolve) => {
//       setTimeout(resolve, 1_000);
//     }).then(() => {
//       return new CommandBarOption(null, input, "General").setCommand({
//         renderCustomScreen: () => <div>Custom screen 2 {input}</div>,
//       });
//     });
//   },
// });

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
  event: KeyboardEvent,
  identifier: number | string,
): boolean =>
  event.key === identifier ||
  event.code === identifier ||
  event.keyCode === identifier ||
  event.which === identifier ||
  event.charCode === identifier;

export const CommandBar: FunctionComponent = () => {
  const popupState = usePopupState({
    popupId: "kbar",
    variant: "popover",
  });

  const router = useRouter();

  const { activeWorkspaceOwnedById, activeWorkspace } = useActiveWorkspace();

  const { hashInstance } = useHashInstance();

  const { lastRootPageIndex } = useAccountPages(activeWorkspaceOwnedById);
  const [createUntitledPage] = useCreatePage({
    shortname: activeWorkspace?.shortname,
    ownedById: activeWorkspaceOwnedById,
  });

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
      /**
       * Handle the command bar hotkey
       * We cannot use useKeys directly for this due to https://github.com/imbhargav5/rooks/issues/1730
       */
      if (event.metaKey && doesIdentifierMatchKeyboardEvent(event, "k")) {
        if (popupState.isOpen) {
          closeBar("delayed");
        } else {
          cancelReset();
          popupState.open();
        }
        return;
      }

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

    const handleBlur = () => {
      for (const key of Object.keys(mapping)) {
        delete mapping[key];
      }
    };

    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      remove();
    };
  });

  useEffect(() => {
    createEntityOption.activate({
      command: () => {
        void router.push("/new/entity");
      },
    });

    createTypeOption.activate({
      command: () => {
        void router.push("/new/types/entity-type");
      },
    });
  }, [router]);

  useEffect(() => {
    if (!hashInstance?.properties.pagesAreEnabled) {
      return;
    }
    createPageOption.activate({
      command: async () => {
        await createUntitledPage(lastRootPageIndex, "document");
      },
    });
  }, [
    createUntitledPage,
    hashInstance?.properties.pagesAreEnabled,
    lastRootPageIndex,
  ]);

  return (
    <>
      <Modal open={popupState.isOpen} onClose={closeBar}>
        <CenterContainer>
          <CustomScreenContext.Provider value={customScreen}>
            <Autocomplete
              options={
                activeMenu?.subOptions.filter((option) => option.isActive()) ??
                []
              }
              sx={{ width: "100%" }}
              renderInput={renderInput}
              PaperComponent={CustomPaperComponent}
              onChange={handleChange}
              groupBy={(option) => option.group}
              getOptionLabel={(option) => option.label}
              renderOption={(props, option) => (
                <li {...props}>
                  <HotKey keysList={option.keysList} label={option.label} />
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
      {/* <CheatSheet /> */}
    </>
  );
};

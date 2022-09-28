import { faClose, faSearch } from "@fortawesome/free-solid-svg-icons";
import { Button, ButtonProps } from "@hashintel/hash-design-system/button";
import { Chip } from "@hashintel/hash-design-system/chip";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { IconButton } from "@hashintel/hash-design-system/icon-button";
import { TextField } from "@hashintel/hash-design-system/text-field";
import { textFieldBorderRadius } from "@hashintel/hash-design-system/theme/components/inputs/mui-outlined-input-theme-options";
import {
  Autocomplete,
  autocompleteClasses,
  Box,
  ButtonBase,
  Checkbox,
  checkboxClasses,
  experimental_sx,
  outlinedInputClasses,
  Paper,
  PaperProps,
  PopperProps,
  styled,
  svgIconClasses,
  Table,
  TableBody,
  tableBodyClasses,
  TableCell,
  tableCellClasses,
  TableFooter,
  TableHead,
  TableRow,
  tableRowClasses,
  Theme,
  Typography,
  useForkRef,
} from "@mui/material";
import {
  bindPopover,
  bindToggle,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import {
  createContext,
  Ref,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Modal } from "../../../components/Modals/Modal";
import { ArrowUpRightIcon, CirclePlusIcon } from "../../../shared/icons/svg";
import { PropertyTypeForm } from "./property-type-form";
import { OntologyChip } from "./ontology-chip";
import { PlaceholderIcon } from "./placeholder-icon";
import { PropertyMenu } from "./property-menu";
import { QuestionIcon } from "./question-icon";
import { useStateCallback, withHandler } from "./util";
import { WhiteCard } from "./white-card";

const StyledPlusCircleIcon = styled(CirclePlusIcon)(
  experimental_sx<Theme>({
    height: "12px",
  }),
);

type PaperWithCreateButtonProps = {
  query: string;
  createButtonProps: Omit<ButtonProps, "children" | "variant" | "size">;
};

const PaperWithCreateButtonContext =
  createContext<PaperWithCreateButtonProps | null>(null);

const usePaperWithCreateButtonContext = () => {
  const value = useContext(PaperWithCreateButtonContext);
  if (value === null) {
    throw new Error("Must wrap with PaperWithCreateButtonContext.Provider");
  }
  return value;
};

const AUTOCOMPLETE_INPUT_HEIGHT = 57;

const PaperWithCreateButton = ({ children, ...props }: PaperProps) => {
  const { query, createButtonProps } = usePaperWithCreateButtonContext();
  return (
    <>
      <Box
        sx={(theme) => ({
          position: "absolute",
          left: 0,
          right: 0,
          width: "100%",
          height: `calc(100% + ${AUTOCOMPLETE_INPUT_HEIGHT}px)`,
          boxShadow: theme.boxShadows.md,
          pointerEvents: "none",
          borderRadius: `${textFieldBorderRadius}px`,
          [`[data-popper-placement="top"] &`]: {
            bottom: -AUTOCOMPLETE_INPUT_HEIGHT,
          },
          [`[data-popper-placement="bottom"] &`]: {
            top: -AUTOCOMPLETE_INPUT_HEIGHT,
          },
        })}
        aria-hidden
      />
      <Paper
        {...props}
        sx={(theme) => ({
          p: 1,
          border: 1,
          boxSizing: "border-box",
          borderColor: theme.palette.gray[30],
          boxShadow: "none",
          [`[data-popper-placement="top"] &`]: {
            borderBottom: 0,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
          },
          [`[data-popper-placement="bottom"] &`]: {
            borderTop: 0,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
          },

          [`.${autocompleteClasses.listbox}`]: { p: 0 },
          [`.${autocompleteClasses.noOptions}`]: { display: "none" },
          [`.${autocompleteClasses.option}`]: {
            borderRadius: 1,
            "&.Mui-focused": {
              backgroundColor: `${theme.palette.gray[10]} !important`,
            },
          },
        })}
      >
        {children}
        <Button
          variant="tertiary"
          startIcon={<StyledPlusCircleIcon />}
          sx={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            mt: 1,
          }}
          {...createButtonProps}
        >
          <Typography
            variant="smallTextLabels"
            sx={(theme) => ({
              color: theme.palette.gray[60],
              fontWeight: 500,
            })}
          >
            Create
          </Typography>
          {query ? (
            <>
              &nbsp;
              <Typography
                variant="smallTextLabels"
                sx={(theme) => ({
                  color: theme.palette.gray[60],
                  fontWeight: 600,
                })}
              >
                {query}
              </Typography>
            </>
          ) : null}
          <Chip color="purple" label="PROPERTY TYPE" sx={{ ml: 1.5 }} />
        </Button>
      </Paper>
    </>
  );
};

const insertPropertyOptions = [
  {
    title: "Share Price",
    icon: <PlaceholderIcon />,
    domain: "hash.ai",
    path: "@nasdaq",
    expectedValues: ["Currency"],
    description: "A company's current price per share",
  },
  {
    title: "Stock Symbol ",
    icon: <PlaceholderIcon />,
    domain: "hash.ai",
    path: "@acme-corp",
    expectedValues: ["Text"],
    description:
      "An abbreviation used to uniquely identify public traded shares",
  },
  {
    title: "Ownership Percentage",
    icon: <PlaceholderIcon />,
    domain: "hash.ai",
    path: "@wrapped-text-that-is-long-enough",
    expectedValues: ["Number"],
    description:
      "An entity’s ownership stake in another entity expressed as a property with a bunch of text long enough to make it wrap",
  },
];

const InsertPropertyRow = ({
  inputRef,
  onCancel,
  onAdd,
}: {
  inputRef: Ref<HTMLInputElement | null>;
  onCancel: () => void;
  onAdd: () => void;
}) => {
  const modalTooltipId = useId();
  const modalPopupState = usePopupState({
    variant: "popover",
    popupId: `createProperty-${modalTooltipId}`,
  });

  const [searchText, setSearchText] = useState("");

  const ourInputRef = useRef<HTMLInputElement>(null);
  const sharedRef = useForkRef(inputRef, ourInputRef);
  const [open, setOpen] = useState(false);

  const modifiers = useMemo(
    (): PopperProps["modifiers"] => [
      {
        name: "addPositionClass",
        enabled: true,
        phase: "write",
        fn({ state }) {
          if (state.elements.reference instanceof HTMLElement) {
            state.elements.reference.setAttribute(
              "data-popper-placement",
              state.placement,
            );
          }
        },
      },
      {
        name: "preventOverflow",
        enabled: false,
      },
    ],
    [],
  );

  const highlightedRef = useRef<null | typeof insertPropertyOptions[number]>(
    null,
  );

  return (
    <TableRow
      sx={{
        [`.${tableCellClasses.root}`]: {
          py: 1,
        },
      }}
    >
      <TableCell colSpan={2}>
        <PaperWithCreateButtonContext.Provider
          value={
            // eslint-disable-next-line react/jsx-no-constructed-context-values
            {
              query: searchText,
              createButtonProps: {
                ...withHandler(bindTrigger(modalPopupState), () => {
                  ourInputRef.current?.focus();
                }),
                onMouseDown: (evt) => {
                  evt.preventDefault();
                  evt.stopPropagation();
                },
              },
            }
          }
        >
          <Autocomplete
            open={open}
            onOpen={() => setOpen(true)}
            onClose={(_, reason) => {
              if (reason !== "toggleInput") {
                setOpen(false);
              }
            }}
            popupIcon={null}
            clearIcon={null}
            forcePopupIcon={false}
            selectOnFocus={false}
            openOnFocus
            inputValue={searchText}
            clearOnBlur={false}
            onInputChange={(_, value) => setSearchText(value)}
            onHighlightChange={(_, value) => {
              highlightedRef.current = value;
            }}
            onChange={() => onAdd()}
            onKeyDown={(evt) => {
              switch (evt.key) {
                case "Enter":
                  if (!highlightedRef.current) {
                    modalPopupState.open();
                  }
                  break;
                case "Escape":
                  onCancel();
                  break;
              }
            }}
            onBlur={() => {
              if (!modalPopupState.isOpen) {
                onCancel();
              }
            }}
            renderInput={(props) => (
              <TextField
                {...props}
                placeholder="Search for a property type"
                sx={{
                  width: "100%",
                }}
                inputRef={sharedRef}
                InputProps={{
                  ...props.InputProps,
                  endAdornment: (
                    <FontAwesomeIcon
                      icon={faSearch}
                      sx={(theme) => ({
                        fontSize: 12,
                        mr: 2,
                        color: theme.palette.gray[50],
                      })}
                    />
                  ),
                  sx: (theme) => ({
                    // The popover needs to know how tall this is to draw
                    // a shadow around it
                    height: AUTOCOMPLETE_INPUT_HEIGHT,

                    // Focus is handled by the options popover
                    "&.Mui-focused": {
                      boxShadow: "none",
                    },

                    [`.${outlinedInputClasses.notchedOutline}`]: {
                      border: `1px solid ${theme.palette.gray[30]} !important`,
                    },

                    ...(open && {
                      [`&[data-popper-placement="bottom"]`]: {
                        borderBottom: 0,
                        borderBottomLeftRadius: 0,
                        borderBottomRightRadius: 0,
                      },
                      [`&[data-popper-placement="top"]`]: {
                        borderTop: 0,
                        borderTopLeftRadius: 0,
                        borderTopRightRadius: 0,
                      },
                    }),
                  }),
                }}
              />
            )}
            options={insertPropertyOptions}
            getOptionLabel={(obj) => obj.title}
            renderOption={(props, option) => (
              <li {...props}>
                <Box width="100%">
                  <Box
                    width="100%"
                    display="flex"
                    alignItems="center"
                    mb={0.5}
                    whiteSpace="nowrap"
                  >
                    <Box
                      component="span"
                      flexShrink={0}
                      display="flex"
                      alignItems="center"
                    >
                      <Typography
                        variant="smallTextLabels"
                        fontWeight={500}
                        mr={0.5}
                        color="black"
                      >
                        {option.title}
                      </Typography>
                      <ArrowUpRightIcon />
                    </Box>
                    <OntologyChip
                      icon={option.icon}
                      domain={option.domain}
                      path={
                        <Typography
                          component="span"
                          fontWeight="bold"
                          color={(theme) => theme.palette.blue[70]}
                        >
                          {option.path}
                        </Typography>
                      }
                      sx={{ flexShrink: 1, ml: 1.25, mr: 2 }}
                    />
                    <Box ml="auto">
                      {option.expectedValues.map((value) => (
                        <Chip key={value} color="gray" label={value} />
                      ))}
                    </Box>
                  </Box>
                  <Typography
                    component={Box}
                    variant="microText"
                    sx={(theme) => ({
                      color: theme.palette.gray[50],
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      overflow: "hidden",
                      width: "100%",
                    })}
                  >
                    {option.description}
                  </Typography>
                </Box>
              </li>
            )}
            PaperComponent={PaperWithCreateButton}
            componentsProps={{
              popper: { modifiers },
            }}
          />
        </PaperWithCreateButtonContext.Provider>
        <Modal
          {...bindPopover(modalPopupState)}
          disableEscapeKeyDown
          contentStyle={(theme) => ({
            p: "0px !important",
            border: 1,
            borderColor: theme.palette.gray[20],
          })}
        >
          <>
            <Box
              sx={(theme) => ({
                px: 2.5,
                pr: 1.5,
                pb: 1.5,
                pt: 2,
                borderBottom: 1,
                borderColor: theme.palette.gray[20],
                alignItems: "center",
                display: "flex",
              })}
            >
              <Typography variant="regularTextLabels" sx={{ fontWeight: 500 }}>
                Create new property type
              </Typography>
              <QuestionIcon
                sx={{
                  ml: 1.25,
                }}
              />
              <IconButton
                {...bindToggle(modalPopupState)}
                sx={(theme) => ({
                  ml: "auto",
                  svg: {
                    color: theme.palette.gray[50],
                    fontSize: 20,
                  },
                })}
              >
                <FontAwesomeIcon icon={faClose} />
              </IconButton>
            </Box>
            <PropertyTypeForm
              createButtonProps={withHandler(bindToggle(modalPopupState), () =>
                onAdd(),
              )}
              discardButtonProps={bindToggle(modalPopupState)}
              initialTitle={searchText}
            />
          </>
        </Modal>
      </TableCell>
    </TableRow>
  );
};

export const InsertPropertyCard = ({
  insertFieldRef,
  onCancel,
}: {
  insertFieldRef: Ref<HTMLInputElement | null>;
  onCancel: () => void;
}) => {
  const [addingNewProperty, setAddingNewProperty] = useStateCallback(true);
  const [created, setCreated] = useState<string[]>([]);
  const addingNewPropertyRef = useRef<HTMLInputElement>(null);

  const sharedRef = useForkRef(addingNewPropertyRef, insertFieldRef);

  return (
    <WhiteCard>
      <Box sx={{ p: 0.5 }}>
        <Table
          sx={(theme) => ({
            [`.${tableCellClasses.root}`]: {
              pl: 3.5,
              pr: 1,
              py: 0.5,
              border: "none",
            },
            [`.${tableCellClasses.head}`]: {
              py: 1.5,
              borderBottom: 1,
              borderColor: theme.palette.gray[20],
              fontWeight: "inherit",
              lineHeight: "inherit",
              ":not(:nth-of-type(1)):not(:nth-of-type(2)):not(:last-child)": {
                px: 0,
                textAlign: "center",
              },

              [`.${svgIconClasses.root}`]: {
                verticalAlign: "middle",
                ml: 0.75,
              },
            },
            [`.${tableBodyClasses.root}:before`]: {
              lineHeight: "6px",
              content: `"\\200C"`,
              display: "block",
            },
            [`.${tableCellClasses.body} .${checkboxClasses.root}`]: {
              textAlign: "center",
            },
            [`.${tableBodyClasses.root} .${tableRowClasses.root}`]: {
              [`.${tableCellClasses.root}`]: {
                "&:first-child": {
                  borderTopLeftRadius: 1,
                  borderBottomLeftRadius: 1,
                },
                "&:last-child": {
                  borderTopRightRadius: 1,
                  borderBottomRightRadius: 1,
                },
              },
              [`&:hover .${tableCellClasses.root}`]: {
                background: theme.palette.gray[10],
              },
            },
          })}
        >
          <TableHead>
            <Typography
              component={TableRow}
              variant="smallTextLabels"
              sx={{
                fontWeight: 600,
              }}
            >
              <TableCell>Property name</TableCell>
              <TableCell sx={{ width: 180 }}>Expected values</TableCell>
              <TableCell
                sx={{
                  width: "170px !important",
                }}
              >
                Allow multiple values <QuestionIcon />
              </TableCell>
              <TableCell sx={{ width: 100 }}>Required</TableCell>
              <TableCell sx={{ width: 150 }}>
                Default value <QuestionIcon />
              </TableCell>
              <TableCell sx={{ width: 70 }} />
            </Typography>
          </TableHead>
          <TableBody>
            {created.map((id) => (
              <TableRow key={id}>
                <TableCell>
                  <Typography variant="smallTextLabels" fontWeight={500}>
                    Share Price
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip label="Number" />
                </TableCell>
                <TableCell sx={{ textAlign: "center" }}>
                  <Checkbox />
                </TableCell>
                <TableCell sx={{ textAlign: "center" }}>
                  <Checkbox />
                </TableCell>
                <TableCell sx={{ px: "0px !important" }}>
                  <TextField
                    placeholder="Add default value"
                    sx={{
                      width: "100%",
                      [`.${tableRowClasses.root}:not(:hover) & .${outlinedInputClasses.root}:not(:focus-within)`]:
                        {
                          boxShadow: "none",
                          [`.${outlinedInputClasses.notchedOutline}`]: {
                            borderColor: "transparent",
                          },
                          [`.${outlinedInputClasses.input}::placeholder`]: {
                            color: "transparent",
                          },
                        },
                    }}
                    inputProps={{ sx: { textOverflow: "ellipsis" } }}
                  />
                </TableCell>
                <TableCell>
                  <PropertyMenu
                    onRemove={() => {
                      const onlyItem = created.length === 1;
                      setCreated((list) => list.filter((item) => item !== id));
                      if (onlyItem) {
                        setAddingNewProperty(true);
                        onCancel();
                      }
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            {addingNewProperty ? (
              <InsertPropertyRow
                inputRef={sharedRef}
                onCancel={() => {
                  if (!created.length) {
                    onCancel();
                  } else {
                    setAddingNewProperty(false);
                  }
                }}
                onAdd={() => {
                  setAddingNewProperty(false);
                  setCreated((list) => [
                    ...list,
                    (Math.random() + 1).toString(36).substring(7),
                  ]);
                }}
              />
            ) : (
              <TableRow>
                <TableCell
                  colSpan={
                    // Sufficiently large to span full width
                    100
                  }
                  sx={{
                    p: "0 !important",
                  }}
                >
                  <ButtonBase
                    disableRipple
                    disableTouchRipple
                    onClick={() => {
                      setAddingNewProperty(true, () => {
                        addingNewPropertyRef.current?.focus();
                      });
                    }}
                    sx={(theme) => ({
                      color: theme.palette.gray[50],
                      py: 1.5,
                      width: "100%",
                      borderRadius: 1,
                      "&:hover": {
                        backgroundColor: theme.palette.gray[10],
                        color: theme.palette.gray[70],
                      },
                    })}
                  >
                    <StyledPlusCircleIcon />
                    <Typography
                      variant="smallTextLabels"
                      fontWeight={500}
                      ml={1}
                    >
                      Add a property
                    </Typography>
                  </ButtonBase>
                </TableCell>
              </TableRow>
            )}
          </TableFooter>
        </Table>
      </Box>
    </WhiteCard>
  );
};

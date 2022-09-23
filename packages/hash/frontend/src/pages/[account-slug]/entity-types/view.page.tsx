import { faQuestionCircle } from "@fortawesome/free-regular-svg-icons";
import {
  faBriefcase,
  faClose,
  faEllipsis,
  faList,
  faPlus,
  faPlusCircle,
  faSearch,
} from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  ButtonProps,
  Chip,
  FontAwesomeIcon,
  IconButton,
  IconButtonProps,
  Menu,
  MenuItem,
  TextField,
} from "@hashintel/hash-design-system";
import {
  Autocomplete,
  autocompleteClasses,
  Box,
  ButtonBase,
  Card,
  CardActionArea,
  cardActionAreaClasses,
  CardActionAreaProps,
  CardContent,
  CardContentProps,
  Checkbox,
  checkboxClasses,
  Container,
  Divider,
  experimental_sx as sx,
  inputClasses,
  inputLabelClasses,
  ListItem,
  listItemClasses,
  ListItemText,
  listItemTextClasses,
  menuItemClasses,
  outlinedInputClasses,
  Paper,
  PaperProps,
  PopperProps,
  Stack,
  styled,
  SxProps,
  Table,
  TableBody,
  tableBodyClasses,
  TableCell,
  tableCellClasses,
  TableFooter,
  TableHead,
  TableRow,
  tableRowClasses,
  TextFieldProps,
  Theme,
  Typography,
  useForkRef,
} from "@mui/material";
import {
  bindMenu,
  bindPopover,
  bindToggle,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import Image from "next/image";
import {
  ComponentProps,
  createContext,
  Ref,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { Modal } from "../../../components/Modals/Modal";
import { ArrowUpRightIcon, PlusCircleIcon } from "../../../shared/icons/svg";
import { getPlainLayout, NextPageWithLayout } from "../../../shared/layout";
import { TopContextBar } from "../../shared/top-context-bar";
import { OurChip, placeholderUri } from "./Chip";

// Call a function in addition to handling popup state on click
const withHandler = <
  T extends ReturnType<typeof bindTrigger> | ReturnType<typeof bindToggle>,
>(
  trigger: T,
  handler: () => void,
): T => {
  return {
    ...trigger,
    onClick: (...args) => {
      handler();
      return trigger.onClick(...args);
    },
    onTouchStart: (...args) => {
      handler();
      return trigger.onTouchStart(...args);
    },
  };
};

const QuestionIcon = styled(
  (props: Omit<ComponentProps<typeof FontAwesomeIcon>, "icon">) => (
    <FontAwesomeIcon {...props} icon={faQuestionCircle} />
  ),
)(
  sx<Theme>((theme) => ({
    color: theme.palette.gray[40],
  })),
);

const WhiteCard = ({
  onClick,
  children,
}: {
  onClick?: CardActionAreaProps["onClick"];
  children: CardContentProps["children"];
}) => {
  const cardContent = (
    <CardContent
      sx={{
        p: "0 !important",
        background: "white",
      }}
    >
      {children}
    </CardContent>
  );

  return (
    <Card
      sx={[
        (theme) => ({
          boxShadow: theme.boxShadows.xs,
        }),
        onClick
          ? (theme) => ({
              "&:hover": {
                boxShadow: theme.boxShadows.md,
              },
            })
          : {},
      ]}
    >
      {onClick ? (
        <CardActionArea
          onClick={onClick}
          disableRipple
          disableTouchRipple
          sx={{
            [`&:hover .${cardActionAreaClasses.focusHighlight}`]: {
              opacity: 0,
            },
          }}
        >
          {cardContent}
        </CardActionArea>
      ) : (
        cardContent
      )}
    </Card>
  );
};

const cardActionHoverBlue: SxProps<Theme> = (theme) => ({
  [`.${cardActionAreaClasses.root}:hover &`]: {
    color: theme.palette.blue[70],
  },
});

const Input = (props: TextFieldProps) => (
  <TextField {...props} placeholder="Add default value" sx={{ width: 165 }} />
);

// @todo move into design system
const NewPropertyTypeForm = ({
  createButtonProps,
  discardButtonProps,
  initialTitle,
}: {
  createButtonProps: Omit<ButtonProps, "size" | "variant" | "children">;
  discardButtonProps: Omit<ButtonProps, "size" | "variant" | "children">;
  initialTitle?: string;
}) => (
  <Box minWidth={500} p={3}>
    <Stack
      alignItems="stretch"
      spacing={3}
      sx={(theme) => ({
        [`.${inputLabelClasses.root}`]: {
          display: "flex",
          alignItems: "center",
        },
        [`.${inputLabelClasses.asterisk}`]: {
          color: theme.palette.blue[70],
        },
      })}
    >
      <TextField
        label="Singular name"
        required
        placeholder="e.g. Stock Price"
        defaultValue={initialTitle}
      />
      <TextField
        multiline
        inputProps={{ minRows: 1 }}
        label={
          <>
            Description <QuestionIcon sx={{ order: 1, ml: 0.75 }} />
          </>
        }
        required
        placeholder="Describe this property type in one or two sentences"
      />
      <TextField
        label="Expected values"
        sx={{ alignSelf: "flex-start", width: "70%" }}
        required
        placeholder="Select acceptable values"
      />
    </Stack>
    <Divider sx={{ mt: 2, mb: 3 }} />
    <Stack direction="row" spacing={1.25}>
      <Button {...createButtonProps} size="small">
        Create new property type
      </Button>
      <Button {...discardButtonProps} size="small" variant="tertiary">
        Discard draft
      </Button>
    </Stack>
  </Box>
);

const PropertyMenu = ({
  disabled,
  onRemove,
  ...props
}: IconButtonProps & { onRemove?: () => void }) => {
  const id = useId();
  const popupState = usePopupState({
    variant: "popover",
    popupId: `property-${id}`,
  });

  return (
    <>
      <IconButton
        {...props}
        disabled={disabled}
        sx={{
          opacity: 0,
          ...(!disabled && {
            [`.${tableRowClasses.root}:hover &`]: {
              opacity: 1,
            },
          }),
        }}
        {...bindTrigger(popupState)}
      >
        <FontAwesomeIcon
          icon={faEllipsis}
          sx={(theme) => ({
            fontSize: 14,
            color: theme.palette.gray[50],
          })}
        />
      </IconButton>
      {/** @todo move list section label system into design system */}
      <Menu
        {...bindMenu(popupState)}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        sx={(theme) => ({
          [`.${listItemClasses.root}, .${menuItemClasses.root}`]: {
            px: 1.5,
            py: 1,
          },
          ".MuiTypography-smallCaps": {
            color: theme.palette.gray[50],
          },
          ".MuiTypography-microText": {
            color: theme.palette.gray[60],
          },
          [`.${listItemClasses.root}`]: {
            userSelect: "none",
            cursor: "default",
          },
          [`.${listItemTextClasses.root}`]: {
            m: 0,
          },
        })}
      >
        <Typography component={ListItem} variant="smallCaps">
          Actions
        </Typography>
        <MenuItem>
          <ListItemText primary="View property type" />
        </MenuItem>
        <MenuItem>
          <ListItemText primary="Edit property type" />
        </MenuItem>
        <MenuItem>
          <ListItemText primary="Copy link" />
        </MenuItem>
        <MenuItem
          onClick={() => {
            popupState.close();
            onRemove?.();
          }}
        >
          <ListItemText primary="Remove property" />
        </MenuItem>
        <Divider />
        <Typography component={ListItem} variant="smallCaps">
          Source
        </Typography>
        <ListItem sx={{ pt: "0 !important" }}>
          <OurChip
            icon={
              <Box
                component={Image}
                src={placeholderUri}
                layout="fill"
                alt=""
              />
            }
            domain="hash.ai"
            path={
              <>
                <Typography component="span" maxWidth="6ch">
                  @acme-corp
                </Typography>
                /
                <Typography component="span" maxWidth="5ch">
                  competitive-advantages
                </Typography>
              </>
            }
          />
        </ListItem>
        <Divider />
        <ListItem>
          <ListItemText
            primary="Version 3"
            primaryTypographyProps={{ variant: "microText", fontWeight: 500 }}
          />
        </ListItem>
      </Menu>
    </>
  );
};

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

const PaperWithCreateButton = ({ children, ...props }: PaperProps) => {
  const { query, createButtonProps } = usePaperWithCreateButtonContext();
  return (
    <Paper
      {...props}
      sx={(theme) => ({
        p: 1,
        border: 1,
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
        [`.${autocompleteClasses.option}`]: { borderRadius: 1 },
      })}
    >
      {children}
      <Button
        variant="tertiary"
        startIcon={<PlusCircleIcon />}
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
  );
};

const NewPropertyRow = ({
  inputRef,
  // onCancel,
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

  const options = [
    {
      title: "Share Price",
      icon: placeholderUri,
      domain: "hash.ai",
      path: "@nasdaq",
      expectedValues: ["Currency"],
      description: "A company's current price per share",
    },
    {
      title: "Stock Symbol ",
      icon: placeholderUri,
      domain: "hash.ai",
      path: "@acme-corp",
      expectedValues: ["Text"],
      description:
        "An abbreviation used to uniquely identify public traded shares",
    },
    {
      title: "Ownership Percentage",
      icon: placeholderUri,
      domain: "hash.ai",
      path: "@wrapped-text-that-is-long-enough",
      expectedValues: ["Number"],
      description:
        "An entity’s ownership stake in another entity expressed as a property with a bunch of text long enough to make it wrap",
    },
  ];

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
          // state.elements.popper.setAttribute("data-placement", state.placement);
        },
      },
    ],
    [],
  );

  return (
    <TableRow data-disabled>
      <TableCell colSpan={2}>
        <PaperWithCreateButtonContext.Provider
          value={{
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
          }}
        >
          <Autocomplete
            popupIcon={null}
            clearIcon={null}
            forcePopupIcon={false}
            selectOnFocus={false}
            openOnFocus
            inputValue={searchText}
            clearOnBlur={false}
            onInputChange={(_, value) => setSearchText(value)}
            onChange={() => onAdd()}
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
                    boxShadow: "none",

                    [`.${outlinedInputClasses.notchedOutline}`]: {
                      border: `1px solid ${theme.palette.gray[30]} !important`,
                    },

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
                }}
              />
            )}
            options={options}
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
                    <OurChip
                      icon={
                        <Box
                          component={Image}
                          src={option.icon}
                          layout="fill"
                          alt=""
                        />
                      }
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
          onClose={() => {}}
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
            <NewPropertyTypeForm
              createButtonProps={withHandler(bindToggle(modalPopupState), () =>
                onAdd(),
              )}
              discardButtonProps={bindToggle(modalPopupState)}
              initialTitle={searchText}
            />
          </>
        </Modal>
      </TableCell>
      <TableCell>
        <Checkbox disabled />
      </TableCell>
      <TableCell>
        <Checkbox disabled />
      </TableCell>
      <TableCell>
        <Input />
      </TableCell>
      <TableCell>
        <PropertyMenu disabled />
      </TableCell>
    </TableRow>
  );
};

const CreatePropertyCard = ({
  onClick,
}: Pick<CardActionAreaProps, "onClick">) => (
  <WhiteCard onClick={onClick}>
    <Stack
      direction="row"
      alignItems="center"
      sx={{
        px: 5,
        py: 4,
      }}
    >
      <FontAwesomeIcon
        icon={faList}
        sx={[{ fontSize: 20 }, cardActionHoverBlue]}
      />
      <Box ml={5}>
        <Typography
          sx={[
            { display: "flex", alignItems: "center", mb: 0.75 },
            cardActionHoverBlue,
          ]}
        >
          <Box component="span" mr={1} fontWeight={500}>
            Add a property
          </Box>
          <FontAwesomeIcon icon={faPlus} />
        </Typography>
        <Typography
          variant="microText"
          component="p"
          sx={(theme) => ({ color: theme.palette.gray[90] })}
        >
          Properties store individual pieces of information about some aspect of
          an entity
        </Typography>
        <Typography
          variant="microText"
          component="p"
          sx={(theme) => ({ color: theme.palette.gray[60] })}
        >
          e.g. a person entity might have a date of birth property which expects
          a date
        </Typography>
      </Box>
    </Stack>
  </WhiteCard>
);

const InsertPropertyCard = ({
  insertFieldRef,
}: {
  insertFieldRef: Ref<HTMLInputElement | null>;
}) => {
  const [addingNewProperty, setAddingNewProperty] = useState(true);
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
              py: 1.5,
              border: "none",
            },
            [`.${tableCellClasses.head}`]: {
              py: 1.5,
              borderBottom: "solid",
              borderColor: theme.palette.gray[20],
              fontWeight: "inherit",
              lineHeight: "inherit",
            },
            [`.${tableBodyClasses.root}:before`]: {
              lineHeight: "6px",
              content: `"\\200C"`,
              display: "block",
            },
            [`.${tableCellClasses.head}:not(:first-child)`]: {
              width: 0,
              whiteSpace: "nowrap",
            },
            [`.${tableCellClasses.body} .${checkboxClasses.root}`]: {
              textAlign: "center",
              display: "block",
            },
            // @todo move these styles to a component
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
              [`&:not([data-disabled]):hover .${tableCellClasses.root}`]: {
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
              <TableCell>Expected values</TableCell>
              <TableCell>Allow multiple values</TableCell>
              <TableCell>Required</TableCell>
              <TableCell>Default value</TableCell>
              <TableCell />
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
                <TableCell>
                  <Checkbox />
                </TableCell>
                <TableCell>
                  <Checkbox />
                </TableCell>
                <TableCell>
                  <Input />
                </TableCell>
                <TableCell>
                  <PropertyMenu
                    onRemove={() => {
                      setCreated((list) => list.filter((item) => item !== id));
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
            {!addingNewProperty ? null : (
              <NewPropertyRow
                inputRef={sharedRef}
                onCancel={() => {
                  setAddingNewProperty(false);
                }}
                onAdd={() => {
                  setAddingNewProperty(false);
                  setCreated((list) => [
                    ...list,
                    (Math.random() + 1).toString(36).substring(7),
                  ]);
                }}
              />
            )}
          </TableBody>
          <TableFooter>
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
                    flushSync(() => {
                      setAddingNewProperty(true);
                    });

                    addingNewPropertyRef.current?.focus();
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
                  {/** @todo must be outlined */}
                  <FontAwesomeIcon
                    icon={faPlusCircle}
                    sx={{ fontSize: 12, mr: 1 }}
                  />
                  <Typography variant="smallTextLabels" fontWeight={500}>
                    Add a property
                  </Typography>
                </ButtonBase>
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Box>
    </WhiteCard>
  );
};

const Page: NextPageWithLayout = () => {
  const [mode, setMode] = useState<"empty" | "inserting">("empty");

  const insertFieldRef = useRef<HTMLInputElement>(null);

  return (
    <Box
      component={Stack}
      sx={(theme) => ({
        minHeight: "100vh",
        background: theme.palette.gray[10],
      })}
    >
      <Box bgcolor="white" borderBottom={1} borderColor="gray.20">
        <TopContextBar
          defaultCrumbIcon={null}
          crumbs={[
            {
              title: "Types",
              href: "#",
              id: "types",
            },
            {
              title: "Entity types",
              href: "#",
              id: "entity-types",
            },
          ]}
          scrollToTop={() => {}}
        />
        <Box pt={3.75}>
          <Container>
            <OurChip
              icon={
                <Box
                  component={Image}
                  src={placeholderUri}
                  layout="fill"
                  alt=""
                />
              }
              domain="hash.ai"
              path={
                <>
                  <Typography
                    component="span"
                    fontWeight="bold"
                    color={(theme) => theme.palette.blue[70]}
                  >
                    @acme-corp
                  </Typography>
                  <Typography
                    component="span"
                    color={(theme) => theme.palette.blue[70]}
                  >
                    /entity-types/
                  </Typography>
                  <Typography
                    component="span"
                    fontWeight="bold"
                    color={(theme) => theme.palette.blue[70]}
                  >
                    @company
                  </Typography>
                </>
              }
            />
            <Typography variant="h1" fontWeight="bold" mt={3} mb={4.5}>
              <FontAwesomeIcon
                // @todo not quite right icon
                icon={faBriefcase}
                sx={{ fontSize: 38, mr: 3 }}
              />
              Company
            </Typography>
          </Container>
        </Box>
      </Box>
      <Box py={5}>
        <Container>
          <Typography variant="h5" mb={1.25}>
            Properties of{" "}
            <Box component="span" sx={{ fontWeight: "bold" }}>
              company
            </Box>
          </Typography>
          {mode === "empty" ? (
            <CreatePropertyCard
              onClick={() => {
                flushSync(() => {
                  setMode("inserting");
                });

                insertFieldRef.current?.focus();
              }}
            />
          ) : (
            <InsertPropertyCard insertFieldRef={insertFieldRef} />
          )}
        </Container>
      </Box>
    </Box>
  );
};

Page.getLayout = getPlainLayout;

export default Page;

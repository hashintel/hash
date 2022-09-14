import {
  faBriefcase,
  faEllipsis,
  faList,
  faPlus,
  faPlusCircle,
  faSearch,
} from "@fortawesome/free-solid-svg-icons";
import {
  Chip,
  FontAwesomeIcon,
  IconButton,
  Menu,
  MenuItem,
  TextField,
} from "@hashintel/hash-design-system";
import {
  Box,
  Card,
  CardActionArea,
  cardActionAreaClasses,
  CardActionAreaProps,
  CardContent,
  CardContentProps,
  Container,
  Stack,
  SxProps,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Theme,
  Typography,
  Checkbox,
  tableCellClasses,
  checkboxClasses,
  Divider,
  ListItem,
  menuItemClasses,
  listItemClasses,
  typographyClasses,
  ListItemText,
  listItemTextClasses,
} from "@mui/material";
import { bindMenu, bindTrigger } from "material-ui-popup-state";
import { usePopupState } from "material-ui-popup-state/hooks";
import Image from "next/image";
import { useId, useState } from "react";
import { getPlainLayout, NextPageWithLayout } from "../../../shared/layout";
import { Button } from "../../../shared/ui/button";
import { TopContextBar } from "../../shared/top-context-bar";
import { OurChip, placeholderUri } from "./Chip";

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
        p: 0,
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

const input = <TextField placeholder="Add default value" sx={{ width: 165 }} />;

const PropertyMenu = () => {
  const id = useId();
  const popupState = usePopupState({
    variant: "popover",
    popupId: `property-${id}`,
  });

  return (
    <>
      <IconButton {...bindTrigger(popupState)}>
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
        <MenuItem>
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

const InsertPropertyCard = () => (
  <WhiteCard>
    <Box sx={{ p: 0.5 }}>
      <Table
        sx={(theme) => ({
          [`.${tableCellClasses.head}`]: {
            px: 2,
            py: 1.5,
            borderBottom: "solid",
            borderColor: theme.palette.gray[20],
            fontWeight: "inherit",
            lineHeight: "inherit",
          },
          [`.${tableCellClasses.head}:not(:first-child)`]: {
            width: 0,
            whiteSpace: "nowrap",
          },
          [`.${tableCellClasses.body} .${checkboxClasses.root}`]: {
            margin: "0 auto",
            textAlign: "center",
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
          <TableRow>
            <TableCell colSpan={2}>
              <TextField
                placeholder="Search for a property type"
                sx={{ width: "100%" }}
                InputProps={{
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
                }}
              />
            </TableCell>
            <TableCell>
              <Checkbox />
            </TableCell>
            <TableCell>
              <Checkbox />
            </TableCell>
            <TableCell>{input}</TableCell>
            <TableCell>
              <PropertyMenu />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Share Price</TableCell>
            <TableCell>
              <Chip label="Number" />
            </TableCell>
            <TableCell>
              <Checkbox />
            </TableCell>
            <TableCell>
              <Checkbox />
            </TableCell>
            <TableCell>{input}</TableCell>
            <TableCell>
              <PropertyMenu />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell colSpan={6} sx={{ textAlign: "center" }}>
              <Button
                onClick={() => alert("Add a property")}
                variant="tertiary_quiet"
                startIcon={
                  // @todo must be outlijned
                  <FontAwesomeIcon icon={faPlusCircle} sx={{ fontSize: 12 }} />
                }
              >
                Add a property
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Box>
  </WhiteCard>
);

const Page: NextPageWithLayout = () => {
  const [mode, setMode] = useState<"empty" | "inserting">("empty");
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
                setMode("inserting");
              }}
            />
          ) : (
            <InsertPropertyCard />
          )}
        </Container>
      </Box>
    </Box>
  );
};

Page.getLayout = getPlainLayout;

export default Page;

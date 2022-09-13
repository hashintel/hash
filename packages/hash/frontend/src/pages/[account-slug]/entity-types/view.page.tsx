import { faBriefcase, faList, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, TextField } from "@hashintel/hash-design-system";
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
} from "@mui/material";
import Image from "next/image";
import { useState } from "react";
import { getPlainLayout, NextPageWithLayout } from "../../../shared/layout";
import { TopContextBar } from "../../shared/top-context-bar";
import { Chip, placeholderUri } from "./Chip";

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
    <Table
      sx={{
        [`.${tableCellClasses.head}`]: {
          fontWeight: "bold",
        },
        [`.${tableCellClasses.head}:not(:first-child)`]: {
          // @todo is this the right way to do this?
          width: 0,
          whiteSpace: "nowrap",
        },
        [`.${tableCellClasses.body}`]: {
          textAlign: "center",
        },
      }}
    >
      <TableHead>
        <TableRow>
          <TableCell>Property name</TableCell>
          <TableCell>Expected values</TableCell>
          <TableCell>Allow multiple values</TableCell>
          <TableCell>Required</TableCell>
          <TableCell>Default value</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        <TableRow>
          <TableCell colSpan={2}>
            <TextField
              placeholder="Search for a property type"
              sx={{ width: "100%" }}
            />
          </TableCell>
          <TableCell>
            <Checkbox />
          </TableCell>
          <TableCell>
            <Checkbox />
          </TableCell>
          <TableCell />
        </TableRow>
      </TableBody>
    </Table>
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
            <Chip
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
                    color="inherit"
                  >
                    @acme-corp
                  </Typography>
                  /entity-types/
                  <Typography
                    component="span"
                    fontWeight="bold"
                    color="inherit"
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

import { faBriefcase, faList, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system";
import {
  Box,
  Card,
  CardActionArea,
  cardActionAreaClasses,
  CardActionAreaProps,
  CardContent,
  Container,
  Stack,
  SxProps,
  Theme,
  Typography,
} from "@mui/material";
import Image from "next/image";
import { getPlainLayout, NextPageWithLayout } from "../../../shared/layout";
import { TopContextBar } from "../../shared/top-context-bar";
import { Chip, placeholderUri } from "./Chip";

const CreatePropertyCard = ({
  onClick,
}: Pick<CardActionAreaProps, "onClick">) => (
  <Card
    sx={(theme) => ({
      boxShadow: theme.boxShadows.xs,
      "&:hover": {
        boxShadow: theme.boxShadows.md,
      },
    })}
  >
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
      <CardContent
        sx={{
          p: 0,
          background: "white",
        }}
      >
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
              Properties store individual pieces of information about some
              aspect of an entity
            </Typography>
            <Typography
              variant="microText"
              component="p"
              sx={(theme) => ({ color: theme.palette.gray[60] })}
            >
              e.g. a person entity might have a date of birth property which
              expects a date
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </CardActionArea>
  </Card>
);

const cardActionHoverBlue: SxProps<Theme> = (theme) => ({
  [`.${cardActionAreaClasses.root}:hover &`]: {
    color: theme.palette.blue[70],
  },
});

const Page: NextPageWithLayout = () => {
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
          <CreatePropertyCard
            onClick={() => {
              alert("Create property");
            }}
          />
        </Container>
      </Box>
    </Box>
  );
};

Page.getLayout = getPlainLayout;

export default Page;

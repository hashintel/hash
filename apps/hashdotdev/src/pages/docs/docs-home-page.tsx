import { faPlay } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  BoxProps,
  Container,
  Divider,
  Grid,
  Typography,
  typographyClasses,
} from "@mui/material";
import { FunctionComponent, ReactNode } from "react";

import { ArrowRightRegularIcon } from "../../components/icons/arrow-right-regular-icon";
import { BookRegularIcon } from "../../components/icons/book-regular-icon";
import { EarthAmericasRegularIcon } from "../../components/icons/earth-americas-regular-icon";
import { EllipsisRegularIcon } from "../../components/icons/ellipsis-regular-icon";
import { FontAwesomeIcon } from "../../components/icons/font-awesome-icon";
import { GithubIcon } from "../../components/icons/github-icon";
import { GlobeRegularIcon } from "../../components/icons/globe-regular-icon";
import { HubspotIcon } from "../../components/icons/hubspot-icon";
import { ServerRegularIcon } from "../../components/icons/server-regular-icon";
import { Link } from "../../components/link";
import { useCases } from "../roadmap/use-cases";
import { HashIcon } from "./hash-icon";

const gettingStartedLinks = [
  {
    title: "Run on the global network",
    description: "Quickest, easiest, recommended",
    icon: <GlobeRegularIcon />,
    href: "https://app.hash.ai/signup",
  },
  {
    title: "Self-host HASH",
    description: "Run HASH on your own infrastructure",
    icon: <ServerRegularIcon />,
    href: "/docs/get-started/setup#local-hash",
  },
];

const GettingStartedLinks: FunctionComponent = () => (
  <Box
    sx={{
      flexShrink: 0,
      marginLeft: {
        xs: 0,
        md: 5,
      },
      background: ({ palette }) => palette.common.white,
      borderStyle: "solid",
      borderWidth: 1,
      borderColor: ({ palette }) => palette.gray[30],
      padding: ({ spacing }) => spacing(3, 4),
      borderRadius: "16px",
      marginBottom: {
        xs: 6,
        md: -4.5,
      },
      alignSelf: {
        xs: "stretch",
        md: "flex-start",
      },
    }}
  >
    <Box display="flex" alignItems="center" marginBottom={2.5}>
      <Box
        sx={{
          backgroundColor: ({ palette }) => palette.blue[20],
          width: 30,
          height: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "8px",
          marginRight: 1.25,
        }}
      >
        <FontAwesomeIcon
          icon={faPlay}
          sx={{ color: ({ palette }) => palette.teal[60] }}
        />
      </Box>
      <Typography sx={{ fontSize: 22, fontWeight: 600 }}>
        Getting Started
      </Typography>
    </Box>
    <Divider sx={{ marginBottom: 2.25 }} />
    <Box
      sx={{
        display: "flex",
        flexDirection: {
          xs: "row",
          md: "column",
        },
        gap: 1.75,
        flexWrap: "wrap",
      }}
    >
      {gettingStartedLinks.map(({ href, icon, title, description }) => (
        <Link
          key={href}
          href={href}
          sx={{
            flexShrink: 0,
            ".heading, .heading svg": {
              transition: ({ transitions }) => transitions.create("color"),
            },
            ":hover": {
              ".heading, .heading svg": {
                color: ({ palette }) => palette.teal[70],
              },
            },
          }}
        >
          <Box display="flex">
            <Box
              sx={{
                width: 30,
                marginRight: 1.25,
                display: "flex",
                justifyContent: "center",
                paddingTop: 1,
                svg: {
                  fontSize: 16,
                  color: ({ palette }) => palette.teal[60],
                },
              }}
            >
              {icon}
            </Box>
            <Box>
              <Typography
                className="heading"
                sx={{
                  fontSize: 16,
                  fontWeight: 600,
                }}
              >
                <strong>{title}</strong>
                <ArrowRightRegularIcon
                  sx={{
                    fontSize: 16,
                    marginLeft: 1,
                    color: ({ palette }) => palette.teal[50],
                  }}
                />
              </Typography>
              <Typography
                sx={{
                  fontSize: 15,
                  color: ({ palette }) => palette.gray[70],
                }}
              >
                {description}
              </Typography>
            </Box>
          </Box>
        </Link>
      ))}
    </Box>
  </Box>
);

const LabelWithIcon: FunctionComponent<
  BoxProps & {
    label: ReactNode;
    icon: ReactNode;
    iconBackground?: "white" | "teal";
    href?: string;
  }
> = ({ label, icon, href, iconBackground = "white", ...boxProps }) => {
  const content = (
    <Box display="flex" alignItems="center" {...boxProps}>
      <Box
        sx={{
          background: ({ palette }) =>
            iconBackground === "white" ? palette.white : palette.teal[10],
          borderRadius: "8px",
          width: 30,
          height: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginRight: 1.75,
          borderColor: ({ palette }) =>
            iconBackground === "white" ? "transparent" : palette.teal[30],
          borderStyle: "solid",
          borderWidth: 1,
          svg: {
            fontSize: 16,
            color: ({ palette }) => palette.teal[60],
          },
        }}
      >
        {icon}
      </Box>
      <Typography
        sx={{
          fontSize: 16,
          fontWeight: 600,
          color: ({ palette }) => palette.black,
          transition: ({ transitions }) => transitions.create("color"),
        }}
      >
        {label}
      </Typography>
    </Box>
  );

  return href ? (
    <Link
      href={href}
      sx={{
        "&:hover": {
          [`.${typographyClasses.root}`]: {
            color: ({ palette }) => palette.teal[60],
          },
        },
      }}
    >
      {content}
    </Link>
  ) : (
    content
  );
};

export const DocsHomePage: FunctionComponent = () => {
  return (
    <>
      <Container
        sx={{
          paddingTop: 8,
          display: "flex",
          alignItems: "flex-end",
          flexDirection: {
            xs: "column",
            md: "row",
          },
        }}
      >
        <Box>
          <Box
            display="flex"
            alignItems="center"
            columnGap={2.5}
            marginBottom={2.5}
          >
            <HashIcon sx={{ width: 46, height: 46 }} />
            <Typography
              variant="hashHeading2"
              component="h1"
              sx={{ fontWeight: 500 }}
            >
              Developer Docs
            </Typography>
          </Box>
          <Typography
            sx={{ marginBottom: { xs: 4, md: 8 } }}
            variant="hashLargeText"
          >
            Learn how to get up and running with HASH, and make the most of your
            new superpowers
          </Typography>
        </Box>
        <GettingStartedLinks />
      </Container>
      <Box
        sx={{ background: "linear-gradient(180deg, #EEF5F7 0%, #F5FDFF 100%)" }}
      >
        <Container sx={{ py: 6 }}>
          <Typography
            variant="hashSmallCaps"
            sx={{ color: ({ palette }) => palette.teal[70] }}
          >
            Use Cases
          </Typography>
          <Typography
            variant="hashHeading5"
            component="h2"
            sx={{
              color: ({ palette }) => palette.black,
              fontWeight: 600,
              marginBottom: 2.5,
            }}
          >
            Learn about HASH for...
          </Typography>
          <Divider sx={{ marginBottom: 2.25 }} />
          <Box display="flex" flexWrap="wrap" gap={3}>
            {useCases.map(({ id, name, icon }) => (
              <LabelWithIcon
                key={id}
                label={name}
                icon={icon}
                href="/"
                width={250}
              />
            ))}
          </Box>
        </Container>
      </Box>
      <Container sx={{ py: 6 }}>
        <Grid container spacing={6}>
          <Grid item xs={12} md={4}>
            <Typography
              variant="hashSmallCaps"
              sx={{ color: ({ palette }) => palette.teal[70] }}
            >
              Two-way sync
            </Typography>
            <Typography
              variant="hashHeading5"
              component="h2"
              sx={{
                color: ({ palette }) => palette.black,
                fontWeight: 600,
                marginBottom: 2.5,
              }}
            >
              Bring the tools you love
            </Typography>
            <Typography marginBottom={3} fontSize={16}>
              Continue seamlessly working with information in your existing
              favorite tools and apps…
            </Typography>
            {/* <Link href="/docs/get-started/adopt">
              <Box
                display="flex"
                sx={{
                  display: "flex",
                  background: ({ palette }) => palette.teal[10],
                  borderColor: ({ palette }) => palette.teal[30],
                  borderStyle: "solid",
                  borderWidth: 1,
                  columnGap: 1.25,
                  padding: ({ spacing }) => spacing(1.75, 1.25),
                  borderRadius: "8px",
                }}
              >
                <Box
                  width={30}
                  height={30}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <BookRegularIcon
                    sx={{ color: ({ palette }) => palette.teal[80] }}
                  />
                </Box>
                <Box>
                  <Typography
                    sx={{
                      color: ({ palette }) => palette.teal[80],
                      fontSize: 16,
                    }}
                  >
                    <strong>Adopting HASH</strong>
                  </Typography>
                  <Typography
                    sx={{
                      color: ({ palette }) => palette.teal[80],
                      fontSize: 15,
                    }}
                  >
                    Learn more about incrementally adopting HASH{" "}
                    <ArrowRightRegularIcon
                      sx={{ position: "relative", top: 2 }}
                    />
                  </Typography>
                </Box>
              </Box>
            </Link> */}
          </Grid>
          <Grid item xs={12} md={8}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <Typography
                  variant="hashSmallCaps"
                  component="p"
                  marginBottom={3}
                >
                  Datastores
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: { md: "column", xs: "row" },
                    flexWrap: "wrap",
                    gap: 3,
                  }}
                >
                  {["PostgreSQL", "Snowflake", "BigQuery", "AWS Redshift"].map((name) => (
                    <LabelWithIcon
                      key={name}
                      label={name}
                      iconBackground="teal"
                      icon={<EarthAmericasRegularIcon />}
                      width={180}
                    />
                  ))}
                </Box>
              </Grid>
              <Grid
                item
                xs={12}
                md={8}
                sx={{ display: "flex", flexDirection: "column" }}
              >
                <Typography
                  variant="hashSmallCaps"
                  component="p"
                  marginBottom={3}
                >
                  Applications
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: {
                      xs: "row",
                      md: "column",
                    },
                    gap: 3,
                    flexWrap: "wrap",
                    maxHeight: {
                      xs: "none",
                      md: 200,
                    },
                  }}
                >
                  {[
                    { name: "Notion" },
                    {
                      name: "GitHub",
                      icon: <GithubIcon />,
                    },
                    { name: "Linear" },
                    { name: "Salesforce" },
                    { name: "Greenhouse" },
                    {
                      name: "HubSpot",
                      icon: <HubspotIcon />,
                    },
                    { name: "Slack" },
                  ].map(({ name, icon }) => (
                    <LabelWithIcon
                      key={name}
                      label={name}
                      iconBackground="teal"
                      icon={icon ?? <EarthAmericasRegularIcon />}
                      width={180}
                    />
                  ))}
                  <LabelWithIcon
                    label="View all →"
                    href="https://hash.ai/integrations"
                    iconBackground="teal"
                    icon={<EllipsisRegularIcon />}
                    width={180}
                  />
                </Box>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </Container>
    </>
  );
};

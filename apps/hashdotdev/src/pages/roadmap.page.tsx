import { Box, Container, Typography, typographyClasses } from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";

import { Button } from "../components/button";
import { HiddenAnchorFragmentTag } from "../components/hidden-anchor-fragment-tag";
import { BallotCheckRegularIcon } from "../components/icons/ballot-check-regular-icon";
import { DiagramProjectRegularIcon } from "../components/icons/diagram-project-regular-icon";
import { DiscordIcon } from "../components/icons/discord-icon";
import { GithubIcon } from "../components/icons/github-icon";
import { TeddyBearRegularIcon } from "../components/icons/teddy-bear-regular-icon";
import { WindLightIcon } from "../components/icons/wind-light-icon";
import { Link } from "../components/link";
import { PageLayout } from "../components/page-layout";
import type { NextPageWithLayout } from "../util/next-types";
import { BlueStylishDivider } from "./blog/shared/blue-styled-divider";
import { TechnologyTree } from "./roadmap/technology-tree";
import { useCases } from "./roadmap/use-cases";

const headingLinks: { label: string; href: string; icon: ReactNode }[] = [
  {
    label: "Use Cases",
    href: "#use-cases",
    icon: <BallotCheckRegularIcon />,
  },
  {
    label: "Technology Tree",
    href: "#technology-tree",
    icon: <DiagramProjectRegularIcon />,
  },
  {
    label: "Get Involved",
    href: "#get-involved",
    icon: <TeddyBearRegularIcon />,
  },
];

const Head: FunctionComponent = () => (
  <Container sx={{ marginBottom: 10 }}>
    <Box>
      <Typography variant="hashHeading4" component="h2" mb={3}>
        Where HASH is at
      </Typography>
      <Typography variant="hashLargeTitle" mb={5} sx={{ lineHeight: 1.1 }}>
        Roadmap
      </Typography>
      <BlueStylishDivider mb={5} />
      <Box display="flex">
        <Box width={{ xs: 1, md: 725 }}>
          <Typography mb={2} sx={{ lineHeight: 1.5 }}>
            Here you’ll find the features we’ve built and are building,
            information around the order in which we’ll be addressing them, as
            well as functional and technical specifications.
          </Typography>
          <Typography sx={{ lineHeight: 1.5 }}>
            We’ve mapped these features to use cases, so if you’re interested in
            using HASH for a particular thing, you can follow along (or even
            contribute!)
          </Typography>
        </Box>
        <Box
          marginLeft={16}
          sx={{
            marginLeft: 16,
            display: {
              lg: "block",
              xs: "none",
            },
          }}
        >
          <Typography marginBottom={1}>
            <strong>Quick links</strong>
          </Typography>
          {headingLinks.map(({ label, href, icon }) => (
            <Link
              key={href}
              href={href}
              sx={{
                "&:hover": {
                  [`> .${typographyClasses.root}`]: {
                    color: ({ palette }) => palette.teal[90],
                  },
                },
              }}
            >
              <Typography
                display="flex"
                alignItems="center"
                gutterBottom
                sx={{
                  color: ({ palette }) => palette.gray[70],
                  fontSize: 15,
                  fontWeight: 500,
                }}
              >
                <Box
                  component="span"
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    minWidth: 22,
                    marginRight: 1.25,
                    svg: {
                      color: ({ palette }) => palette.gray[70],
                      fontSize: 15,
                    },
                  }}
                >
                  {icon}
                </Box>
                {label}
              </Typography>
            </Link>
          ))}
        </Box>
      </Box>
    </Box>
  </Container>
);

const UseCases: FunctionComponent = () => (
  <Container sx={{ marginBottom: 10 }}>
    <HiddenAnchorFragmentTag id="use-cases" />
    <Typography variant="hashHeading3" gutterBottom>
      Use Cases
    </Typography>
    <Box
      display="flex"
      gap={2}
      flexWrap="wrap"
      sx={{ justifyContent: { xs: "space-between", sm: "flex-start" } }}
    >
      {useCases.map(({ id, name, icon }) =>
        id === "general" ? null : (
          /** @todo: make clickable when docs pages exist for each item */
          // <Link key={name} href={href}>
          <Box
            key={name?.toString()}
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: ({ spacing }) => ({
                xs: `calc(50% - ${spacing(1)})`,
                sm: 135,
              }),
              padding: ({ spacing }) => spacing(2, 1.5),
              borderRadius: "8px",
              borderStyle: "solid",
              borderWidth: 1,
              borderColor: ({ palette }) => palette.gray[30],
            }}
          >
            {icon}
            <Typography
              sx={{
                marginTop: 1.25,
                textAlign: "center",
                fontSize: 15,
                fontWeight: 500,
                color: ({ palette }) => palette.gray[80],
                lineHeight: 1.2,
              }}
            >
              {name}
            </Typography>
          </Box>
          // </Link>
        ),
      )}
    </Box>
  </Container>
);

const GetInvolved: FunctionComponent = () => (
  <Container sx={{ marginBottom: 10 }}>
    <HiddenAnchorFragmentTag id="get-involved" />
    <Typography variant="hashHeading3" marginBottom={5}>
      Get Involved
    </Typography>
    <Typography variant="hashHeading4" marginBottom={3}>
      <WindLightIcon
        sx={{ color: ({ palette }) => palette.teal[90], marginRight: 3 }}
      />
      Become an early adopter
    </Typography>
    {/* <Typography marginBottom={1}> */}
    {/*  <strong>Interested in using HASH?</strong> */}
    {/* </Typography> */}
    {/* <Box */}
    {/*  component="ul" */}
    {/*  sx={{ */}
    {/*    marginTop: 0, */}
    {/*    marginBottom: 2, */}
    {/*    listStyle: "none", */}
    {/*    paddingLeft: 0, */}
    {/*    "> li": { */}
    {/*      marginBottom: 0.5, */}
    {/*      svg: { */}
    {/*        position: "relative", */}
    {/*        top: 7, */}
    {/*        marginRight: 2, */}
    {/*        fontSize: 16, */}
    {/*      }, */}
    {/*    }, */}
    {/*  }} */}
    {/* > */}
    {/*  <Box component="li" display="flex"> */}
    {/*    <FaIcon name="arrow-right" type="regular" /> */}
    {/*    <Typography> */}
    {/*      <Link href="https://app.hash.ai/signup" openInNew> */}
    {/*        <strong>Create an account</strong> */}
    {/*      </Link>{" "} */}
    {/*      to try out the hosted version of HASH */}
    {/*    </Typography> */}
    {/*  </Box> */}
    {/*  <Box component="li" display="flex"> */}
    {/*    <FaIcon name="arrow-right" type="regular" /> */}
    {/*    <Typography> */}
    {/*      View the developer docs to{" "} */}
    {/*      <Link href="https://github.com/hashintel/hash" openInNew> */}
    {/*        <strong>self-host HASH</strong> */}
    {/*      </Link> */}
    {/*      . */}
    {/*    </Typography> */}
    {/*  </Box> */}
    {/* </Box> */}
    <Typography marginBottom={1}>
      <strong>Got a use case in mind?</strong>
    </Typography>
    <Typography>
      Discuss your use case by {/* , or get support by{" "} */}
      <Link href="https://hash.ai/contact" openInNew>
        <strong>contacting us</strong>
      </Link>{" "}
      or{" "}
      <Link href="https://hash.ai/discord" openInNew>
        <strong>joining the Discord community</strong>
      </Link>
      .
    </Typography>
    <Box marginTop={5} display="flex" gap={2} flexWrap="wrap">
      <Button
        variant="primarySquare"
        size="medium"
        color="purple"
        href="https://hash.ai/discord"
        startIcon={<DiscordIcon />}
        sx={{ width: { xs: "100%", sm: "auto" } }}
      >
        <Typography>Join our Discord</Typography>
      </Button>
      {/* <Button */}
      {/*  variant="primarySquare" */}
      {/*  size="medium" */}
      {/*  color="blue" */}
      {/*  href="https://app.hash.ai" */}
      {/*  startIcon={<FaIcon name="arrow-right-to-bracket" type="solid" />} */}
      {/*  sx={{ width: { xs: "100%", sm: "auto" } }} */}
      {/* > */}
      {/*  <Typography> */}
      {/*    Use at <strong>app.hash.ai</strong> */}
      {/*  </Typography> */}
      {/* </Button> */}
      <Button
        variant="primarySquare"
        size="medium"
        href="https://github.com/hashintel/hash"
        startIcon={<GithubIcon />}
        sx={{ width: { xs: "100%", sm: "auto" } }}
      >
        <Typography>View on GitHub</Typography>
      </Button>
    </Box>
  </Container>
);

const RoadmapPage: NextPageWithLayout = () => (
  <>
    <Head />
    <UseCases />
    <TechnologyTree />
    <GetInvolved />
  </>
);

RoadmapPage.getLayout = (page) => (
  <PageLayout subscribe={false} community={false}>
    {page}
  </PageLayout>
);

export default RoadmapPage;

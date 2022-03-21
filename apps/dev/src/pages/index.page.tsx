import Image from "next/image";
import {
  Box,
  Container,
  Stack,
  Typography,
  typographyClasses,
} from "@mui/material";
import type { NextPage } from "next";
import Head from "next/head";
import { ComponentProps, FC, ReactNode, VFC } from "react";
import { Button } from "../components/Button";
import { Link } from "../components/Link";

const StylishDivider: VFC<ComponentProps<typeof Stack>> = (props) => {
  const bgcolor = "orange.400";
  const size = 12;
  return (
    <Stack {...props} direction="row" alignItems="stretch" height={size}>
      <Box sx={{ width: 5 * size, bgcolor }} />
      <Box sx={{ width: 3 * size, bgcolor, opacity: 0.5 }} />
      <Box sx={{ width: 2 * size, bgcolor, opacity: 0.2 }} />
      <Box sx={{ width: size, bgcolor, opacity: 0 }} />
      <Box sx={{ width: size, bgcolor, opacity: 0.2 }} />
    </Stack>
  );
};

const Hero: VFC = () => (
  <Box
    component="header"
    py={16}
    sx={{
      position: "relative",
      "&:before": {
        content: `""`,
        display: "block",
        position: "absolute",
        top: 0,
        left: 0,
        backgroundImage: `
          linear-gradient(
            180deg,
            rgba(255, 255, 255, 0) 0%,
            rgb(255, 255, 255, 1) 90%
          ),
          linear-gradient(
            25deg,
            hsl(0deg 0% 100%) 0%,
            hsl(197deg 100% 94%) 31%,
            hsl(196deg 100% 88%) 47%,
            hsl(196deg 100% 82%) 58%,
            hsl(198deg 100% 74%) 66%,
            hsl(201deg 100% 67%) 73%,
            hsl(206deg 100% 63%) 78%,
            hsl(211deg 100% 61%) 82%,
            hsl(217deg 100% 61%) 85%,
            hsl(230deg 100% 65%) 89%,
            hsl(252deg 95% 64%) 97%
          );
        `,
        width: "100%",
        height: 400,
        zIndex: -1,
      },
    }}
  >
    <Container>
      <Box width={{ xs: 1, md: 873 }}>
        <Typography variant="hashHeading4" component="h1" mb={3}>
          HASH for Developers
        </Typography>
        <Typography
          variant="hashLargeTitle"
          component="h2"
          mb={5}
          sx={{ lineHeight: 1.1 }}
        >
          Help build the future of decision-making
        </Typography>
        <StylishDivider mb={5} />
        <Box width={{ xs: 1, md: 550 }}>
          <Typography mb={2} sx={{ lineHeight: 1.5 }}>
            {/** @todo check which font weight is the default */}
            <Link href="https://hash.ai" sx={{ fontWeight: 700 }}>
              HASH
            </Link>{" "}
            is an organization building the next generation of simulation,
            decision-making, and knowledge management tools.
          </Typography>
          <Typography sx={{ lineHeight: 1.5 }}>
            Here you’ll find resources for developers who want to use our open
            source projects and build blocks, plugins, and integrations for the
            ecosystem.
          </Typography>
        </Box>
      </Box>
    </Container>
  </Box>
);

// @todo handle this being too big at certain breakpoints
const Project: FC<{
  title: ReactNode;
  buttons: ReactNode;
  image: ReactNode;
}> = ({ buttons, children, title, image }) => {
  return (
    // @todo check this with the design
    <Stack direction={{ xs: "column", md: "row" }} spacing={{ xs: 6, lg: 9 }}>
      <Box
        sx={[
          { width: { xs: 1, md: 420 }, flexShrink: 0 },
          (theme) => ({
            [theme.breakpoints.down("md")]: { width: 1 },
            [theme.breakpoints.up("md")]: { width: 345 },
            [theme.breakpoints.up("lg")]: { width: 420 },
          }),
        ]}
      >
        <Typography
          variant="hashHeading4"
          component="h4"
          sx={{ color: "black", fontWeight: 500, mb: 2 }}
        >
          {title}
        </Typography>
        <Stack
          sx={{
            lineHeight: 1.5,
            [`& .${typographyClasses.root}`]: { lineHeight: "inherit" },
          }}
          mb={3}
          spacing={3}
        >
          {children}
        </Stack>
        {/** @todo check this spacing */}
        <Stack direction="row" spacing={1.5}>
          {buttons}
        </Stack>
      </Box>
      <Box flexShrink={0} fontSize={0}>
        {image}
      </Box>
    </Stack>
  );
};

const Projects: VFC<ComponentProps<typeof Stack>> = (props) => {
  return (
    <Container>
      <Stack
        {...props}
        component="section"
        direction={{ xs: "column", lg: "row" }}
        spacing={6}
      >
        <Stack
          spacing={4}
          sx={[
            (theme) => ({
              [theme.breakpoints.down("lg")]: { width: 1 },
              [theme.breakpoints.up("lg")]: { mb: 6, flex: 1 },
            }),
          ]}
        >
          <Typography variant="hashHeading4" component="h3">
            Our projects
          </Typography>
          <StylishDivider />
        </Stack>
        <Stack flexShrink={0}>
          <Project
            title="Block Protocol"
            buttons={
              /* @todo icon */
              <Button href="https://blockprotocol.org">
                Visit blockprotocol.org
              </Button>
            }
            image={
              /** @todo scaling, alt text */
              <Image src="/home/projects/bp.svg" width={445} height={326.26} />
            }
          >
            <Typography>
              The Block Protocol is an open-source standard and registry for
              sharing interactive blocks connected to structured data.
            </Typography>
            <Typography>
              You can build your own blocks, embed them in a website, or allow
              your users to embed blocks directly within your application.
            </Typography>
          </Project>
          <Project
            title={<Box sx={{ mt: 8 }}>HASH</Box>}
            buttons={
              <>
                {/* @todo action */}
                <Button>Download</Button>
                {/* @todo link */}
                <Button variant="secondary">Read the setup guide</Button>
              </>
            }
            image={
              /** @todo scaling, alt text */
              <Image
                src="/home/projects/hash.svg"
                width={374}
                height={465.24}
              />
            }
          >
            <Typography>
              HASH is our forthcoming open-source, all-in-one workspace platform
              built around structured data and interactive blocks. It feels like
              taking notes, but works like a powerful database.{" "}
              {/** @todo check styles */}
              <strong>
                Please note: the current version is not yet ready for use.
              </strong>
            </Typography>
            <Typography>
              Download and run it yourself, or sign up for the hosted platform
              waitlist at{" "}
              <Link href="https://hash.ai/platform/hash">
                hash.ai/platform/hash
              </Link>
            </Typography>
          </Project>
          <Project
            title="hEngine"
            buttons={
              <>
                {/* @todo action */}
                <Button>Download</Button>
                {/* @todo link */}
                <Button variant="secondary">Read the setup guide</Button>
              </>
            }
            image={
              /** @todo scaling, alt text */
              <Image
                src="/home/projects/hEngine.svg"
                width={411}
                height={374.5}
              />
            }
          >
            <Typography>
              hEngine is a simulation engine that allows you to run agent-based
              simulations using your own private and public data from HASH.
            </Typography>
            <Typography>
              The HASH all-in-one workspace will make it easy to clean,
              organise, and transform your data first.
            </Typography>
          </Project>
        </Stack>
      </Stack>
    </Container>
  );
};

const Community: VFC = () => {
  return (
    <Box
      sx={{
        // @todo check if this is correct
        pb: { xs: 10, sm: 11, md: 12 },
        pt: 2,
        minHeight: 260,
        background: `
         linear-gradient(1.3deg, #FFD79B -10.15%, rgba(255, 239, 198, 0) 66.01%)
        `,
      }}
    >
      <Container>
        {/** @todo check what styles should be in place for hashHeading4 */}
        <Typography
          variant="hashHeading4"
          sx={{ fontWeight: 600, color: "gray.90", mb: 5 }}
          align="center"
          // @todo remove need for this, check whether its right
          component="h4"
        >
          Join our community of HASH developers
        </Typography>
        {/** @todo icons, look into using Grid */}
        <Box>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            justifyContent="center"
          >
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              justifyContent="center"
            >
              <Button
                variant="primarySquare"
                size="large"
                href="https://hash.ai/discord"
              >
                Join our Discord
              </Button>
              <Button
                variant="primarySquare"
                size="large"
                href="https://github.com/hashintel/hash/issues"
              >
                Browse open issues
              </Button>
            </Stack>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              justifyContent="center"
            >
              {/** @todo where should this link to? */}
              <Button
                variant="primarySquare"
                size="large"
                href="https://github.com/hashintel/hash/stargazers"
              >
                Star us on Github
              </Button>
              <Button
                variant="primarySquare"
                size="large"
                href="https://hash.ai/contact"
              >
                Get in touch
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
};

const Home: NextPage = () => {
  return (
    <>
      <Head>
        <title>HASH</title>
      </Head>
      <Hero />
      <Projects mb={12} />
      <Community />
    </>
  );
};

export default Home;

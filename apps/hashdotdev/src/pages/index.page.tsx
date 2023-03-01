import {
  Box,
  Container,
  Stack,
  Typography,
  typographyClasses,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/system";
import type { NextPage } from "next";
import Image from "next/legacy/image";
import { ComponentProps, FunctionComponent, ReactNode } from "react";

import { Button } from "../components/button";
import { GradientContainer } from "../components/gradient-container";
import { FaIcon } from "../components/icons/fa-icon";
import { Link } from "../components/link";

const StylishDivider: FunctionComponent<
  ComponentProps<typeof Stack> & { wide?: boolean }
> = ({ wide = false, ...props }) => {
  const bgcolor = "orange.400";
  const size = 12;

  return (
    <Stack {...props} direction="row" alignItems="stretch" height={size}>
      <Box sx={{ width: 5 * size, bgcolor }} />
      <Box sx={{ width: 3 * size, bgcolor, opacity: 0.5 }} />
      <Box sx={{ width: 2 * size, bgcolor, opacity: 0.2 }} />
      {wide ? (
        <>
          <Box sx={{ width: size, bgcolor, opacity: 0 }} />
          <Box sx={{ width: size, bgcolor, opacity: 0.2 }} />
        </>
      ) : null}
    </Stack>
  );
};

const Hero: FunctionComponent = () => (
  <GradientContainer>
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
        <StylishDivider mb={5} wide />
        <Box width={{ xs: 1, md: 550 }}>
          <Typography mb={2} sx={{ lineHeight: 1.5 }}>
            <Link href="https://hash.ai/about" sx={{ fontWeight: 700 }}>
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
  </GradientContainer>
);

const Project: FunctionComponent<{
  buttons: ReactNode;
  children?: ReactNode;
  image: ReactNode;
  mobileImage: ReactNode;
  title: ReactNode;
}> = ({ buttons, children, title, image, mobileImage }) => {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("md"));

  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={{ xs: 4, md: 6, lg: 9 }}
    >
      <Box
        sx={[
          {
            width: { xs: 1, md: 420 },
            flexShrink: 0,
            [theme.breakpoints.down("md")]: { width: 1 },
            [theme.breakpoints.up("md")]: { width: 363 },
            [theme.breakpoints.up("lg")]: { width: 420 },
          },
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
        <Stack
          direction={{ xs: "column", lg: "row" }}
          alignItems="flex-start"
          spacing={1.5}
        >
          {buttons}
        </Stack>
      </Box>
      <Box flexShrink={0} fontSize={0} maxWidth={{ xs: 400, md: 1 }}>
        {mobile ? mobileImage : image}
      </Box>
    </Stack>
  );
};

const Projects: FunctionComponent<ComponentProps<typeof Stack>> = (props) => {
  return (
    <Container component="section">
      <Stack {...props} direction={{ xs: "column", lg: "row" }} spacing={6}>
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
        <Stack flexShrink={0} spacing={{ xs: 8, md: 0 }}>
          <Project
            title="Block Protocol"
            buttons={
              <Button
                href="https://blockprotocol.org"
                openInNew
                endIcon={
                  <FaIcon name="arrow-up-right-from-square" type="solid" />
                }
              >
                Visit blockprotocol.org
              </Button>
            }
            image={
              <Image
                src="/home/projects/bp.svg"
                width={445}
                height={326.26}
                alt="Blocks with pre-defined types allow you to create structured data"
              />
            }
            mobileImage={
              <Image
                layout="responsive"
                src="/home/projects/bp-mobile.svg"
                width={293}
                height={336}
                alt="Blocks with pre-defined types allow you to create structured data"
              />
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
            title={<Box sx={{ mt: { xs: 0, md: 7, lg: 8 } }}>HASH</Box>}
            buttons={
              <Button
                href="https://github.com/hashintel/hash/tree/main/apps/hash"
                openInNew
                endIcon={
                  <FaIcon name="arrow-up-right-from-square" type="solid" />
                }
              >
                Download on GitHub
              </Button>
            }
            image={
              <Image
                src="/home/projects/hash.svg"
                width={374}
                height={465.24}
                alt="Use Block Protocol blocks within the editor"
              />
            }
            mobileImage={
              <Image
                layout="responsive"
                src="/home/projects/hash-mobile.svg"
                width={288.4}
                height={279}
                alt="Use Block Protocol blocks within the editor"
              />
            }
          >
            <Typography>
              An open-source, all-in-one workspace platform built around
              structured data and interactive blocks. It feels like taking
              notes, but works like a powerful database.{" "}
            </Typography>
            <Typography>
              Join the beta at{" "}
              <Link href="https://hash.ai/platform/hash">hash.ai</Link>
            </Typography>
          </Project>
          <Project
            title={<Box sx={{ mt: { xs: 0, md: 5, lg: 8 } }}>HASH Engine</Box>}
            buttons={
              <Button
                href="https://github.com/hashintel/hash/tree/main/apps/engine"
                openInNew
                endIcon={
                  <FaIcon name="arrow-up-right-from-square" type="solid" />
                }
              >
                Download on GitHub
              </Button>
            }
            image={
              <Image
                src="/home/projects/hEngine.svg"
                width={411}
                height={374.5}
                alt="Import structured data to run simulations. Export results and insights back into HASH."
              />
            }
            mobileImage={
              <Image
                layout="responsive"
                src="/home/projects/hEngine-mobile.svg"
                width={287.07}
                height={303}
                alt="Import structured data to run simulations. Export results and insights back into HASH."
              />
            }
          >
            <Typography>
              Run agent-based simulations using your own private and public data
              from HASH.
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

const Home: NextPage = () => {
  return (
    <>
      <Hero />
      <Projects />
    </>
  );
};

export default Home;

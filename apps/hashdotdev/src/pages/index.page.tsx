import {
  faArrowRight,
  faArrowUpRightFromSquare,
} from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  Container,
  Grid,
  linkClasses,
  Stack,
  styled,
  Typography,
  typographyClasses,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/system";
import type { GetStaticProps } from "next";
import Image from "next/legacy/image";
import { ComponentProps, FunctionComponent, ReactNode } from "react";

import { Button } from "../components/button";
import { ArrowUpRightFromSquareRegularIcon } from "../components/icons/arrow-up-right-from-square-regular-icon";
import { FontAwesomeIcon } from "../components/icons/font-awesome-icon";
import { GithubIcon } from "../components/icons/github-icon";
import { Link } from "../components/link";
import { PageLayout } from "../components/page-layout";
import { Subscribe } from "../components/pre-footer";
import { getAllPages } from "../util/mdx-util";
import { NextPageWithLayout } from "../util/next-types";
import { BlogPost } from "./blog/[...blog-slug].page";
import { BlueStylishDivider } from "./blog/shared/blue-styled-divider";
import { getPhoto } from "./blog/shared/get-photo";
import {
  BlogIndividualPage,
  BlogPostsProvider,
} from "./shared/blog-posts-context";

const StylishDivider: FunctionComponent<
  ComponentProps<typeof Stack> & { wide?: boolean }
> = ({ wide = false, ...props }) => {
  const bgcolor = "teal.40";
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

const HomePageBodyTypography = styled(Typography)(({ theme }) => ({
  fontSize: 18,
  color: theme.palette.gray[90],
}));

const Hero: FunctionComponent = () => (
  <Container sx={{ marginBottom: 15 }}>
    <Box width={{ xs: 1, md: 873 }}>
      <Typography variant="hashHeading4" component="h1" mb={3}>
        Open-source
      </Typography>
      <Typography
        variant="hashLargeTitle"
        component="h2"
        mb={5}
        sx={{ lineHeight: 1.1 }}
      >
        Help build the future of decision-making
      </Typography>
      <BlueStylishDivider mb={5} />
      <Box width={{ xs: 1, md: 725 }}>
        <Typography mb={2} sx={{ lineHeight: 1.5 }}>
          We’re building two open-source platforms in parallel — the{" "}
          <strong>Block Protocol</strong> and <strong>HASH</strong> — to help
          everybody make better decisions.
        </Typography>
        <Typography sx={{ lineHeight: 1.5 }}>
          Here you’ll find information about the technical architecture of the
          projects, as well as resources to help you build{" "}
          <strong>blocks</strong>, <strong>integrations</strong>,{" "}
          <strong>apps</strong> and <strong>simulations</strong>.
        </Typography>
      </Box>
    </Box>
  </Container>
);

const Project: FunctionComponent<{
  buttons: ReactNode;
  children?: ReactNode;
  color: "purple" | "blue";
  image: ReactNode;
  mobileImage: ReactNode;
  title: ReactNode;
}> = ({ buttons, color, children, title, image, mobileImage }) => {
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
            position: "relative",
            width: { xs: 1, md: 420 },
            flexShrink: 0,
            [theme.breakpoints.down("md")]: { width: 1 },
            [theme.breakpoints.up("md")]: { width: 363 },
            [theme.breakpoints.up("lg")]: { width: 420 },
          },
        ]}
      >
        <Box
          sx={{
            position: "absolute",
            width: 40,
            height: "100%",
            background:
              color === "purple"
                ? ({ palette }) => palette.purple[60]
                : ({ palette }) => palette.blue[60],
            left: {
              lg: `calc(-1 * (((100vw - 1200px) / 2) + 253px))`,
              sm: -24,
              xs: -16,
            },
            opacity: 0.5,
            filter: "blur(100px)",
          }}
        />
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
    <Container component="section" sx={{ marginBottom: { xs: 12, md: 0 } }}>
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
            Platforms
          </Typography>
          <StylishDivider />
        </Stack>
        <Stack flexShrink={0} spacing={{ xs: 8, md: 0 }}>
          <Project
            color="purple"
            title={
              <Box display="flex" alignItems="center">
                <Image src="/home/bp-logo.svg" width={233} height={26} />
                <Box
                  sx={({ palette, spacing }) => ({
                    background: palette.purple[10],
                    color: palette.purple[60],
                    fontSize: "11px",
                    padding: spacing(0.25, 1),
                    borderRadius: 30,
                    marginLeft: 2,
                  })}
                >
                  v0.3
                </Box>
              </Box>
            }
            buttons={
              <Box>
                <Button
                  href="https://blockprotocol.org"
                  openInNew
                  color="purple"
                  endIcon={<ArrowUpRightFromSquareRegularIcon />}
                  sx={{ marginRight: 2, marginBottom: 2 }}
                >
                  Learn more
                </Button>
                <Button
                  href="https://github.com/blockprotocol/blockprotocol"
                  openInNew
                  endIcon={<GithubIcon />}
                  variant="secondary"
                  color="purple"
                  sx={{ marginBottom: 2 }}
                >
                  View on GitHub
                </Button>
              </Box>
            }
            image={
              <Image
                src="/home/projects/bp.svg"
                width={445}
                height={238}
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
            <HomePageBodyTypography>
              The Block Protocol (<strong>Þ</strong>) is an open standard for
              creating <strong>blocks</strong> which work across applications,
              without either block or app requiring any special knowledge of one
              another (only of the Þ itself).
            </HomePageBodyTypography>
            <HomePageBodyTypography
              sx={{
                [`> .${linkClasses.root}.${typographyClasses.root}`]: {
                  color: ({ palette }) => palette.purple[70],
                  borderBottom: "none",
                  "&:hover": {
                    color: ({ palette }) => palette.purple[90],
                  },
                },
              }}
            >
              Any application can integrate with the protocol’s public registry
              (
              <Link href="http://blockprotocol.com/hub">
                <Box component="strong">Þ Hub</Box>
              </Link>
              ), enabling their users to discover and insert blocks at runtime,
              expanding the utility of applications that support the protocol
              well beyond their original programming.
            </HomePageBodyTypography>
          </Project>
          <Project
            color="blue"
            title={
              <Box
                sx={{ marginTop: 8.5, display: "flex", alignItems: "center" }}
              >
                <Image src="/home/hash-logo.svg" width={121} height={26} />
                <Box
                  sx={({ palette, spacing }) => ({
                    background: palette.blue[10],
                    color: palette.blue[80],
                    fontSize: "11px",
                    padding: spacing(0.25, 1),
                    borderRadius: 30,
                    marginLeft: 2,
                    textTransform: "uppercase",
                  })}
                >
                  Alpha
                </Box>
              </Box>
            }
            buttons={
              <Box>
                <Button
                  href="https://hash.ai"
                  openInNew
                  endIcon={<FontAwesomeIcon icon={faArrowUpRightFromSquare} />}
                  color="blue"
                  sx={{ marginRight: 2, marginBottom: 2 }}
                >
                  Learn more
                </Button>
                <Button
                  href="https://github.com/hashintel/hash"
                  openInNew
                  endIcon={<GithubIcon />}
                  variant="secondary"
                  color="blue"
                  sx={{ marginBottom: 2 }}
                >
                  View on GitHub
                </Button>
              </Box>
            }
            image={
              <Box
                sx={{
                  position: "relative",
                  zIndex: 1,
                  top: {
                    md: -198,
                    lg: -144,
                  },
                  left: -5,
                }}
              >
                <Image
                  src="/home/projects/hash.svg"
                  width={448}
                  height={855}
                  alt="Use Block Protocol blocks within the editor"
                />
              </Box>
            }
            mobileImage={
              <Image
                layout="responsive"
                src="/home/projects/hash-mobile.svg"
                width={288}
                height={617}
                alt="Use Block Protocol blocks within the editor"
              />
            }
          >
            <HomePageBodyTypography>
              HASH is an open source, all-in-one platform for working with
              information, built around blocks.
            </HomePageBodyTypography>
            <Box component="ul" sx={{ "> li": { marginBottom: 0 } }}>
              <Box component="li">
                <HomePageBodyTypography>
                  Model your environment with <strong>types</strong>
                </HomePageBodyTypography>
              </Box>
              <Box component="li">
                <HomePageBodyTypography>
                  Seamlessly capture unstructured data and convert it into typed{" "}
                  <strong>entities</strong>
                </HomePageBodyTypography>
              </Box>
              <Box component="li">
                <HomePageBodyTypography>
                  Map external data to types and integrate it into one unified{" "}
                  <strong>graph</strong>
                </HomePageBodyTypography>
              </Box>
              <Box component="li">
                <HomePageBodyTypography>
                  Transform data and automate processes through{" "}
                  <strong>flows</strong>
                </HomePageBodyTypography>
              </Box>
              <Box component="li">
                <HomePageBodyTypography>
                  Combine blocks, types and flows to create{" "}
                  <strong>apps</strong>
                </HomePageBodyTypography>
              </Box>
              <Box component="li">
                <HomePageBodyTypography>
                  Use entities in <strong>simulations</strong>
                </HomePageBodyTypography>
              </Box>
            </Box>
            <HomePageBodyTypography>
              HASH is a flexible operating system built around your data, always
              up-to-date, and represented as you understand it.
            </HomePageBodyTypography>
            <HomePageBodyTypography>
              <strong>
                We’re currently helping onboard organizations interested in
                adopting HASH.
              </strong>
            </HomePageBodyTypography>
          </Project>
        </Stack>
      </Stack>
    </Container>
  );
};

const Resource: FunctionComponent<{
  title: string;
  description: string;
  color: "blue" | "teal" | "purple";
  icon?: ReactNode;
  href: string;
}> = ({ title, description, color, icon, href }) => {
  const { palette } = useTheme();
  const primaryColor =
    color === "purple"
      ? palette.purple[40]
      : color === "blue"
        ? palette.blue[50]
        : palette.teal[40];

  return (
    <Box
      sx={{
        height: "100%",
        borderStyle: "solid",
        borderWidth: 1,
        borderColor: primaryColor,
        borderRadius: 0.5,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <Box sx={{ padding: { xs: 3, md: 5 } }}>
        <Typography
          variant="h4"
          gutterBottom
          sx={{ fontSize: 28, fontWeight: 500 }}
        >
          {title}
        </Typography>
        <Typography sx={{ fontSize: 18, lineHeight: "150%" }}>
          {description}
        </Typography>
      </Box>
      <Box>
        <Box
          display="flex"
          justifyContent="space-between"
          flexDirection="row-reverse"
          sx={{ padding: { xs: 3, md: 5 }, paddingTop: 3 }}
        >
          <Link
            href={href}
            sx={{
              color:
                color === "purple"
                  ? palette.purple[70]
                  : color === "blue"
                    ? palette.blue[70]
                    : palette.teal[70],
              textTransform: "uppercase",
              fontSize: 12,
              fontWeight: 600,
              svg: {
                position: "relative",
                transition: ({ transitions }) => transitions.create("left"),
                left: 0,
              },
              "&:hover svg": {
                left: 5,
              },
            }}
          >
            Read more <FontAwesomeIcon icon={faArrowRight} />
          </Link>
          {icon}
        </Box>
        <Box display="flex" height={12}>
          <Box
            sx={{
              width: 50,
              height: "100%",
              background: primaryColor,
            }}
          />
          <Box
            sx={{
              flex: 1,
              height: "100%",
              opacity: 0.5,
              background: primaryColor,
            }}
          />
          <Box
            sx={{
              width: "50%",
              height: "100%",
              opacity: 0.2,
              background: primaryColor,
            }}
          />
        </Box>
      </Box>
    </Box>
  );
};

const _Resources: FunctionComponent = () => {
  return (
    <Container component="section">
      <Typography variant="hashHeading4" component="h3">
        Resources
      </Typography>
      <HomePageBodyTypography
        marginBottom={2}
        sx={{ color: ({ palette }) => palette.gray[70] }}
      >
        Learn by example through step-by-step guides and resources
      </HomePageBodyTypography>
      <Grid container spacing={4} marginBottom={2}>
        <Grid item xs={12} md={6} lg={4}>
          <Resource
            title="Build your own blocks"
            description="Extend the functionality of Block Protocol-based applications by creating your own blocks"
            color="purple"
            icon={<Image src="/home/bp-logo.svg" width={120} height={13} />}
            href="/"
          />
        </Grid>
        <Grid item xs={12} md={6} lg={4}>
          <Resource
            title="Code your first simulation"
            description="Learn how to develop a simulation and run it locally or in-browser"
            color="blue"
            icon={<Image src="/home/hash-logo.svg" width={65} height={14} />}
            href="/"
          />
        </Grid>
        <Grid item xs={12} md={12} lg={4}>
          <Resource
            title="Build a block-based website using HASH"
            description="Use HASH as a CMS alongside Block Protocol blocks"
            color="teal"
            href="/"
          />
        </Grid>
      </Grid>
      <Box display="flex" width="100%" flexDirection="row-reverse">
        <Link
          href="/resources"
          sx={{
            color: ({ palette }) => palette.teal[70],
            borderBottomStyle: "solid",
            borderBottomWidth: 1,
            borderBottomColor: ({ palette }) => palette.teal[40],
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          See more resources{" "}
          <FontAwesomeIcon
            icon={faArrowRight}
            sx={{ position: "relative", top: 2 }}
          />
        </Link>
      </Box>
    </Container>
  );
};

type HomePageProps = {
  posts: BlogIndividualPage[];
};

export const getStaticProps: GetStaticProps<HomePageProps> = async () => {
  // As of Jan 2022, { fallback: false } in getStaticPaths does not prevent Vercel
  // from calling getStaticProps for unknown pages. This causes 500 instead of 404:
  //
  //   Error: ENOENT: no such file or directory, open '{...}/_pages/docs/undefined'
  //
  // Using try / catch prevents 500, but we might not need them in Next v12+.
  try {
    const posts = await Promise.all(
      getAllPages<BlogPost>("blog")
        .sort((pageA, pageB) => {
          const timeA = pageB.data.date
            ? new Date(pageB.data.date).getTime()
            : 0;

          const timeB = pageA.data.date
            ? new Date(pageA.data.date).getTime()
            : 0;

          return timeA - timeB;
        })
        .map(async (page) => ({
          ...page,
          photos: {
            post: page.data.postPhoto
              ? await getPhoto(page.data.postPhoto)
              : null,
            postSquare: page.data.postPhotoSquare
              ? await getPhoto(page.data.postPhotoSquare)
              : null,
          },
        })),
    );

    return { props: { posts } };
  } catch (err) {
    // @todo better error when MDX content is broken
    return { notFound: true };
  }
};

const Home: NextPageWithLayout<HomePageProps> = ({ posts }) => {
  return (
    <BlogPostsProvider value={{ posts }}>
      <PageLayout subscribe={false} recentBlogPosts>
        <Hero />
        <Projects />
        {/* @todo: add resources pages */}
        {/* <Resources /> */}
        <Subscribe
          heading="Be the first to know..."
          body={
            <>
              We don’t mail out often, but when we do you’ll be the first to
              hear about new blog posts and big releases of HASH and the Block
              Protocol.
            </>
          }
          buttonText="Get Updated"
          sx={{
            background: "#F2F9FB",
            border: "none",
          }}
        />
      </PageLayout>
    </BlogPostsProvider>
  );
};

Home.getLayout = (page) => page;

export default Home;

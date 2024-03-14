import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import type { Theme } from "@mui/material";
import {
  Box,
  buttonClasses,
  Container,
  Divider,
  Grid,
  Stack,
  Typography,
  useMediaQuery,
} from "@mui/material";
import type { BoxProps } from "@mui/system";
import axios from "axios";
import Image from "next/image";
import { useRouter } from "next/router";
import type { FunctionComponent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { unstable_batchedUpdates } from "react-dom";

import { FRONTEND_URL } from "../config";
import type { SubscribeResponseBody } from "../pages/api/subscribe.page";
import type { BlogIndividualPage } from "../pages/shared/blog-posts-context";
import { useBlogPosts } from "../pages/shared/blog-posts-context";
import { parseNameFromFileName } from "../util/client-mdx-util";
import { Button } from "./button";
import { CommentCodeSolidIcon } from "./icons/comment-code-solid-icon";
import { DiscordIcon } from "./icons/discord-icon";
import { EnvelopeDotSolidIcon } from "./icons/envelope-dot-solid-icon";
import { EnvelopeRegularIcon } from "./icons/envelope-regular-icon";
import { FontAwesomeIcon } from "./icons/font-awesome-icon";
import { GithubIcon } from "./icons/github-icon";
import { Link } from "./link";
import { TextField } from "./text-field";

// Taken from http://emailregex.com/
const EMAIL_REGEX =
  /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

const subscribeElmId = "subscribe";

export const Subscribe: FunctionComponent<
  BoxProps & { heading?: ReactNode; body?: ReactNode; buttonText?: ReactNode }
> = ({ heading, body, buttonText, sx, ...props }) => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [userJoined, setUserJoined] = useState<boolean>(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>();

  const hashChangeHandler = useCallback((path: string) => {
    const url = new URL(path, FRONTEND_URL);

    if (url.hash === `#${subscribeElmId}`) {
      inputRef.current?.focus();
    }
  }, []);

  const pageLoadPath = useRef(router.asPath);
  const hasTriggeredPageLoadEffect = useRef(false);

  useEffect(() => {
    if (!hasTriggeredPageLoadEffect.current) {
      hasTriggeredPageLoadEffect.current = true;
      hashChangeHandler(pageLoadPath.current);
    }
  }, [hashChangeHandler]);

  useEffect(() => {
    router.events.on("hashChangeComplete", hashChangeHandler);

    return () => {
      router.events.off("hashChangeComplete", hashChangeHandler);
    };
  }, [hashChangeHandler, router]);

  return (
    <Box
      {...props}
      id={subscribeElmId}
      sx={[
        { border: "2px solid var(--teal-teal-40, #AADEE6)" },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        sx={[
          {
            py: 8,
            px: 20,
            textAlign: "center",
            ".MuiTypography-hashHeading2": {
              mb: {
                xs: 1.5,
                md: 2,
              },
            },
            ".MuiTypography-hashBodyCopy": {
              maxWidth: 683,
              mx: "auto",
              lineHeight: {
                xs: 1.4,
                md: 1.5,
              },
            },
          },
          (theme) => ({
            [theme.breakpoints.up("md")]: {
              py: 8,
              px: 20,
            },
            [theme.breakpoints.down("md")]: {
              px: 3,
              py: 4,
            },
          }),
        ]}
      >
        {userJoined ? (
          <>
            <Box
              sx={{
                color: ({ palette }) => palette.teal[50],
                fontWeight: 900,
                lineHeight: 1,
                mb: 2,
              }}
            >
              <EnvelopeDotSolidIcon sx={{ fontSize: 48 }} />
            </Box>
            <Typography
              variant="hashHeading2"
              component="h3"
              sx={{ color: ({ palette }) => palette.gray[90] }}
            >
              Success!
              <Box
                component="br"
                sx={{ display: { xs: "block", sm: "none" } }}
              />{" "}
              You’re on the list
            </Typography>
            <Typography sx={{ color: ({ palette }) => palette.gray[80] }}>
              Check your inbox for a confirmation email and click the link
              inside.
            </Typography>
          </>
        ) : (
          <>
            <Typography variant="hashHeading2" component="h3">
              {heading ?? "Get new posts in your inbox"}
            </Typography>
            <Typography mb={3}>
              {body ?? (
                <>
                  Get notified when new long-reads and articles go live. Follow
                  along as we dive deep into new tech, and share our
                  experiences. <strong>No sales stuff.</strong>
                </>
              )}
            </Typography>
            <form
              noValidate
              onSubmit={async (evt) => {
                evt.preventDefault();
                const formData = new FormData(evt.target as HTMLFormElement);
                const email = formData.get("email")! as string;

                try {
                  const isEmailValid = EMAIL_REGEX.test(email);
                  if (!isEmailValid) {
                    setError("Please enter a valid email address");
                    return;
                  }

                  unstable_batchedUpdates(() => {
                    setError(null);
                    setLoading(true);
                  });

                  const { data } = await axios.post<SubscribeResponseBody>(
                    "/api/subscribe",
                    { email },
                  );

                  unstable_batchedUpdates(() => {
                    setLoading(false);

                    if (data.response.status === "subscribed") {
                      setUserJoined(true);
                    } else if (
                      data.response.title?.includes("Invalid Resource")
                    ) {
                      setError("Are you sure? Please try a different address…");
                    } else {
                      setError("Something went wrong.️ Please try again later");
                    }
                  });
                } catch (err) {
                  // eslint-disable-next-line no-console
                  console.log(error);
                  unstable_batchedUpdates(() => {
                    setLoading(false);
                    setError("Something went wrong.️ Please try again later");
                  });
                }
              }}
            >
              <Stack
                direction={{ xs: "column", md: "row" }}
                justifyContent="center"
                alignItems="flex-start"
                spacing={{ xs: 1, md: 1.5 }}
              >
                <TextField
                  sx={{ width: { md: 459, xs: 1 }, flexShrink: 1 }}
                  name="email"
                  type="email"
                  disabled={loading}
                  placeholder="you@example.com"
                  error={error !== null}
                  helperText={error ?? undefined}
                  inputRef={inputRef}
                />
                <Button
                  variant="primary"
                  size="large"
                  type="submit"
                  loading={loading}
                  loadingText="Sending..."
                  sx={{ width: { xs: 1, md: "initial" } }}
                >
                  {buttonText ?? "Join"}
                </Button>
              </Stack>
            </form>
          </>
        )}
      </Box>
    </Box>
  );
};

const BlogPost: FunctionComponent<{
  post: BlogIndividualPage;
  displayImage?: boolean;
  direction?: "column" | "row";
  displaySubtitle?: boolean;
  authorsAfterTitle?: boolean;
  variant?: "primary" | "secondary";
}> = ({
  variant = "secondary",
  direction = "row",
  post,
  displayImage = true,
  displaySubtitle = true,
  authorsAfterTitle = false,
}) => {
  const { fileName, photos, data } = post;

  const authors = (
    <Typography
      gutterBottom
      sx={{
        color: ({ palette }) => palette.teal[60],
        textTransform: "uppercase",
        fontWeight: 600,
        fontSize: 12,
      }}
    >
      {data.authors
        .map(({ name }, i, all) =>
          all.length - 1 === i
            ? name
            : all.length - 2 === i
              ? `${name} & `
              : `${name}, `,
        )
        .join("")}
    </Typography>
  );

  return (
    <Link
      href={{
        pathname: "/blog/[...blog-slug]",
        query: { "blog-slug": parseNameFromFileName(fileName) },
      }}
      sx={{
        ".title": {
          transition: ({ transitions }) => transitions.create("color"),
        },
        "&:hover .title": {
          color: ({ palette }) => palette.teal[60],
        },
      }}
    >
      <Box>
        <Grid container spacing={3}>
          {displayImage ? (
            <Grid item xs={direction === "row" ? 6 : 12} minHeight={180}>
              <Box
                sx={{
                  position: "relative",
                  width: "100%",
                  paddingBottom: "66.66%",
                  borderRadius: "4px",
                  overflow: "hidden",
                }}
              >
                <Image
                  alt={data.title}
                  src={photos.post!.src}
                  fill
                  style={{ objectFit: "cover" }}
                />
              </Box>
            </Grid>
          ) : null}
          <Grid
            item
            xs={displayImage && direction === "row" ? 6 : 12}
            sx={{
              display: "flex",
              flexDirection: "column",
              justifyContent: direction === "row" ? "center" : "flex-start",
            }}
          >
            {authorsAfterTitle ? null : authors}
            <Typography
              component="h4"
              variant={variant === "primary" ? "h5" : "h6"}
              className="title"
              gutterBottom
              sx={{
                color: ({ palette }) => palette.gray[90],
                fontWeight: 500,
                lineHeight: "120%",
              }}
            >
              {data.title}
            </Typography>
            {authorsAfterTitle ? authors : null}
            {displaySubtitle ? (
              <Typography
                sx={{
                  color: ({ palette }) => palette.gray[70],
                  fontSize: variant === "primary" ? 18 : 15,
                  lineHeight: "150%",
                }}
              >
                {data.subtitle}
              </Typography>
            ) : null}
          </Grid>
        </Grid>
      </Box>
    </Link>
  );
};

const RecentBlogPosts: FunctionComponent = () => {
  const { posts } = useBlogPosts();

  const primaryPost = posts[0]!;
  const secondaryPost = posts[1]!;
  const tertiaryPost = posts[2]!;
  const quaternaryPost = posts[3]!;

  const xs = useMediaQuery<Theme>((theme) => theme.breakpoints.only("xs"));

  return (
    <Container>
      <Typography variant="hashHeading4" component="h3" gutterBottom>
        Recent blog posts
      </Typography>
      <Typography
        marginBottom={3}
        sx={{ fontSize: 18, color: ({ palette }) => palette.gray[70] }}
      >
        News, stories and guides from the community
      </Typography>
      <Grid container columnSpacing={6}>
        <Grid item xs={12} md={8}>
          <BlogPost
            variant="primary"
            direction={xs ? "column" : "row"}
            post={primaryPost}
          />
          <Divider sx={{ my: 3 }} />
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6} md={12}>
              <Grid container spacing={3}>
                <Grid
                  item
                  xs={12}
                  sx={{ display: { sx: "block", sm: "none" } }}
                >
                  <BlogPost post={secondaryPost} direction="column" />
                  <Divider sx={{ mt: 3 }} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <BlogPost
                    post={tertiaryPost}
                    displayImage={false}
                    displaySubtitle={!xs}
                    authorsAfterTitle={xs}
                  />
                  {xs ? <Divider sx={{ mt: 3 }} /> : null}
                </Grid>
                <Grid item xs={12} md={6}>
                  <BlogPost
                    post={quaternaryPost}
                    displayImage={false}
                    displaySubtitle={!xs}
                    authorsAfterTitle={xs}
                  />
                </Grid>
              </Grid>
            </Grid>
            <Grid
              item
              xs={6}
              sx={{ display: { xs: "none", sm: "block", md: "none" } }}
            >
              <BlogPost post={secondaryPost} direction="column" />
            </Grid>
          </Grid>
        </Grid>
        <Grid item md={4} sx={{ display: { xs: "none", md: "block" } }}>
          <BlogPost post={secondaryPost} direction="column" />
        </Grid>
      </Grid>
      <Box
        sx={{ marginTop: { xs: 3, md: 6 } }}
        display="flex"
        justifyContent="flex-end"
      >
        <Link
          href="/blog"
          sx={{
            color: ({ palette }) => palette.teal[70],
            borderBottomStyle: "solid",
            borderBottomWidth: 1,
            borderBottomColor: ({ palette }) => palette.teal[40],
            fontSize: 15,
            fontWeight: 600,
            opacity: 1,
            transition: ({ transitions }) => transitions.create("opacity"),
            "&:hover": {
              opacity: 0.8,
            },
          }}
        >
          View all blog posts{" "}
          <FontAwesomeIcon
            sx={{ position: "relative", top: 2 }}
            icon={faArrowRight}
          />
        </Link>
      </Box>
    </Container>
  );
};

const Community: FunctionComponent = () => {
  return (
    <Box
      sx={{
        pb: { xs: 10, sm: 11, md: 12 },
        pt: 2,
        minHeight: 260,
        background: `
         linear-gradient(1.3deg,  rgba(237,252,255,1) -10.15%, rgba(255, 239, 198, 0) 66.01%)
        `,
      }}
      component="section"
    >
      <Container>
        <Typography
          variant="hashHeading4"
          sx={{ fontWeight: 600, color: "gray.90", mb: { xs: 4, sm: 5 } }}
          align="center"
        >
          Join our community of HASH developers
        </Typography>
        <Box>
          <Stack
            direction={{ xs: "column", lg: "row" }}
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
                color="purple"
                href="https://hash.ai/discord"
                startIcon={<DiscordIcon />}
                sx={{
                  [`.${buttonClasses.startIcon}>*:nth-of-type(1)`]: {
                    fontSize: 28,
                  },
                }}
              >
                Join our Discord
              </Button>
              <Button
                variant="primarySquare"
                size="large"
                color="blue"
                href="https://github.com/hashintel/hash/issues"
                startIcon={<CommentCodeSolidIcon />}
              >
                Browse open issues
              </Button>
            </Stack>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              justifyContent="center"
            >
              <Button
                variant="primarySquare"
                size="large"
                href="https://github.com/hashintel/hash"
                startIcon={<GithubIcon />}
              >
                Star us on GitHub
              </Button>
              <Button
                variant="primarySquare"
                size="large"
                color="green"
                href="https://hash.ai/contact"
                startIcon={<EnvelopeRegularIcon />}
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

export const PreFooter: FunctionComponent<{
  subscribe: boolean;
  recentBlogPosts: boolean;
  community: boolean;
}> = ({ subscribe, recentBlogPosts, community }) => (
  <>
    {subscribe ? (
      <Container component="section" sx={{ mb: 12, mt: 12 }}>
        <Subscribe />
      </Container>
    ) : null}
    {recentBlogPosts ? (
      <Box component="section" sx={{ mb: 12 }}>
        <RecentBlogPosts />
      </Box>
    ) : null}
    {community ? <Community /> : null}
  </>
);

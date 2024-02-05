import { faLink } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  styled,
  Tooltip,
  Typography,
  TypographyProps,
} from "@mui/material";
import dynamic from "next/dynamic";
import {
  ComponentType,
  FunctionComponent,
  HTMLAttributes,
  HTMLProps,
} from "react";
import slugify from "slugify";

import { FontAwesomeIcon } from "../components/icons/font-awesome-icon";
import { ImageWithText } from "../components/image-with-text";
import { Link } from "../components/link";
import { Check } from "../components/mdx/check";
import { Embed } from "../components/mdx/embed";
import { Hint } from "../components/mdx/hint";
import { InfoCard } from "../components/mdx/info-card";
import { InfoCardWrapper } from "../components/mdx/info-card-wrapper";
import { Math } from "../components/mdx/math";
import { usePageHeading } from "../components/mdx/shared/use-page-heading";
import { stringifyChildren } from "../components/mdx/shared/util";
import { Tab, Tabs, TextTab, TextTabs } from "../components/mdx/tabs";
import { MdxCallout } from "../components/mdx-callout";
import { MdxImage } from "../components/mdx-image";
import { MdxPre } from "../components/mdx-pre";
import { MdxTalkSlide } from "../components/mdx-talk-slide";
import { MdxVideo } from "../components/mdx-video";

const CalculationBlock = dynamic<Record<string, never>>(
  () =>
    import("../components/calculation-block").then(
      (module) => module.CalculationBlock,
    ),
  { ssr: false },
);

const Heading = styled(Typography)(({ theme }) => ({
  "svg.link-icon": {
    transition: theme.transitions.create("opacity"),
    opacity: 0,
  },
  ":hover, a:focus-visible": {
    "svg.link-icon": {
      opacity: 1,
    },
  },
  "@media (hover: none)": {
    "svg.link-icon": {
      opacity: 1,
    },
  },
}));

const HeadingAnchor: FunctionComponent<{
  anchor: string;
  depth: 1 | 2 | 3 | 4 | 5;
}> = ({ depth, anchor }) => {
  const size = depth === 1 ? 28 : depth === 2 ? 24 : depth === 3 ? 20 : 16;
  const urlToCopy =
    typeof window !== "undefined"
      ? `${window.location.href.split("#").splice(0, 1).join()}#${anchor}`
      : "";

  return (
    <Tooltip title="Copy link to this section">
      <Link
        href={`#${anchor}`}
        onClick={() => navigator.clipboard.writeText(urlToCopy)}
        sx={{
          display: "inline-block",
          position: "absolute",
          marginTop: "0.3em",
          marginLeft: 2,
          height: size,
          width: size,
        }}
      >
        <FontAwesomeIcon
          icon={faLink}
          className="link-icon"
          sx={{
            fontSize: size,
            position: "absolute",
            lineHeight: size,
          }}
        />
      </Link>
    </Tooltip>
  );
};

const HEADING_MARGIN_TOP = {
  H1: 8,
  H2: 8,
  H3: 6,
  H4: 6,
  H5: 6,
  H6: 6,
};
const HEADING_MARGIN_BOTTOM = 2;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mdxComponents: Record<string, ComponentType<any>> = {
  Box,
  Typography,
  p: (props: TypographyProps<"p">) => (
    <Typography mb={2} variant="hashBodyCopy" {...props} />
  ),
  li: (props: HTMLAttributes<HTMLLIElement>) => (
    <Box {...props} component="li">
      <Typography variant="hashBodyCopy" component="div">
        {props.children}
      </Typography>
    </Box>
  ),
  a: (props: HTMLProps<HTMLAnchorElement>) => {
    const { href, ref: _ref, ...rest } = props;
    return href ? (
      <Link {...rest} href={href.replace("https://hash.dev", "")} />
    ) : (
      // eslint-disable-next-line jsx-a11y/anchor-has-content -- special case for creating bookmarks (for cross-linking)
      <a id={props.id} />
    );
  },
  h1: (props: TypographyProps<"h1">) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { headingRef } = usePageHeading({ anchor: "" });
    return (
      <Heading
        ref={headingRef}
        mt={HEADING_MARGIN_TOP.H1}
        mb={HEADING_MARGIN_BOTTOM}
        variant="hashHeading1"
        {...props}
      >
        {props.children}
        <HeadingAnchor anchor="" depth={1} />
      </Heading>
    );
  },
  h2: (props: TypographyProps<"h2">) => {
    const anchor = slugify(stringifyChildren(props.children)).toLowerCase();

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { headingRef } = usePageHeading({ anchor });

    return (
      <Heading
        ref={headingRef}
        mt={HEADING_MARGIN_TOP.H2}
        mb={HEADING_MARGIN_BOTTOM}
        variant="hashHeading2"
        {...props}
      >
        {props.children}
        <HeadingAnchor anchor={anchor} depth={2} />
      </Heading>
    );
  },
  h3: (props: TypographyProps<"h3">) => {
    const anchor = slugify(stringifyChildren(props.children)).toLowerCase();

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { headingRef } = usePageHeading({ anchor });

    return (
      <Heading
        ref={headingRef}
        mt={HEADING_MARGIN_TOP.H3}
        mb={HEADING_MARGIN_BOTTOM}
        variant="hashHeading3"
        {...props}
      >
        {props.children}
        <HeadingAnchor anchor={anchor} depth={3} />
      </Heading>
    );
  },
  h4: (props: TypographyProps<"h4">) => {
    return (
      <Heading
        mt={HEADING_MARGIN_TOP.H4}
        mb={HEADING_MARGIN_BOTTOM}
        variant="hashHeading4"
        {...props}
      />
    );
  },
  h5: (props: TypographyProps<"h5">) => {
    return (
      <Heading
        mt={HEADING_MARGIN_TOP.H5}
        mb={HEADING_MARGIN_BOTTOM}
        variant="hashHeading5"
        {...props}
      />
    );
  },

  blockquote: (props: HTMLAttributes<HTMLElement>) => (
    <MdxCallout hideIcon {...props} />
  ),

  code: (props: HTMLAttributes<HTMLElement>) => (
    <Typography variant="hashCode" {...props} />
  ),

  CalculationBlock,

  Callout: MdxCallout,

  pre: MdxPre,

  img: MdxImage,

  video: MdxVideo,

  ImageWithText,

  TalkSlide: MdxTalkSlide,

  InfoCard,

  InfoCardWrapper,

  Hint,

  Tab,

  Tabs,

  TextTab,

  TextTabs,

  Math,

  Embed,

  Check,
};

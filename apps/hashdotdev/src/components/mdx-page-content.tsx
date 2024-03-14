import type { BoxProps } from "@mui/material";
import { Box } from "@mui/material";
import { useRouter } from "next/router";
import type { MDXRemoteSerializeResult } from "next-mdx-remote";
import { MDXRemote } from "next-mdx-remote";
import type { FunctionComponent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { mdxComponents } from "../util/mdx-components";
import type { Heading } from "./context/page-headings-context";
import { PageHeadingsContext } from "./context/page-headings-context";

type MdxPageContentProps = {
  paragraphMaxWidth?: number;
  serializedPage: MDXRemoteSerializeResult<Record<string, unknown>>;
  wrapperSx?: BoxProps["sx"];
};

export const MdxPageContent: FunctionComponent<MdxPageContentProps> = ({
  paragraphMaxWidth,
  serializedPage,
  wrapperSx,
}) => {
  const router = useRouter();

  const [headings, setHeadings] = useState<Heading[]>([]);

  const currentHeading = useRef<Heading | undefined>(undefined);

  const headingsRef = useRef<Heading[]>([]);

  useEffect(() => {
    setHeadings([]);

    return () => {
      currentHeading.current = undefined;
      setHeadings([]);
    };
  }, [serializedPage]);

  const scrolledOnce = useRef(false);

  useEffect(() => {
    if (headings.length) {
      const anchor = router.asPath.match(/(?:#)(.*?)(?:\?|$)/)?.[1] ?? "";

      const headingWithCurrentAnchor = headings.find(
        (heading) => heading.anchor === anchor,
      );

      const shouldScrollToAnchor =
        // if anchor is empty and we haven't scrolled, prevent it
        (anchor === "" && scrolledOnce.current) ||
        // if anchor is not empty, always allow scroll
        anchor !== "";

      if (!scrolledOnce.current) {
        scrolledOnce.current = true;
      }

      if (anchor === "" && shouldScrollToAnchor) {
        currentHeading.current = headings[0]!;

        window.scrollTo({
          top: 0,
        });
      } else if (
        headingWithCurrentAnchor &&
        shouldScrollToAnchor &&
        (!currentHeading.current ||
          headingWithCurrentAnchor.element !==
            currentHeading.current.element) &&
        document.body.contains(headingWithCurrentAnchor.element)
      ) {
        currentHeading.current = headingWithCurrentAnchor;

        const { y: yPosition } =
          headingWithCurrentAnchor.element.getBoundingClientRect();

        window.scrollTo({
          top: yPosition + window.scrollY - 100,
        });
      }
    }
  }, [headings, router.asPath]);

  useEffect(() => {
    headingsRef.current = headings;
  }, [headings]);

  const contextValue = useMemo(
    () => ({
      headings,
      setHeadings,
    }),
    [headings],
  );

  return (
    <PageHeadingsContext.Provider value={contextValue}>
      <Box
        sx={[
          {
            "& > :not(.info-card-wrapper), > a:not(.info-card-wrapper) > *": {
              width: {
                xs: "100%",
                sm: paragraphMaxWidth,
              },
            },
          },
          ...(Array.isArray(wrapperSx) ? wrapperSx : [wrapperSx]),
        ]}
      >
        {/* @ts-expect-error @todo fix this */}
        <MDXRemote {...serializedPage} components={mdxComponents} />
      </Box>
    </PageHeadingsContext.Provider>
  );
};

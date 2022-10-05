// @todo update from blockprotocol
import { Box } from "@mui/material";
import { MDXRemote, MDXRemoteSerializeResult } from "next-mdx-remote";
import { FunctionComponent } from "react";
import { mdxComponents } from "../util/mdxComponents";

type MdxPageContentProps = {
  serializedPage: MDXRemoteSerializeResult<Record<string, unknown>>;
};

export const MdxPageContent: FunctionComponent<MdxPageContentProps> = ({
  serializedPage,
}) => {
  return (
    <Box
      sx={{
        /** Headers that come after headers shouldn't have a top margin */
        [`& ${[
          ".MuiTypography-hashHeading2 + .MuiTypography-hashHeading3",
          ".MuiTypography-hashHeading2 + .MuiTypography-hashHeading4",
          ".MuiTypography-hashHeading2 + .MuiTypography-hashHeading5",
          ".MuiTypography-hashHeading3 + .MuiTypography-hashHeading4",
          ".MuiTypography-hashHeading3 + .MuiTypography-hashHeading5",
          ".MuiTypography-hashHeading4 + .MuiTypography-hashHeading5",
        ]}`]: {
          marginTop: 0,
        },
        "& > h1:first-of-type": {
          marginTop: 0,
        },
      }}
    >
      {/* @ts-expect-error @todo fix this */}
      <MDXRemote {...serializedPage} components={mdxComponents} />
    </Box>
  );
};

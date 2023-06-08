import { useQuery } from "@apollo/client";
import { faFile } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { getPageInfoQuery } from "@local/hash-graphql-shared/queries/page.queries";
import { EntityId } from "@local/hash-subgraph";
import { Box, BoxProps } from "@mui/material";

import {
  GetPageInfoQuery,
  GetPageInfoQueryVariables,
} from "../graphql/api-types.gen";

export type SizeVariant = "small" | "medium";

export const pageIconVariantSizes: Record<
  SizeVariant,
  { container: number; font: number }
> = {
  small: { container: 20, font: 14 },
  medium: { container: 44, font: 36 },
};

interface PageIconProps {
  entityId: EntityId;
  size?: SizeVariant;
  sx?: BoxProps["sx"];
}

export const PageIcon = ({
  entityId,
  size = "medium",
  sx = [],
}: PageIconProps) => {
  const { data } = useQuery<GetPageInfoQuery, GetPageInfoQueryVariables>(
    getPageInfoQuery,
    {
      variables: { entityId },
    },
  );

  const sizes = pageIconVariantSizes[size];

  return (
    <Box
      sx={[
        {
          width: sizes.container,
          height: sizes.container,
          fontSize: sizes.font,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {data?.page.icon ?? (
        <FontAwesomeIcon
          icon={faFile}
          sx={(theme) => ({
            fontSize: `${sizes.font}px !important`,
            color: theme.palette.gray[40],
          })}
        />
      )}
    </Box>
  );
};

import { useQuery } from "@apollo/client";
import { faFile } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system";
import { getPageInfoQuery } from "@hashintel/hash-shared/queries/page.queries";
import { Box } from "@mui/material";
import {
  GetPageInfoQuery,
  GetPageInfoQueryVariables,
} from "../graphql/apiTypes.gen";

export type SizeVariant = "small" | "medium";

export const pageIconVariantSizes: Record<
  SizeVariant,
  { container: number; font: number }
> = {
  small: { container: 20, font: 14 },
  medium: { container: 44, font: 36 },
};

interface PageIconProps {
  ownedById: string;
  entityId: string;
  versionId?: string;
  size?: SizeVariant;
}

export const PageIcon = ({
  ownedById,
  entityId,
  versionId,
  size = "medium",
}: PageIconProps) => {
  const { data } = useQuery<GetPageInfoQuery, GetPageInfoQueryVariables>(
    getPageInfoQuery,
    {
      variables: { ownedById, entityId, entityVersion: versionId },
    },
  );

  const sizes = pageIconVariantSizes[size];

  return (
    <Box
      sx={{
        width: sizes.container,
        height: sizes.container,
        fontSize: sizes.font,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {data?.persistedPage?.icon || (
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

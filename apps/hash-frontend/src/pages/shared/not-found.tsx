import {
  ArrowRightRegularIcon,
  ArrowUpRightRegularIcon,
  UserPlusRegularIcon,
} from "@hashintel/design-system";
import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

import { HEADER_HEIGHT } from "../../shared/layout/layout-with-header/page-header";
import { Button } from "../../shared/ui/button";
import { useAuthInfo } from "./auth-info-context";

const GoBackButton = () => {
  return (
    <Button
      onClick={() => window.history.back()}
      size="small"
      sx={{
        borderRadius: 2,
        boxShadow: ({ boxShadows }) => boxShadows.md,
        fontWeight: 600,
      }}
      variant="tertiary_quiet"
    >
      Go back
      <ArrowRightRegularIcon
        sx={{
          fill: ({ palette }) => palette.blue[70],
          fontSize: 14,
          ml: 1.5,
        }}
      />
    </Button>
  );
};

export const NotFound = ({
  additionalText,
  resourceLabel = { label: "page", withArticle: "a page" },
}: {
  additionalText?: ReactNode;
  resourceLabel?: {
    label: string;
    withArticle?: string;
  };
}) => {
  const { authenticatedUser } = useAuthInfo();

  return (
    <Stack
      sx={{
        position: "absolute",
        top: HEADER_HEIGHT,
        left: 0,
        height: "100%",
        width: "100%",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Stack sx={{ maxWidth: { xs: "90%", md: 500 }, mb: "60px" }}>
        <Typography component="p" variant="h4" sx={{ fontWeight: 400, mb: 2 }}>
          This {resourceLabel.label} may not exist,{" "}
          <Box
            component="span"
            sx={{
              color: ({ palette }) => palette.gray[70],
              fontStyle: "italic",
            }}
          >
            or
          </Box>
          <br />
          you may not have permission to view it
        </Typography>
        {authenticatedUser ? (
          <Box>
            <Typography
              variant="regularTextParagraphs"
              sx={{ color: ({ palette }) => palette.gray[80] }}
            >
              If you believe you should be able to see{" "}
              {resourceLabel.withArticle} here, try contacting its owner. You
              are logged in as{" "}
              <strong>{authenticatedUser.emails[0]?.address}</strong>
            </Typography>
            {additionalText && (
              <Typography
                component="p"
                variant="regularTextParagraphs"
                sx={{ color: ({ palette }) => palette.gray[80], mt: 2 }}
              >
                {additionalText}
              </Typography>
            )}
            <Box mt={5}>
              <GoBackButton />
            </Box>
          </Box>
        ) : (
          <Box>
            <Typography
              variant="regularTextParagraphs"
              sx={{ color: ({ palette }) => palette.gray[80] }}
            >
              <strong>You are not currently logged in.</strong> If you believe
              you should be able to see a page here, create an account or sign
              in.
            </Typography>
            <Stack direction="row" gap={1.5} mt={5}>
              <Button
                href="/signup"
                size="small"
                sx={{
                  borderRadius: 2,
                  fontWeight: 600,
                }}
              >
                Create an account
                <UserPlusRegularIcon
                  sx={{
                    ml: 1.5,
                    fontSize: 18,
                    fill: ({ palette }) => palette.blue[40],
                  }}
                />
              </Button>
              <Button
                href="/signin"
                size="small"
                sx={{
                  borderRadius: 2,
                  boxShadow: ({ boxShadows }) => boxShadows.md,
                  fontWeight: 600,
                  background: ({ palette }) => palette.common.black,
                  color: ({ palette }) => palette.common.white,
                  "&:hover": {
                    background: ({ palette }) => palette.gray[80],
                    color: ({ palette }) => palette.common.white,
                  },
                }}
                variant="tertiary_quiet"
              >
                Sign in
                <ArrowUpRightRegularIcon
                  sx={{
                    fill: ({ palette }) => palette.gray[50],
                    fontSize: 14,
                    ml: 1.5,
                  }}
                />
              </Button>
              <GoBackButton />
            </Stack>
          </Box>
        )}
      </Stack>
    </Stack>
  );
};

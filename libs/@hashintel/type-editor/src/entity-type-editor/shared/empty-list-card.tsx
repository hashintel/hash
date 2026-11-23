import { Box, Stack, Typography, typographyClasses } from "@mui/material";

import {
  HashInlineIcon,
  hashSvgIconClasses,
  WhiteCard,
} from "@hashintel/design-system";

import type { CardActionAreaProps } from "@mui/material";
import type { ReactNode } from "react";

const faPlus = { icon: "plus" } as const;

type EmptyListCardProps = Pick<CardActionAreaProps, "onClick"> & {
  icon: ReactNode;
  headline: ReactNode;
  description: ReactNode;
  subDescription: ReactNode;
};

export const EmptyListCard = ({
  onClick,
  icon,
  headline,
  description,
  subDescription,
}: EmptyListCardProps) => (
  <WhiteCard
    onClick={onClick}
    actionSx={(theme) => ({
      "&:hover": onClick
        ? {
            [`.EmptyListCard-icon, .${typographyClasses.body1}`]: {
              color: theme.palette.blue[70],
            },
          }
        : {},
    })}
  >
    <Stack
      direction="row"
      alignItems="center"
      sx={{
        px: 5,
        py: 4,
      }}
    >
      <Box
        sx={{
          fontSize: 20,
          [`.${hashSvgIconClasses.icon}`]: { fontSize: "inherit" },
        }}
        className="EmptyListCard-icon"
      >
        {icon}
      </Box>
      <Box ml={5}>
        <Typography sx={{ display: "flex", alignItems: "center", mb: 0.75 }}>
          <Box component="span" mr={1} fontWeight={500}>
            {headline}
          </Box>
          {onClick ? <HashInlineIcon icon={faPlus} /> : null}
        </Typography>
        <Typography
          variant="microText"
          component="p"
          sx={(theme) => ({ color: theme.palette.gray[90] })}
        >
          {description}
        </Typography>
        <Typography
          variant="microText"
          component="p"
          sx={(theme) => ({ color: theme.palette.gray[60] })}
        >
          {subDescription}
        </Typography>
      </Box>
    </Stack>
  </WhiteCard>
);

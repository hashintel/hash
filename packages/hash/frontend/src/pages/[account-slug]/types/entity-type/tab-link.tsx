import { Box, Stack, Tab, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { FunctionComponent } from "react";

export type TabLinkProps = {
  label: string;
  value: string;
  count?: number;
  active?: boolean;
};

export const TabLink: FunctionComponent<TabLinkProps> = ({
  label,
  value,
  count,
  active,
  ...props
}) => {
  const router = useRouter();

  return (
    <Tab
      {...props}
      value={value}
      href={value}
      component="a"
      onClick={(event: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
        event.preventDefault();
        void router.push(value, undefined, { shallow: true });
      }}
      label={
        <Stack direction="row">
          <Typography
            variant="smallTextLabels"
            fontWeight={500}
            sx={{
              paddingY: 0.25,
            }}
          >
            {label}
          </Typography>
        </Stack>
      }
      icon={
        count ? (
          <Box
            sx={({ palette }) => ({
              display: "flex",
              paddingX: 1,
              paddingY: 0.25,
              borderRadius: 30,
              background: active ? palette.blue[20] : palette.gray[20],
            })}
          >
            <Typography
              variant="microText"
              sx={({ palette }) => ({
                fontWeight: 500,
                color: active ? palette.primary.main : palette.gray[80],
              })}
            >
              {count}
            </Typography>
          </Box>
        ) : undefined
      }
      iconPosition="end"
      sx={{
        marginRight: 3,
        paddingY: 1.25,
        paddingX: 0.5,
        minWidth: 0,
        minHeight: 0,
      }}
    />
  );
};

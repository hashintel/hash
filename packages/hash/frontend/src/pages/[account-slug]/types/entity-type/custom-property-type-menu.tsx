import { faClose } from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  Chip,
  FontAwesomeIcon,
  IconButton,
} from "@hashintel/hash-design-system";
import { Box, Stack, Typography } from "@mui/material";
import { FunctionComponent } from "react";

type PropertyTypeCustomMenuProps = {
  closeMenu: () => void;
};

export const PropertyTypeCustomMenu: FunctionComponent<
  PropertyTypeCustomMenuProps
> = ({ closeMenu }) => {
  return (
    <Box>
      <Stack
        sx={({ palette }) => ({
          background: palette.gray[10],
          border: `1px solid ${palette.gray[30]}`,
          borderTopRightRadius: 4,
          borderTopLeftRadius: 4,
          paddingX: 2.75,
          paddingY: 2,
        })}
      >
        <Typography
          variant="smallCaps"
          sx={{ color: ({ palette }) => palette.gray[70] }}
        >
          Specify a custom expected value
        </Typography>
        <Typography
          variant="smallTextLabels"
          sx={{ paddingTop: 1.25, color: ({ palette }) => palette.gray[70] }}
        >
          Advanced users can specify property objects as well as arrays of data
          types and/or property objects as expected values.
        </Typography>
        <Button
          onClick={closeMenu}
          sx={{ position: "absolute", top: 0, right: 0 }}
          endIcon={<FontAwesomeIcon icon={faClose} />}
          variant="tertiary_quiet"
        >
          CANCEL
        </Button>
      </Stack>

      <Stack
        gap={3}
        sx={({ palette }) => ({
          paddingY: 2.25,
          paddingX: 1.5,
          background: palette.gray[20],
          border: `1px solid ${palette.gray[30]}`,
          borderBottomRightRadius: 4,
          borderBottomLeftRadius: 4,
        })}
      >
        <Stack direction="row" gap={1.75}>
          <Button>CONTAINS</Button>
          <Stack>
            <Typography>Create a property object</Typography>
            <Chip color="purple" label="PROPERTY TYPES" />
          </Stack>
        </Stack>

        <Stack direction="row" gap={1.75}>
          <Button>ALLOWS COMBINING</Button>
          <Stack>
            <Typography>ALLOWS COMBINING</Typography>
            <Stack direction="row" gap={1}>
              <Chip color="purple" label="PROPERTY OBJECTS" />
              <Chip color="blue" label="DATA TYPES" />
              <Chip color="navy" label="ARRAY" />
            </Stack>
          </Stack>
        </Stack>
      </Stack>
    </Box>
  );
};

import { Box, Chip, Stack } from "@mui/material";

export const Chips = () => {
  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} mb={2}>
        <Chip size="xs" label="Chip" />
        <Chip size="small" label="Chip" />
        <Chip size="large" label="Chip" />
      </Stack>
      <Stack direction="row" alignItems="center" spacing={2} mb={2}>
        <Chip color="gray" label="Chip" />
        <Chip color="red" label="Chip" />
        <Chip color="blue" label="Chip" />
        <Chip color="orange" label="Chip" />
        <Chip color="purple" label="Chip" />
        <Chip color="green" label="Chip" />
        <Chip color="yellow" label="Chip" />
        <Chip color="pink" label="Chip" />
        <Chip color="teal" label="Chip" />
        <Chip color="mint" label="Chip" />
        <Chip color="navy" label="Chip" />
      </Stack>
      <Stack direction="row" alignItems="center" spacing={2} mb={2}>
        <Chip color="gray" label="Chip" variant="outlined" />
        <Chip color="red" label="Chip" variant="outlined" />
        <Chip color="blue" label="Chip" variant="outlined" />
        <Chip color="orange" label="Chip" variant="outlined" />
        <Chip color="purple" label="Chip" variant="outlined" />
        <Chip color="green" label="Chip" variant="outlined" />
        <Chip color="yellow" label="Chip" variant="outlined" />
        <Chip color="pink" label="Chip" variant="outlined" />
        <Chip color="teal" label="Chip" variant="outlined" />
        <Chip color="mint" label="Chip" variant="outlined" />
        <Chip color="navy" label="Chip" variant="outlined" />
      </Stack>
    </Box>
  );
};

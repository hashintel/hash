import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { Box, Stack, Chip } from "@mui/material";
import { FontAwesomeIcon } from "../../shared/icons";
import { ChipGroup } from "../../shared/ui";

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
        <Chip
          size="xs"
          color="gray"
          label="Chip"
          onDelete={() => alert("Delete clicked")}
        />
        <Chip size="small" color="red" label="Chip" onDelete={() => {}} />
        <Chip size="large" color="blue" label="Chip" onDelete={() => {}} />
      </Stack>
      <Stack direction="row" alignItems="center" spacing={2} mb={2}>
        <Chip
          size="xs"
          color="gray"
          label="Chip"
          icon={<FontAwesomeIcon icon={faPlus} />}
        />
        <Chip
          size="small"
          color="red"
          label="Chip"
          icon={<FontAwesomeIcon icon={faPlus} />}
        />
        <Chip
          size="large"
          color="blue"
          label="Chip"
          icon={<FontAwesomeIcon icon={faPlus} />}
        />
      </Stack>

      <Stack direction="row" alignItems="center" spacing={2} mb={2}>
        <ChipGroup>
          <Chip color="blue" label="Compound" />
          <Chip color="orange" label="Chip" />
        </ChipGroup>
        <ChipGroup>
          <Chip color="green" label="Number" />
          <Chip color="green" label="1-1000" />
        </ChipGroup>
        <ChipGroup>
          <Chip color="purple" label="Text" />
          <Chip color="purple" label="0-120ch" />
          <Chip label="Multiple" />
        </ChipGroup>
        <ChipGroup>
          <Chip color="orange" label="Chip" />
        </ChipGroup>
      </Stack>
    </Box>
  );
};

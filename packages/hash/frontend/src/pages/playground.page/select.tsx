import { faStar } from "@fortawesome/free-regular-svg-icons";
import {
  Box,
  Chip,
  InputAdornment,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { FontAwesomeIcon } from "../../shared/icons";
import { TextField } from "../../shared/ui";

export const SelectMenus = () => {
  return (
    <Box>
      {/* Sizes */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={2}
        mb={2}
        sx={{
          "& > *": {
            minWidth: 300,
          },
        }}
      >
        <Select size="small" value="10">
          <MenuItem value="10">Tom Cook</MenuItem>
        </Select>
        <Select size="medium" value="10">
          <MenuItem value="10">Tom Cook</MenuItem>
        </Select>
        <Select size="large" value="10">
          <MenuItem value="10">Tom Cook</MenuItem>
        </Select>
      </Stack>
      {/* Triggers */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={2}
        mb={2}
        sx={{
          "& > *": {
            minWidth: 300,
          },
        }}
      >
        <Select
          value="10"
          startAdornment={
            <InputAdornment position="start">
              <FontAwesomeIcon icon={faStar} />
            </InputAdornment>
          }
        >
          <MenuItem value="10">Tom Cook</MenuItem>
        </Select>
        <Select
          value="10"
          endAdornment={
            <InputAdornment position="end">
              <Typography sx={({ palette }) => ({ color: palette.gray[50] })}>
                @tomcook
              </Typography>
            </InputAdornment>
          }
        >
          <MenuItem value="10">Tom Cook</MenuItem>
        </Select>
        <Select
          value="10"
          startAdornment={
            <InputAdornment position="start">
              <FontAwesomeIcon icon={faStar} />
            </InputAdornment>
          }
          endAdornment={
            <InputAdornment position="end">
              <Typography sx={({ palette }) => ({ color: palette.gray[50] })}>
                @tomcook
              </Typography>
            </InputAdornment>
          }
        >
          <MenuItem value="10">Tom Cook</MenuItem>
        </Select>
      </Stack>
      <Stack
        direction="row"
        alignItems="center"
        spacing={2}
        mb={2}
        sx={{
          "& > *": {
            minWidth: 300,
          },
        }}
      >
        <Select size="small" error>
          <MenuItem value="10">Tom Cook</MenuItem>
        </Select>
      </Stack>
      {/* Using TextField instead  */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={2}
        mb={2}
        sx={{
          "& > *": {
            minWidth: 300,
          },
        }}
      >
        <TextField
          select
          value="10"
          SelectProps={{
            value: "10",
          }}
        >
          <MenuItem value="10">Tom Cooka</MenuItem>
        </TextField>
        <TextField
          select
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <FontAwesomeIcon icon={faStar} />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <Typography sx={({ palette }) => ({ color: palette.gray[50] })}>
                  @tomcook
                </Typography>
              </InputAdornment>
            ),
          }}
        >
          <MenuItem value="10">Tom Cook</MenuItem>
        </TextField>
      </Stack>
      {/* Chips */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={2}
        mb={2}
        sx={{
          "& > *": {
            minWidth: 300,
          },
        }}
      >
        <Select
          multiple
          renderValue={(selected) => (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
              {selected.map((value) => (
                <Chip key={value} label={value} />
              ))}
            </Box>
          )}
          value={["10", "20", "30", "40"]}
        >
          <MenuItem value="10">Multiple</MenuItem>
          <MenuItem value="20">Values</MenuItem>
          <MenuItem value="30">In</MenuItem>
          <MenuItem value="40">Chips</MenuItem>
        </Select>
        {/*  */}
      </Stack>
      {/*  */}
      {/* DROP-DOWNS */}
      <br />
      <br />
      <br />
      <Select size="small" value="10">
        <MenuItem value="10">Tom Cook</MenuItem>
      </Select>
      {/*  */}
    </Box>
  );
};

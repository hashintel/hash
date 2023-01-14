import {
  faEnvelope,
  faQuestionCircle,
} from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  FormInline,
  TextField,
} from "@local/hash-design-system";
import {
  Box,
  Checkbox,
  InputAdornment,
  Radio,
  Stack,
  Switch,
  Typography,
} from "@mui/material";

import { Button } from "../../shared/ui";

export const InputsDemo = () => {
  return (
    <Box>
      <Switch />
      <br />
      <Switch size="small" />
      <br />
      <Radio sx={{ mr: 2 }} name="btn" value="a" />
      <Radio name="btn" value="b" />
      <br />
      <Checkbox sx={{ mr: 2 }} />
      <Checkbox checked />
      <br />
      <br />
      <Stack direction="row" alignItems="center" spacing={2}>
        <TextField
          defaultValue="small"
          placeholder="Search for anything"
          size="small"
        />
        <TextField
          defaultValue="medium"
          placeholder="Search for anything"
          size="medium"
        />
        <TextField
          defaultValue="large"
          placeholder="Search for anything"
          size="large"
        />
      </Stack>
      <br />
      <Stack direction="row" alignItems="center" spacing={2}>
        <TextField placeholder="Search for anything" error />
        <TextField
          defaultValue="password1"
          placeholder="Search for anything"
          error
        />
        <TextField
          placeholder="Search for anything"
          defaultValue="name@email.com"
          size="large"
          success
        />
      </Stack>
      <br />
      <Stack direction="row" alignItems="center" spacing={2}>
        <TextField
          defaultValue="password1"
          placeholder="Search for anything"
          error
          helperText="Your password must be less than 4 characters."
        />
        <TextField
          defaultValue="password1"
          placeholder="Search for anything"
          helperText="Make your password short and easy to guess"
        />
      </Stack>
      <br />
      <Stack direction="row" alignItems="center" spacing={2}>
        <TextField
          placeholder="Search for anything"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <FontAwesomeIcon icon={faEnvelope} />
              </InputAdornment>
            ),
          }}
        />

        <TextField
          placeholder="Search for anything"
          error
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <FontAwesomeIcon icon={faQuestionCircle} />
              </InputAdornment>
            ),
          }}
        />
        <TextField
          placeholder="Search for anything"
          InputProps={{
            startAdornment: (
              <InputAdornment
                sx={({ palette }) => ({
                  backgroundColor: palette.gray[10],
                  border: `1px solid ${palette.gray[30]}`,
                })}
                position="start"
              >
                <Box pr={1.5}>
                  <Typography
                    sx={({ palette }) => ({
                      color: palette.gray[60],
                    })}
                    variant="regularTextLabels"
                  >
                    https://
                  </Typography>
                </Box>
              </InputAdornment>
            ),
          }}
        />
      </Stack>
      <br />
      <Stack direction="row" alignItems="flex-start" spacing={2}>
        <TextField
          label="Password"
          helperText="Make your password is short and easy to guess"
          required
          showLabelCornerHint
        />
        <TextField
          label="Email"
          placeholder="you@example.com"
          showLabelCornerHint
        />
        <TextField
          label="Todo item"
          defaultValue="my thing"
          placeholder="you@example.com"
        />
      </Stack>
      <br />
      <Stack direction="row" alignItems="flex-start" spacing={2}>
        <TextField placeholder="Something about myself" multiline />
        <TextField defaultValue="Something about myself" multiline autoResize />
      </Stack>
      <br />
      <Stack direction="row" alignItems="flex-start" spacing={2}>
        <FormInline>
          <TextField defaultValue="start typing" />
          <Button>Submit</Button>
        </FormInline>
      </Stack>
    </Box>
  );
};

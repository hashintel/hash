import {
  faChevronLeft,
  faEnvelope,
  faPlus,
  faQuestionCircle,
} from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  Checkbox,
  InputAdornment,
  Radio,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { GetStaticProps } from "next";
import { VFC } from "react";
import { MainContentWrapper } from "../components/layout/MainContentWrapper";
import { isProduction } from "../lib/config";
import { FontAwesomeIcon } from "../shared/icons";
import {
  Button,
  FormInline,
  IconButton,
  SubmitButtonWrapper,
  TextField,
} from "../shared/ui";

interface PageProps {}

export const getStaticProps: GetStaticProps<PageProps> = () => {
  if (isProduction) {
    return { notFound: true };
  }
  return {
    props: {},
  };
};

const Playground: VFC<PageProps> = () => {
  return (
    <MainContentWrapper>
      {/* BUTTONS */}
      <Typography variant="h1">Buttons</Typography>
      <br />
      <Box sx={{ display: "flex", alignItems: "flex-start" }}>
        <Button variant="primary" size="large">
          Primary Large
        </Button>
        <Box sx={{ mr: 2 }} />
        <Button size="medium">Primary Medium Button</Button>
        <Box sx={{ mr: 2 }} />
        <Button size="small">Primary Small Button</Button>
        <Box sx={{ mr: 2 }} />
        <Button size="xs">Primary XS Button</Button>
        <Box sx={{ mr: 2 }} />
      </Box>
      <br />
      <Box sx={{ display: "flex", alignItems: "flex-start" }}>
        <Button variant="secondary" size="large">
          Secondary Large
        </Button>
        <Box sx={{ mr: 2 }} />
        <Button variant="secondary" size="medium">
          Secondary Medium Button
        </Button>
        <Box sx={{ mr: 2 }} />
        <Button variant="secondary" size="small">
          Secondary Small Button
        </Button>
        <Box sx={{ mr: 2 }} />
        <Button variant="secondary" size="xs">
          Secondary XS Button
        </Button>
      </Box>
      <br />
      <Box sx={{ display: "flex", alignItems: "flex-start" }}>
        <Button variant="tertiary" size="large">
          Tertiary Large
        </Button>
        <Box sx={{ mr: 2 }} />
        <Button variant="tertiary" size="medium">
          Tertiary Medium Button
        </Button>
        <Box sx={{ mr: 2 }} />
        <Button variant="tertiary" size="small">
          Tertiary Small Button
        </Button>
        <Box sx={{ mr: 2 }} />
        <Button variant="tertiary" size="xs">
          Tertiary XS Button
        </Button>
        <Box sx={{ mr: 2 }} />
      </Box>
      <br />
      <Box sx={{ display: "flex", alignItems: "flex-start" }}>
        <Button variant="tertiary_quiet" size="large">
          Tertiary Quiet Large
        </Button>
        <Box sx={{ mr: 2 }} />
        <Button variant="tertiary_quiet" size="medium">
          Tertiary Quiet Medium Button
        </Button>
        <Box sx={{ mr: 2 }} />
        <Button variant="tertiary_quiet" size="small">
          Tertiary Quiet Small Button
        </Button>
        <Box sx={{ mr: 2 }} />
        <Button variant="tertiary_quiet" size="xs">
          Tertiary Quiet XS Button
        </Button>
        <Box sx={{ mr: 2 }} />
      </Box>
      <br />
      <Box sx={{ display: "flex", alignItems: "flex-start" }}>
        <Button variant="warning" size="large">
          Warning Large
        </Button>
        <Box sx={{ mr: 2 }} />
        <Button variant="warning" size="medium">
          Warning
        </Button>
        <Box sx={{ mr: 2 }} />
        <Button variant="warning" size="small">
          Warning Small Button
        </Button>
        <Box sx={{ mr: 2 }} />
        <Button variant="warning" size="xs">
          Warning XS
        </Button>
        <Box sx={{ mr: 2 }} />
      </Box>
      <br />
      <Box sx={{ display: "flex", alignItems: "flex-start" }}>
        <Button variant="danger" size="large">
          Delete Large
        </Button>
        <Box sx={{ mr: 2 }} />
        <Button variant="danger" size="medium">
          Delete
        </Button>
        <Box sx={{ mr: 2 }} />
        <Button variant="danger" size="small">
          Delete Small Button
        </Button>
        <Box sx={{ mr: 2 }} />
        <Button variant="danger" size="xs">
          Delete XS
        </Button>
        <Box sx={{ mr: 2 }} />
      </Box>
      <br />
      <Box sx={{ display: "flex", alignItems: "flex-start" }}>
        <Button disabled>Disabled Button</Button>
        <Box sx={{ mr: 2 }} />
        <SubmitButtonWrapper helperText="Please enter a title or type to continue">
          <Button sx={{ width: 260 }} disabled>
            A disabled button
          </Button>
        </SubmitButtonWrapper>
        <Box sx={{ mr: 2 }} />
        <SubmitButtonWrapper
          helperText="Please enter a title or type to continue"
          useTooltip
        >
          <Button disabled>A disabled button</Button>
        </SubmitButtonWrapper>

        <Box sx={{ mr: 2 }} />
      </Box>
      <br />
      <Box sx={{ display: "flex", alignItems: "flex-start" }}>
        <Button loading>Primary</Button>
        <Box sx={{ mr: 2 }} />
        <Button variant="secondary" size="medium" loading loadingWithoutText>
          Secondary
        </Button>
        <Box sx={{ mr: 2 }} />
        <Button variant="tertiary" size="small" loading>
          Secondary
        </Button>
        <Box sx={{ mr: 2 }} />
        <Button variant="warning" size="small" loading loadingWithoutText>
          Warning
        </Button>
        <Box sx={{ mr: 2 }} />
        <Button variant="danger" size="small" loading>
          Danger
        </Button>
        <Box sx={{ mr: 2 }} />
      </Box>
      <br />
      <Box sx={{ display: "flex", alignItems: "flex-start" }}>
        <Button variant="primary" endIcon={<FontAwesomeIcon icon={faPlus} />}>
          Primary
        </Button>
        <Box sx={{ mr: 2 }} />
        <Button variant="secondary" endIcon={<FontAwesomeIcon icon={faPlus} />}>
          Secondary
        </Button>
        <Box sx={{ mr: 2 }} />
        <Button variant="tertiary" endIcon={<FontAwesomeIcon icon={faPlus} />}>
          Tertiary
        </Button>
        <Box sx={{ mr: 2 }} />
        <Button
          variant="tertiary_quiet"
          endIcon={<FontAwesomeIcon icon={faPlus} />}
        >
          Tertiary Quiet
        </Button>
        <Box sx={{ mr: 2 }} />
      </Box>
      <br />
      <br />
      <Typography>Icon Buttons</Typography>
      <br />
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <IconButton size="large">
          <FontAwesomeIcon icon={faChevronLeft} />
        </IconButton>
        <Box sx={{ mr: 2 }} />
        <IconButton size="large" unpadded>
          <FontAwesomeIcon icon={faChevronLeft} />
        </IconButton>
        <Box sx={{ mr: 2 }} />
        <IconButton size="medium">
          <FontAwesomeIcon icon={faChevronLeft} />
        </IconButton>
        <Box sx={{ mr: 2 }} />
        <IconButton size="medium" unpadded>
          <FontAwesomeIcon icon={faChevronLeft} />
        </IconButton>
        <Box sx={{ mr: 2 }} />
        <IconButton size="small">
          <FontAwesomeIcon icon={faChevronLeft} />
        </IconButton>
        <Box sx={{ mr: 2 }} />
        <IconButton size="small" unpadded>
          <FontAwesomeIcon icon={faChevronLeft} />
        </IconButton>
        <Box sx={{ mr: 2 }} />
      </Box>
      <br />
      <br />
      <br />
      <br />
      <br />
      {/* INPUTS */}
      <Typography variant="h1">Inputs</Typography>
      <br />
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
                  color: palette.gray[60],
                  paddingRight: "12px",
                  border: `1px solid ${palette.gray[30]}`,
                })}
                position="start"
              >
                <Typography
                  sx={({ palette }) => ({
                    color: palette.gray[60],
                  })}
                  variant="regularTextLabels"
                >
                  https://
                </Typography>
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
      <br />
      <br />
      <br />
    </MainContentWrapper>
  );
};

export default Playground;

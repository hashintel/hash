import { faChevronLeft, faPlus } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  IconButton,
  SubmitButtonWrapper,
} from "@local/hash-design-system";
import { Box, Typography } from "@mui/material";

import { Button } from "../../shared/ui";

export const ButtonsDemo = () => {
  return (
    <Box>
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
    </Box>
  );
};

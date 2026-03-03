import { XTwitterIcon } from "@hashintel/design-system";

import { Button } from "../../../shared/ui/button";

export const FollowUsButton = () => (
  <Button href="https://x.com/hashai" variant="white_cta" size="small">
    Follow us for updates
    <XTwitterIcon
      sx={{ fill: ({ palette }) => palette.teal[60], fontSize: 14, ml: 1.2 }}
    />
  </Button>
);

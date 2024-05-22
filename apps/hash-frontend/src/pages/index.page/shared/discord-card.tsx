import { DiscordIcon } from "@hashintel/design-system";

import { Button } from "../../../shared/ui/button";
import { HomepageCard } from "./homepage-card";
import { HomepageBigText } from "./typography";

export const DiscordCard = () => (
  <HomepageCard wide>
    <HomepageBigText sx={{ fontWeight: 400 }}>Join our user</HomepageBigText>
    <HomepageBigText sx={{ color: "rgba(88, 101, 242, 1)", fontWeight: 700 }}>
      Discord forum
    </HomepageBigText>
    <Button
      href="https://hash.ai/discord"
      size="small"
      variant="white_cta"
      target="_blank"
    >
      Join the community
      <DiscordIcon
        sx={{ fontSize: 14, ml: 1.5, fill: "rgba(88, 101, 242, 1)" }}
      />
    </Button>
  </HomepageCard>
);

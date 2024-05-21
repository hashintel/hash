import { ArrowUpRightRegularIcon, ChromeIcon } from "@hashintel/design-system";
import { Box } from "@mui/material";

import { ArrowRightIcon } from "../../shared/icons/arrow-right";
import { Button } from "../../shared/ui/button";
import { DiscordCard } from "./shared/discord-card";
import { FollowUsButton } from "./shared/follow-us-button";
import { HomepageCard } from "./shared/homepage-card";
import { HomepageGrid } from "./shared/homepage-grid";
import { HomepageBigText, HomepageSmallCaps } from "./shared/typography";
import { UsesCard } from "./shared/uses-card";

export const Waitlisted = ({ position = 100 }: { position?: number }) => {
  return (
    <HomepageGrid>
      <HomepageCard>
        <HomepageBigText>
          You are{" "}
          <Box
            component="span"
            sx={{ color: ({ palette }) => palette.teal[60] }}
          >
            #{position}
          </Box>
        </HomepageBigText>
        <HomepageBigText>on the waitlist</HomepageBigText>
        <HomepageSmallCaps>
          Stay tuned
          <Box
            component="span"
            sx={{ color: ({ palette }) => palette.teal[60], ml: 0.8 }}
          >
            for access
          </Box>
        </HomepageSmallCaps>
        <FollowUsButton />
      </HomepageCard>
      <HomepageCard>
        <HomepageBigText>Skip the wait </HomepageBigText>
        <HomepageBigText sx={{ color: ({ palette }) => palette.blue[70] }}>
          get early access
        </HomepageBigText>
        <HomepageSmallCaps>Jump the queue</HomepageSmallCaps>
        <Button variant="primary" size="small" sx={{ borderRadius: 2 }}>
          <Box
            component="span"
            sx={{ color: ({ palette }) => palette.blue[25], mr: 0.5 }}
          >
            Tell us about your
          </Box>
          use case
          <ArrowRightIcon sx={{ fontSize: 14, ml: 1 }} />
        </Button>
      </HomepageCard>
      <HomepageCard>
        <HomepageBigText sx={{ fontWeight: 400 }}>Install the </HomepageBigText>
        <HomepageBigText
          sx={{ color: ({ palette }) => palette.aqua[70], fontWeight: 700 }}
        >
          HASH extension
        </HomepageBigText>
        <HomepageSmallCaps>Get ready</HomepageSmallCaps>
        <Button
          href="https://chromewebstore.google.com/detail/hash-ai/nljhmbdifehhnkhinhfooebllaajlddb"
          variant="white_cta"
          size="small"
        >
          <ChromeIcon sx={{ fontSize: 18, mr: 1.5 }} />
          Download for Chrome
          <ArrowUpRightRegularIcon
            sx={{
              fontSize: 15,
              ml: 0.8,
              fill: ({ palette }) => palette.aqua[70],
            }}
          />
        </Button>
      </HomepageCard>
      <UsesCard />
      <DiscordCard />
    </HomepageGrid>
  );
};

import { ArrowRightIconRegular } from "@hashintel/design-system";
import { Box } from "@mui/material";

import { Button } from "../../shared/ui/button";
import { DiscordCard } from "./shared/discord-card";
import { FollowUsButton } from "./shared/follow-us-button";
import { HomepageCard } from "./shared/homepage-card";
import { HomepageGrid } from "./shared/homepage-grid";
import { HomepageBigText, HomepageSmallCaps } from "./shared/typography";
import { UsesCard } from "./shared/uses-card";

export const LoggedOut = () => {
  return (
    <HomepageGrid>
      <HomepageCard wide>
        <HomepageBigText>
          You are{" "}
          <Box
            component="span"
            sx={{ color: ({ palette }) => palette.blue[70] }}
          >
            not yet
          </Box>
        </HomepageBigText>
        <HomepageBigText>on the waitlist</HomepageBigText>
        <HomepageSmallCaps>
          Stay tuned
          <Box
            component="span"
            sx={{ color: ({ palette }) => palette.blue[70], ml: 0.8 }}
          >
            for access
          </Box>
        </HomepageSmallCaps>
        <Button
          href="/signup"
          variant="primary"
          size="small"
          sx={{ borderRadius: 2 }}
        >
          Create an account
          <ArrowRightIconRegular sx={{ fontSize: 14, ml: 1 }} />
        </Button>
      </HomepageCard>
      <HomepageCard wide>
        <HomepageBigText>
          <Box
            component="span"
            sx={{ color: ({ palette }) => palette.teal[60] }}
          >
            See videos
          </Box>
          <Box component="span" sx={{ fontWeight: 400, ml: 1 }}>
            of
          </Box>
        </HomepageBigText>
        <HomepageBigText sx={{ fontWeight: 400 }}>
          HASH in action
        </HomepageBigText>
        <HomepageSmallCaps>Watch videos</HomepageSmallCaps>
        <FollowUsButton />
      </HomepageCard>
      <UsesCard />
      <DiscordCard />
    </HomepageGrid>
  );
};

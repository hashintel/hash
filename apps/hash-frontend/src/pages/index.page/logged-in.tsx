import { BugIcon } from "@hashintel/design-system";
import { Box } from "@mui/material";

import { ArrowRightIcon } from "../../shared/icons/arrow-right";
import { EnvelopeRegularIcon } from "../../shared/icons/envelope-regular-icon";
import { Button } from "../../shared/ui/button";
import { DiscordCard } from "./shared/discord-card";
import { HomepageCard } from "./shared/homepage-card";
import { HomepageGrid } from "./shared/homepage-grid";
import { HomepageBigText, HomepageMediumText } from "./shared/typography";
import { UsesCard } from "./shared/uses-card";

export const LoggedIn = () => {
  return (
    <HomepageGrid>
      <HomepageCard>
        <HomepageBigText>
          Get{" "}
          <Box
            component="span"
            sx={{ color: ({ palette }) => palette.purple[70] }}
          >
            support
          </Box>
        </HomepageBigText>
        <HomepageMediumText>1:1 help with HASH</HomepageMediumText>
        <Button
          href="https://hash.ai/contact?topic=support"
          variant="white_cta"
          size="small"
        >
          Send a message
          <EnvelopeRegularIcon
            sx={{
              fontSize: 14,
              ml: 1.3,
              fill: ({ palette }) => palette.purple[70],
            }}
          />
        </Button>
      </HomepageCard>
      <HomepageCard>
        <HomepageBigText>
          Request{" "}
          <Box
            component="span"
            sx={{ color: ({ palette }) => palette.teal[70] }}
          >
            a feature
          </Box>
        </HomepageBigText>
        <HomepageMediumText>or suggest a change</HomepageMediumText>
        <Button
          href="https://hash.ai/contact?topic=support&category=suggest_improvement"
          variant="white_cta"
          size="small"
        >
          Make
          <Box
            component="span"
            sx={{ color: ({ palette }) => palette.teal[70], ml: 0.6 }}
          >
            a suggestion
          </Box>
          <ArrowRightIcon
            sx={{
              fontSize: 14,
              ml: 1.2,
              fill: ({ palette }) => palette.teal[70],
            }}
          />
        </Button>
      </HomepageCard>
      <HomepageCard>
        <HomepageBigText>
          Report{" "}
          <Box
            component="span"
            sx={{ color: ({ palette }) => palette.pink[80] }}
          >
            a bug
          </Box>
        </HomepageBigText>
        <HomepageMediumText>or unexpected behavior</HomepageMediumText>
        <Button
          href="https://hash.ai/contact?topic=support&category=report_an_issue"
          variant="white_cta"
          size="small"
        >
          Let us know
          <BugIcon
            sx={{
              fontSize: 14,
              ml: 1.2,
              fill: ({ palette }) => palette.pink[80],
            }}
          />
        </Button>
      </HomepageCard>
      <UsesCard />
      <DiscordCard />
    </HomepageGrid>
  );
};

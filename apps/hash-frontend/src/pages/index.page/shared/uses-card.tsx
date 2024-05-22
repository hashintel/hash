import { LightbulbOnRainbowIcon } from "@hashintel/design-system";
import { Box } from "@mui/material";

import { Button } from "../../../shared/ui/button";
import { HomepageCard } from "./homepage-card";
import { HomepageBigText } from "./typography";

export const UsesCard = () => (
  <HomepageCard wide>
    <HomepageBigText>
      See how{" "}
      <Box
        component="span"
        sx={{
          background:
            "linear-gradient(90deg, #FC29B4 0%, #FF4042 19.79%, #FFCD1D 42.71%, #2BE48C 59.9%, #23C3E7 77.6%, #2D36FD 100%)",
          fontWeight: 700,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        other people
      </Box>
    </HomepageBigText>
    <HomepageBigText sx={{ fontWeight: 400 }}>are using HASH</HomepageBigText>
    <Button
      href="https://hash.ai/cases"
      size="small"
      variant="white_cta"
      target="_blank"
    >
      Explore use cases
      <LightbulbOnRainbowIcon
        sx={{
          fontSize: 18,
          ml: 1.2,
        }}
      />
    </Button>
  </HomepageCard>
);

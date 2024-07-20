import { MemoCircleCheckRegularIcon } from "@hashintel/design-system";

import { Button } from "../../../shared/ui/button";

import { HomepageCard } from "./homepage-card";
import { HomepageBigText } from "./typography";

export const GuideCard = () => (
  <HomepageCard wide>
    <HomepageBigText sx={{ fontWeight: 400 }}>Read the</HomepageBigText>
    <HomepageBigText sx={{ color: "rgba(88, 101, 242, 1)", fontWeight: 700 }}>
      user guide
    </HomepageBigText>
    <Button
      href={"https://hash.ai/learn"}
      size={"small"}
      variant={"white_cta"}
      target={"_blank"}
    >
      Read the guide
      <MemoCircleCheckRegularIcon
        sx={{ fontSize: 14, ml: 1.5, fill: "rgba(88, 101, 242, 1)" }}
      />
    </Button>
  </HomepageCard>
);

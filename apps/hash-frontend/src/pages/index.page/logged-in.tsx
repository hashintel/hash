import { DiscordCard } from "./shared/discord-card";
import { HomepageGrid } from "./shared/homepage-grid";
import { UsesCard } from "./shared/uses-card";

export const LoggedIn = () => {
  return (
    <HomepageGrid>
      <UsesCard />
      <DiscordCard />
    </HomepageGrid>
  );
};

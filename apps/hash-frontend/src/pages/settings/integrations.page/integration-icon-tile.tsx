import {
  IntegrationIcon,
  integrationIconNameByIntegration,
} from "@hashintel/ds-icons";

export const IntegrationIconTile = ({
  name,
  tileSize = 44,
}: {
  name: string;
  tileSize?: number;
}) => (
  <IntegrationIcon
    name={integrationIconNameByIntegration[name] ?? "genericApp"}
    variant="app-light"
    size={tileSize}
    aria-hidden
    style={{ flexShrink: 0 }}
  />
);

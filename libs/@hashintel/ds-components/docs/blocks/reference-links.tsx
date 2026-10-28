import { Button } from "../../src/components/Button/button";
import { referenceLinksRecipe } from "./reference-links.recipe";

import type { IconName } from "../../src/components/Icon/icon";

/** Reference-link row for MDX docs pages to display external links */

export type ReferenceLink = {
  label: string;
  href: string;
  /** Defaults to the external-link icon. */
  iconName?: IconName;
};

export const ReferenceLinks = ({ links }: { links: ReferenceLink[] }) => (
  <div className={referenceLinksRecipe()}>
    {links.map((link) => (
      <Button
        key={link.label}
        size="xs"
        variant="ghost"
        href={link.href}
        target="_blank"
        iconName={link.iconName ?? "externalLink"}
      >
        {link.label}
      </Button>
    ))}
  </div>
);

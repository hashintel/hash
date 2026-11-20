import { useHashIconPackEnabled } from "@hashintel/ds-icons";
import { StaticHashIcon } from "@hashintel/ds-icons/static";
import { ExperimentalIcon } from "@hashintel/petrinaut/ui";

import type { SVGProps } from "react";

type AiAssistantIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  title?: string;
};

export const AiAssistantIcon = ({
  size = 15,
  title,
  ...props
}: AiAssistantIconProps) => {
  const experimentalIcons = useHashIconPackEnabled();
  if (experimentalIcons) {
    return (
      <ExperimentalIcon
        width={size}
        height={size}
        aria-label={title}
        {...props}
        name="agent"
      />
    );
  }
  return (
    <StaticHashIcon
      aria-hidden={title === undefined ? true : undefined}
      fill="none"
      height={size}
      role={title === undefined ? undefined : "img"}
      width={size}
      {...props}
      name="assistant"
    />
  );
};

import { useLayoutEffect, useRef } from "react";

import { Chip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { PetrinautSettingsSection } from "../../../../../../react/navigation";

type HeadingSection = {
  id: PetrinautSettingsSection;
  label: string;
  description: string;
};

export const SettingsHeading = ({
  section,
  index,
  animated,
}: {
  section: HeadingSection;
  index: number;
  animated: boolean;
}) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const previousIndexRef = useRef(index);

  useLayoutEffect(() => {
    const previousIndex = previousIndexRef.current;
    previousIndexRef.current = index;
    const element = elementRef.current;
    if (
      previousIndex === index ||
      !animated ||
      !element?.animate ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const animation = element.animate(
      [
        {
          opacity: 0,
          filter: "blur(2px)",
          transform: "translateY(3px)",
        },
        { opacity: 1, filter: "blur(0px)", transform: "translateY(0)" },
      ],
      { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    return () => animation.cancel();
  }, [index, animated]);

  return (
    <div className={css({ paddingRight: "7" })}>
      <div
        ref={elementRef}
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "2",
          marginBottom: "1",
        })}
      >
        <h2
          className={css({
            fontSize: "lg",
            fontWeight: "semibold",
            color: "neutral.fg.heading",
            lineHeight: "[1.4]",
          })}
        >
          {section.label}
        </h2>
        {(section.id === "simulation" || section.id === "labs") && (
          <Chip size="xs" color="orange" variant="outline" shape="round">
            Experimental
          </Chip>
        )}
      </div>
      <p
        className={css({
          fontSize: "xs",
          color: "neutral.fg.body",
          lineHeight: "[1.6]",
        })}
      >
        {section.description}
      </p>
    </div>
  );
};

import { useLayoutEffect, useRef } from "react";

import { Chip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { PetrinautSettingsSection } from "../../../../../../react/navigation/navigation";

type HeadingSection = {
  id: PetrinautSettingsSection;
  label: string;
  description: string;
};

const headingStyle = css({ paddingRight: "7" });

const titleRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  marginBottom: "1",
});

const titleStyle = css({
  fontSize: "lg",
  fontWeight: "semibold",
  color: "neutral.fg.heading",
  lineHeight: "[1.4]",
});

const descriptionStyle = css({
  fontSize: "xs",
  color: "neutral.fg.body",
  lineHeight: "[1.6]",
});

export const SettingsHeading = ({
  section,
  animated,
}: {
  section: HeadingSection;
  animated: boolean;
}) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const sectionId = section.id;
  const previousSectionRef = useRef(sectionId);

  useLayoutEffect(() => {
    const previousSection = previousSectionRef.current;
    previousSectionRef.current = sectionId;
    const element = elementRef.current;
    if (
      previousSection === sectionId ||
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
  }, [sectionId, animated]);

  return (
    <div className={headingStyle}>
      <div ref={elementRef} className={titleRowStyle}>
        <h2 className={titleStyle}>{section.label}</h2>
        {section.id === "labs" && (
          <Chip size="xs" color="orange" variant="outline" shape="round">
            Experimental
          </Chip>
        )}
      </div>
      <p className={descriptionStyle}>{section.description}</p>
    </div>
  );
};

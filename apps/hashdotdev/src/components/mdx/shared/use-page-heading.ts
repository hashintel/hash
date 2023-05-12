import { useContext, useEffect, useRef } from "react";

import { PageHeadingsContext } from "../../context/page-headings-context";

export const usePageHeading = (props: { anchor: string }) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { headings, setHeadings } = useContext(PageHeadingsContext);

  const { anchor } = props;

  useEffect(() => {
    if (
      headingRef.current &&
      headings.find((heading) => heading.anchor === anchor) === undefined
    ) {
      const element = headingRef.current;
      setHeadings((prev) => [...prev, { anchor, element }]);
    }
  }, [anchor, headingRef, headings, setHeadings]);

  return { headingRef };
};

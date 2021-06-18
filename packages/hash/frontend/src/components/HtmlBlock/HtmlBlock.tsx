import React, { useEffect, useRef, VoidFunctionComponent } from "react";

type HtmlBlockProps = {
  html: string;
  [key: string]: any;
};

export const HtmlBlock: VoidFunctionComponent<HtmlBlockProps> = ({
  html,
  ...props
}) => {
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!divRef.current) {
      return;
    }

    const docFragment = document.createRange().createContextualFragment(html);
    
    divRef.current.innerHTML = "";
    divRef.current.appendChild(docFragment);

  }, []);

  return <div ref={divRef} {...props} />;
};

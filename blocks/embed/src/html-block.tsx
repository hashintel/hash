import type { FunctionComponent } from "react";
import { useEffect, useRef } from "react";
import { tw } from "twind";

import { toCSSText } from "./utils";

type HtmlBlockProps = {
  html: string;
  dimensions?: { height: number; width: number };
  [key: string]: unknown;
};

export const HtmlBlock: FunctionComponent<HtmlBlockProps> = ({
  html,
  dimensions,
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
    const el = divRef.current.children[0] as HTMLIFrameElement | undefined;
    if (el) {
      el.style.cssText = toCSSText({
        position: "absolute",
        left: "0px",
        top: "0px",
        height: "100%",
        width: "100%",
      } as CSSStyleDeclaration);
    }
  }, [html]);

  return (
    <div
      ref={divRef}
      className={tw`${
        !dimensions ? "absolute top-0 left-0 h-full w-full" : "relative"
      }`}
      style={
        dimensions ? { width: dimensions.width, height: dimensions.height } : {}
      }
      {...props}
    />
  );
};

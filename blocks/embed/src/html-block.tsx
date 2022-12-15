import { useEffect, useRef, FunctionComponent } from "react";
import { toCSSText } from "./utils";

type HtmlBlockProps = {
  html: string;
  dimensions?: { height: number; width: number };
  [key: string]: any;
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
    const el = divRef.current.children[0] as HTMLIFrameElement;
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
      style={
        dimensions
          ? {
              position: "relative",
              width: dimensions.width,
              height: dimensions.height,
            }
          : {
              height: "100%",
              left: "0",
              position: "absolute",
              top: "0",
              width: "100%",
            }
      }
      {...props}
    />
  );
};

import React, { useEffect, useRef, VoidFunctionComponent } from "react";
import { tw } from 'twind'

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

    Object.assign(divRef.current.children[0].style, {
      position: 'absolute',
      left: 0,
      top: 0,
      height: '100%',
      width: '100%'
    })

  }, [html]);

  return <div ref={divRef} className={tw`absolute top-0 left-0 h-full w-full`} {...props} />;
};

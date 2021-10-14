import { iframeResizer as iFrameResizer } from "iframe-resizer";

import { forwardRef, HTMLProps, useEffect } from "react";

/**
 * @todo expose the unused functions to component consumers, or use them here,
 *    or remove the properties from the type.
 */
type IFrameObject = {
  close: () => void;
  moveToAnchor: (anchor: string) => void;
  resize: () => void;
  sendMessage: (message: any, targetOrigin?: string) => void;
  removeListeners: () => void;
};

type IFrameWithResizer = HTMLIFrameElement & {
  iFrameResizer: IFrameObject;
};

type ResizingIFrameProps = HTMLProps<HTMLIFrameElement> & {
  children?: undefined;
};

export const ResizingIFrame = forwardRef<
  HTMLIFrameElement,
  ResizingIFrameProps
>((props, iFrameRef) => {
  useEffect(() => {
    if (typeof iFrameRef === "function") {
      throw new Error("Ref must be an object, not a function.");
    }

    const iframe = iFrameRef?.current;
    if (!iframe) {
      throw new Error("iFrame not loaded.");
    }

    /**
     * @todo see if anything else to be done about unresponsive frame warnings.
     *    fix the library types to include this valid option.
     * */
    iFrameResizer({ warningTimeout: 20_000 } as FixMeLater, iframe);

    return () => (iframe as IFrameWithResizer).iFrameResizer.removeListeners();
  }, [iFrameRef, props]);

  return <iframe {...props} ref={iFrameRef} title={props.title || "HASH"} />;
});

import { iframeResizer as iFrameResizer } from "iframe-resizer";
import {
  DetailedHTMLProps,
  forwardRef,
  IframeHTMLAttributes,
  useEffect,
} from "react";

/**
 * @todo expose the unused functions to component consumers, or use them here,
 *    or remove the properties from the type.
 */
type IFrameObject = {
  close: () => void;
  moveToAnchor: (anchor: string) => void;
  resize: () => void;
  sendMessage: (message: unknown, targetOrigin?: string) => void;
  removeListeners: () => void;
};

type IFrameWithResizer = HTMLIFrameElement & {
  iFrameResizer: IFrameObject;
};

type ResizingIFrameProps = DetailedHTMLProps<
  IframeHTMLAttributes<HTMLIFrameElement>,
  HTMLIFrameElement
> & {
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
     *  @todo check origin for only the sandbox origin, once we have a way of setting it
     * */
    iFrameResizer(
      {
        checkOrigin: false,
        // @ts-expect-error -- warningTimeout needs to be added to the list of know attributes
        warningTimeout: 20_000,
      },
      iframe,
    );

    return () => (iframe as IFrameWithResizer).iFrameResizer.removeListeners();
  }, [iFrameRef, props]);

  return (
    <iframe
      {...props}
      ref={iFrameRef}
      /* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- @todo what to do with empty title */
      title={props.title || "HASH"}
      sandbox="allow-scripts allow-top-navigation-by-user-activation"
    />
  );
});

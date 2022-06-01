import { BlockComponent } from "blockprotocol/react";
import React, {
  ReactNode,
  useCallback,
  useLayoutEffect,
  useState,
} from "react";
import { BlockHookHandler, HookServiceValue } from "./block-hook";

type AppProps = {
  color?: string;
  level?: number;
  text?: HookServiceValue;
};

export const App: BlockComponent<AppProps> = ({ color, level = 1, text }) => {
  // @todo set type correctly
  const Header = `h${level}` as any;

  const [hookHandler, setHookHandler] = useState<BlockHookHandler | null>(null);

  const initHookHandlerRef = useCallback((ref: HTMLElement | null) => {
    setHookHandler(
      ref
        ? new BlockHookHandler({ element: ref.parentNode! as HTMLElement })
        : null,
    );
  }, []);

  const [textNode, setTextNode] = useState<ReactNode | null>(null);

  useLayoutEffect(() => {
    if (hookHandler && text) {
      const controller = new AbortController();

      hookHandler
        .render(text)
        .then((node) => {
          if (!controller.signal.aborted) {
            // @todo type this properly
            setTextNode(node as any);
          }
        })
        .catch((err) => {
          if (!controller.signal.aborted) {
            // eslint-disable-next-line no-console
            console.error(err);
          }
        });

      return () => controller.abort();
    } else {
      setTextNode(null);
    }
  }, [hookHandler, text]);

  return (
    <Header
      ref={initHookHandlerRef}
      style={{ fontFamily: "Arial", color: color ?? "black", marginBottom: 0 }}
    >
      {textNode}
    </Header>
  );
};

import { useHook, useHookBlockModule } from "@blockprotocol/hook/react";
import { useRef } from "react";

import { contentKey } from "../app";

export const ConfirmedText = ({
  entityId,
  text,
}: {
  entityId: string;
  text: string;
}) => {
  const textRef = useRef<HTMLDivElement>(null);

  const { hookModule } = useHookBlockModule(textRef);

  useHook(hookModule, textRef, "text", entityId, [contentKey], (node) => {
    // eslint-disable-next-line no-param-reassign
    node.innerText = text;

    return () => {
      // eslint-disable-next-line no-param-reassign
      node.innerText = "";
    };
  });

  return <div ref={textRef} />;
};

import React, { RefCallback } from "react";

import { BlockComponent } from "blockprotocol/react";

type AppProps = {
  editableRef?: RefCallback<HTMLElement>;
  title: HTMLElement;
  content: HTMLDetailsElement;
};

export const App: BlockComponent<AppProps> = ({
  editableRef,
  title,
  content,
}) => {
  return (
    <div>
      <details ref={editableRef}>
        <summary>{editableRef ? undefined : title}</summary>
        {editableRef ? undefined : content}
      </details>
    </div>
  );
};

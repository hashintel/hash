import React, { RefCallback } from "react";

import { BlockComponent } from "blockprotocol/react";

type AppProps = {
  title: string;
  content: string;
};

export const App: BlockComponent<AppProps> = ({
  accountId,
  entityId,
  title,
  content,
  updateEntities,
}) => {
  const updateContent = (text: string, field: "content" | "title") => {
    updateEntities([
      {
        accountId,
        entityId,
        data: {
          content,
          title,
          [field]: text,
        },
      },
    ]);
  };

  return (
    <div>
      <details>
        <summary>
          <input
            defaultValue={title}
            type="text"
            placeholder="Write a title"
            onBlur={(event) => updateContent(event.target.value, "title")}
          />
        </summary>
        <input
          defaultValue={content}
          type="text"
          placeholder="Your detailed content"
          onBlur={(event) => updateContent(event.target.value, "content")}
        />
      </details>
    </div>
  );
};

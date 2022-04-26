import React from "react";

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
            // @todo Replace input elements with editableRef when it's possible to use multiple ones in the same block.
            //       https://app.asana.com/0/1200211978612931/1202183033435672
            defaultValue={title}
            type="text"
            placeholder="Write a title"
            onBlur={(event) => updateContent(event.target.value, "title")}
          />
        </summary>
        <textarea
          // @todo Replace input element with editableRef when it's possible to use multiple ones in the same block.
          //       https://app.asana.com/0/1200211978612931/1202183033435672
          defaultValue={content}
          placeholder="Your detailed content"
          onBlur={(event) => updateContent(event.target.value, "content")}
        />
      </details>
    </div>
  );
};

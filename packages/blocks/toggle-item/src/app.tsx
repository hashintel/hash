import React, { useEffect, useRef, useState } from "react";

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
  let contentRef = useRef(null);
  let [currentContent, setContent] = useState(content);

  const updateContent = (text: string, field: "content" | "title") => {
    updateEntities([
      {
        accountId,
        entityId,
        data: {
          currentContent,
          title,
          [field]: text,
        },
      },
    ]);
  };

  const updateContentHeight = () => {
    contentRef.current.style.height = "auto";
    const scrollHeight = contentRef.current.scrollHeight;
    contentRef.current.style.height = scrollHeight + "px";
  };

  useEffect(() => {
    updateContentHeight();
  }, [currentContent]);

  return (
    <div>
      <details
        onToggle={() => {
          // Browsers don't calculate `scrollHeight` of elements not shown, it's 0
          // since the `textarea` in the content starts off hidden we need to re-calculate when it's visible
          updateContentHeight();
        }}
      >
        <summary>
          <input
            // @todo Replace input elements with editableRef when it's possible to use multiple ones in the same block.
            //       https://app.asana.com/0/1200211978612931/1202183033435672
            defaultValue={title}
            type="text"
            placeholder="Write a title"
            className="toggle-item-base-paragraph"
            style={{
              // We substract the size of the arrow used to open the details element to have the input and the arrow on the same line.
              width: "calc(100% - 20px)",
              border: 0,
              outline: 0,
            }}
            onBlur={(event) => updateContent(event.target.value, "title")}
          />
        </summary>
        <textarea
          ref={contentRef}
          // @todo Replace input element with editableRef when it's possible to use multiple ones in the same block.
          //       https://app.asana.com/0/1200211978612931/1202183033435672
          defaultValue={currentContent}
          placeholder="Your detailed content"
          className="toggle-item-base-paragraph"
          style={{
            width: "100%",
            resize: "none",
            border: 0,
            outline: 0,
            // Hides the scroll bar.
            overflow: "hidden",
          }}
          onChange={(event) => {
            setContent(event.target.value);
          }}
          onBlur={(event) => updateContent(event.target.value, "content")}
        />
      </details>
    </div>
  );
};

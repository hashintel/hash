import React, { useEffect, useRef, useState } from "react";

import { BlockComponent } from "blockprotocol/react";

type BlockEntityProperties = {
  title: string;
  content: string;
  open: string;
};

export const App: BlockComponent<BlockEntityProperties> = ({
  accountId,
  entityId,
  title,
  content,
  open,
  updateEntities,
}) => {
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [currentContent, setContent] = useState(content);

  const updateContent = (text: string, field: "content" | "title" | "open") => {
    void updateEntities?.([
      {
        accountId,
        entityId,
        data: {
          content: currentContent,
          title,
          open,
          [field]: text,
        },
      },
    ]);
  };

  const updateContentHeight = () => {
    if (contentRef.current) {
      contentRef.current.style.height = "auto";
      const scrollHeight = contentRef.current.scrollHeight;
      contentRef.current.style.height = `${scrollHeight}px`;
    }
  };

  useEffect(() => {
    updateContentHeight();
  }, [currentContent]);

  return (
    <div>
      <details
        open={open === "true"}
        onToggle={(toggled) => {
          updateContent(
            (toggled.target as HTMLDetailsElement).open.toString(),
            "open",
          );
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

import React, { useState, useRef } from "react";
import { tw } from "twind";
import { Button } from "../Button";
import { useBlocksMeta } from "../../blocks/blocksMeta";
import { useBlockView } from "../../blocks/page/BlockViewContext";

export const BlockLoaderInput: React.VFC = () => {
  const blockView = useBlockView();
  const { value: blocksMeta, setValue: setBlocksMeta } = useBlocksMeta();

  const [error, setError] = useState(null);
  const [blockUrl, setBlockUrl] = useState("");
  const blockUrlRef = useRef<HTMLInputElement | null>(null);

  const isDefinedBlock = blockUrl in blocksMeta;
  const isValidBlockUrl = Boolean(blockUrlRef.current?.validity.valid);

  const loadBlockFromUrl = () => {
    // take point before any state/pm-doc changes occur
    const pos = blockView.getPos();

    blockView.manager
      .fetchAndDefineBlock(blockUrl)
      .then((blockMeta) => {
        setError(null);
        setBlocksMeta((prev) => ({ ...prev, [blockUrl]: blockMeta }));
        return blockView.manager.createRemoteBlock(blockUrl);
      })
      .then((block) => {
        const { view } = blockView;
        view.dispatch(view.state.tr.insert(pos, block));
      })
      .catch((err) => {
        // eslint-disable-next-line no-console -- requires individual debugging
        console.error("could not load block from url:", blockUrl, "\n", err);

        // clear the error after short delay to enable retries (re-enable load button)
        setError(err);
        setTimeout(() => setError(null), 2e3);
      });
  };

  return (
    <>
      <input
        ref={blockUrlRef}
        type="url"
        value={blockUrl}
        onChange={(event) => setBlockUrl(event.target.value)}
        placeholder="Load Block from URL..."
        className={tw`mt-2 block w-full px-2 py-1 bg-gray-50 border-1 text-sm rounded-sm `}
      />
      {blockUrl && (
        <Button
          size="xs"
          sx={{
            mt: 1,
            width: "100%",
          }}
          onClick={loadBlockFromUrl}
          disabled={isDefinedBlock || !isValidBlockUrl || error != null}
        >
          {isDefinedBlock
            ? "Block already defined"
            : !isValidBlockUrl
            ? "Invalid URL"
            : error
            ? "An error occurred"
            : "Load Block"}
        </Button>
      )}
    </>
  );
};

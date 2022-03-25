import React, { useState, useRef, FormEvent } from "react";
import { unstable_batchedUpdates } from "react-dom";
import { tw } from "twind";

import { Button } from "../Button";
import { useBlockView } from "../../blocks/page/BlockViewContext";
import { RemoteBlockMetadata, useUserBlocks } from "../../blocks/userBlocks";

export const BlockLoaderInput: React.VFC = () => {
  const blockView = useBlockView();
  const { value: userBlocks, setValue: setUserBlocks } = useUserBlocks();

  const [error, setError] = useState(null);
  const [blockUrl, setBlockUrl] = useState("");
  const blockUrlRef = useRef<HTMLInputElement | null>(null);

  const isDefinedBlock = userBlocks.some(
    (userBlock) => userBlock.componentId === blockUrl,
  );
  const isValidBlockUrl = Boolean(blockUrlRef.current?.validity.valid);

  const inputDisabled = isDefinedBlock || !isValidBlockUrl || error != null;

  const loadBlockFromUrl = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (inputDisabled) {
      return;
    }

    // take point before any state/pm-doc changes occur
    const pos = blockView.getPos();

    blockView.manager
      .fetchAndDefineBlock(blockUrl)
      .then((blockMeta) => {
        unstable_batchedUpdates(() => {
          setError(null);
          setUserBlocks((prevUserBlocks) => [
            ...prevUserBlocks,
            blockMeta.componentMetadata as RemoteBlockMetadata,
          ]);
        });
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
    <form onSubmit={loadBlockFromUrl}>
      <input
        ref={blockUrlRef}
        type="url"
        value={blockUrl}
        onChange={(event) => setBlockUrl(event.target.value)}
        placeholder="Load Block from URL..."
        className={tw`mt-2 block w-full px-2 py-1 bg-gray-50 border-1 text-sm rounded-sm `}
        required
      />
      {blockUrl && (
        <Button
          size="xs"
          sx={{
            mt: 1,
            width: "100%",
          }}
          disabled={inputDisabled}
          type="submit"
        >
          {isDefinedBlock
            ? "Block got defined"
            : !isValidBlockUrl
            ? "Invalid URL"
            : error
            ? "An error occurred"
            : "Load Block"}
        </Button>
      )}
    </form>
  );
};

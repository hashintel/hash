import { Collapse } from "@mui/material";
import React, { useState, useRef, FormEvent } from "react";
import { unstable_batchedUpdates } from "react-dom";
import { tw } from "twind";

import { useBlockView } from "../../blocks/page/BlockViewContext";
import { useUserBlocks } from "../../blocks/userBlocks";
import { Button, TextField } from "../../shared/ui";

/** trim whitespace and remove trailing slash */
const createNormalizedBlockUrl = (url: string) => url.trim().replace(/\/$/, "");

export const BlockLoaderInput: React.VFC = () => {
  const blockView = useBlockView();
  const { value: userBlocks, setValue: setUserBlocks } = useUserBlocks();

  const [error, setError] = useState(null);
  const [blockUrl, setBlockUrl] = useState("");
  const blockUrlRef = useRef<HTMLInputElement | null>(null);

  const isDefinedBlock = userBlocks.some(
    (userBlock) =>
      createNormalizedBlockUrl(userBlock.componentId) ===
      createNormalizedBlockUrl(blockUrl),
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

    const normalizedUrl = createNormalizedBlockUrl(blockUrl);

    blockView.manager
      .fetchAndDefineBlock(normalizedUrl)
      .then((blockMeta) => {
        unstable_batchedUpdates(() => {
          setError(null);
          setUserBlocks((prevUserBlocks) => [
            ...prevUserBlocks,
            blockMeta.componentMetadata,
          ]);
        });
        return blockView.manager.createRemoteBlock(normalizedUrl);
      })
      .then((block) => {
        const { view } = blockView;
        view.dispatch(view.state.tr.insert(pos, block));
      })
      .catch((err) => {
        // eslint-disable-next-line no-console -- requires individual debugging
        console.error(
          "could not load block from url:",
          normalizedUrl,
          "\n",
          err,
        );

        // clear the error after short delay to enable retries (re-enable load button)
        setError(err);
        setTimeout(() => setError(null), 2000);
      });
  };

  return (
    <form onSubmit={loadBlockFromUrl}>
      <TextField
        size="xs"
        type="url"
        placeholder="Load Block From URL"
        required
        value={blockUrl}
        onChange={(event) => setBlockUrl(event.target.value)}
      />
      <Collapse in={!!blockUrl}>
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
            ? "Block already defined"
            : !isValidBlockUrl
            ? "Invalid URL"
            : error
            ? "An error occurred"
            : "Load Block"}
        </Button>
      </Collapse>
    </form>
  );
};

import type { FormEvent, FunctionComponent , useRef, useState } from "react";
import { unstable_batchedUpdates } from "react-dom";
import { TextField } from "@hashintel/design-system";
import { Box, Collapse } from "@mui/material";

import { useUserBlocks } from "../../../../blocks/user-blocks";
import { Button } from "../../../../shared/ui";
import { useBlockView } from "../block-view";

/** Trim whitespace and remove trailing slash */
const createNormalizedBlockUrl = (url: string) => url.trim().replace(/\/$/, "");

interface BlockLoaderInputProps {
  onLoad: () => void;
}

export const BlockLoaderInput: FunctionComponent<BlockLoaderInputProps> = ({
  onLoad,
}) => {
  const blockView = useBlockView();
  const { value: userBlocks, setValue: setUserBlocks } = useUserBlocks();

  const [error, setError] = useState(null);
  const [blockUrl, setBlockUrl] = useState("");
  const blockUrlRef = useRef<HTMLInputElement | null>(null);

  const isDefinedBlock = Boolean(userBlocks[createNormalizedBlockUrl(blockUrl)]);
  const isValidBlockUrl = Boolean(blockUrlRef.current?.validity.valid);

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
  const inputDisabled = !isValidBlockUrl || error != null;

  const loadBlockFromUrl = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (inputDisabled) {
      return;
    }

    // take point before any state/pm-doc changes occur
    const pos = blockView.getPos();
    const normalizedUrl = createNormalizedBlockUrl(blockUrl);

    blockView.manager
      .defineBlockByComponentId(normalizedUrl, { bustCache: true })
      .then((block) => {
        unstable_batchedUpdates(() => {
          setError(null);
          setUserBlocks((previousUserBlocks) => ({
            ...previousUserBlocks,
            [normalizedUrl]: block,
          }));
        });
        const renderedBlock = blockView.manager.renderBlock(normalizedUrl);

        blockView.editorView.dispatch(
          blockView.editorView.state.tr.insert(pos, renderedBlock),
        );
        onLoad();
      })
      .catch((error_) => {
         
        console.error(
          "could not load block from url:",
          normalizedUrl,
          "\n",
          error_,
        );

        // clear the error after short delay to enable retries (re-enable load button)
        setError(error_);
        setTimeout(() => { setError(null); }, 2000);
      });
  };

  return (
    <Box
      component={"form"}
      display={"flex"}
      flexDirection={"column"}
      onSubmit={loadBlockFromUrl}
    >
      <TextField
        required
        size={"xs"}
        type={"url"}
        placeholder={"Load block from URL..."}
        value={blockUrl}
        sx={{ flex: 1 }}
        InputProps={{
          inputRef: blockUrlRef,
        }}
        onChange={(event) => { setBlockUrl(event.target.value); }}
        onKeyDown={(event) => {
          event.stopPropagation();
        }}
      />
      <Collapse in={Boolean(blockUrl)}>
        <Button
          size={"xs"}
          disabled={inputDisabled}
          type={"submit"}
          sx={{
            mt: 1,
            width: "100%",
          }}
        >
          {isDefinedBlock
            ? "Re-load block"
            : !isValidBlockUrl
              ? "Invalid URL"
              : // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
                error
                ? "An error occurred"
                : "Load Block"}
        </Button>
      </Collapse>
    </Box>
  );
};

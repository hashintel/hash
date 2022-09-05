import { FunctionComponent, useEffect, useState } from "react";
import { IconButton, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { faComment } from "@fortawesome/free-regular-svg-icons";
import { faAt } from "@fortawesome/free-solid-svg-icons";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import { EditorState } from "prosemirror-state";
import { useBlockView } from "../BlockViewContext";
import { createProseMirrorState } from "@hashintel/hash-shared/createProseMirrorState";
import { EditorView } from "prosemirror-view";
import { createSchema } from "@hashintel/hash-shared/prosemirror";
import { Schema } from "prosemirror-model";
import { CommentInput } from "./CommentInput";
// import { faAt } from "@fortawesome/free-solid-svg-icons";

type CommentButtonProps = {
  className: string;
};

type BubbleIconProps = {
  opacity: number;
  onClick: () => void;
};

const BubbleIcon: FunctionComponent<BubbleIconProps> = ({
  opacity,
  onClick,
}) => (
  <IconButton
    onClick={() => onClick()}
    sx={{
      padding: 0.5,
      borderRadius: 1,
      opacity,
      transition: ({ transitions }) => transitions.create("opacity"),
    }}
  >
    <FontAwesomeIcon icon={faComment} />
  </IconButton>
);

export const CommentButton: FunctionComponent<CommentButtonProps> = ({
  className,
}) => {
  const blockView = useBlockView();

  const [active, setActive] = useState(false);

  // useEffect(() => {
  //   const schema = createSchema();

  //   const textSchema = new Schema({
  //     nodes: {
  //       text: {},
  //       doc: { content: "text*" },
  //     },
  //   });
  //   const state = EditorState.create<Schema>({
  //     doc: textSchema.node("doc", {}, [textSchema.node("text")]),
  //     // plugins: [
  //     //   ...defaultPlugins,
  //     //   createEntityStorePlugin({ accountId }),
  //     //   formatKeymap,
  //     //   ...plugins,
  //     // ],
  //   });
  //   console.log(state);

  //   const test = new EditorView(document.querySelector("#editor"), {
  //     state,
  //   });
  // }, []);

  return (
    <Box className={className} sx={{ width: active ? 350 : 32 }}>
      {active ? (
        <TextField
          placeholder="Leave a comment"
          multiline
          sx={{ padding: 1 }}
          InputProps={{
            startAdornment: (
              <BubbleIcon
                opacity={blockView.hovered ? 1 : 0}
                onClick={() => setActive(!active)}
              />
            ),
            endAdornment: (
              <IconButton
                // onClick={() => onClick()}
                sx={{
                  padding: 0.5,
                  borderRadius: 1,
                  margin: 1.5,
                }}
              >
                <FontAwesomeIcon icon={faAt} />
              </IconButton>
            ),
          }}
        />
      ) : (
        <BubbleIcon
          opacity={blockView.hovered ? 1 : 0}
          onClick={() => setActive(!active)}
        />
      )}

      <CommentInput />
    </Box>
  );
};

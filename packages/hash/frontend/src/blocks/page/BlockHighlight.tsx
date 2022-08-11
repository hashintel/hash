import { Box, Fade } from "@mui/material";
import { useEffect, useState } from "react";
import { useBlockLoadedContext } from "../onBlockLoaded";
import { useBlockView } from "./BlockViewContext";

interface HighlightProps {
  onAnimationComplete: () => void;
}

const Highlight = ({ onAnimationComplete }: HighlightProps) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => setVisible(false), []);

  return (
    <Fade
      in={visible}
      appear={false}
      timeout={5000}
      onExited={onAnimationComplete}
    >
      <Box
        sx={(theme) => ({
          position: "absolute",
          width: 6,
          top: 6,
          bottom: 6,
          borderRadius: 3,
          left: "1rem",
          background: theme.palette.blue[70],
        })}
      />
    </Fade>
  );
};

export const BlockHighlight = () => {
  const blockView = useBlockView();
  const { highlightedBlockId, setHighlightedBlockId } = useBlockLoadedContext();

  if (!highlightedBlockId || highlightedBlockId !== blockView.dom.id) {
    return null;
  }

  return <Highlight onAnimationComplete={() => setHighlightedBlockId("")} />;
};

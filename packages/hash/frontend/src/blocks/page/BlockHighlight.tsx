import { useTheme } from "@mui/material";
import { motion } from "framer-motion";
import { useBlockHighlightContext } from "../BlockHighlightContext";
import { useBlockView } from "./BlockViewContext";

interface HighlightProps {
  onAnimationComplete: () => void;
}

const Highlight = ({ onAnimationComplete }: HighlightProps) => {
  const theme = useTheme();

  return (
    <motion.div
      animate={{ opacity: 0 }}
      transition={{ duration: 4 }}
      onAnimationComplete={onAnimationComplete}
      style={{
        position: "absolute",
        width: 6,
        top: 6,
        bottom: 6,
        borderRadius: 3,
        left: "1rem",
        background: theme.palette.blue[70],
      }}
    />
  );
};

export const BlockHighlight = () => {
  const blockView = useBlockView();
  const { highlightedBlockId, setHighlightedBlockId } =
    useBlockHighlightContext();

  if (!highlightedBlockId || highlightedBlockId !== blockView.dom.id) {
    return null;
  }

  return <Highlight onAnimationComplete={() => setHighlightedBlockId("")} />;
};

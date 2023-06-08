import { LinkIcon } from "@hashintel/design-system";
import {
  Divider,
  Paper,
  Stack,
  styled,
  ToggleButton,
  toggleButtonClasses,
  useTheme,
} from "@mui/material";
import { FunctionComponent } from "react";

import { BoldIcon } from "../../../shared/icons/bold-icon";
import { HighlighterIcon } from "../../../shared/icons/hightlighter-icon";
import { ItalicIcon } from "../../../shared/icons/italic-icon";
import { StrikethroughIcon } from "../../../shared/icons/strikethrough-icon";
import { UnderlineIcon } from "../../../shared/icons/underline-icon";

const FormatButton = styled(ToggleButton)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  cursor: "pointer",
  px: 1.5,
  py: 1,
  height: 34,
  borderWidth: 0,
  borderRadius: 0,

  backgroundColor: theme.palette.white,
  color: theme.palette.gray[80],
  fill: theme.palette.gray[60],

  [`&.${toggleButtonClasses.selected}`]: {
    backgroundColor: theme.palette.gray[20],
    color: theme.palette.gray[90],
    fill: theme.palette.gray[70],
  },
}));

interface MarksTooltipProps {
  activeMarks: { name: string; attrs?: Record<string, string> }[];
  toggleMark: (name: string, attrs?: Record<string, string>) => void;
  focusEditorView: () => void;
  openLinkModal: () => void;
}

const marks = [
  {
    name: "strong",
    Icon: BoldIcon,
  },
  {
    name: "em",
    Icon: ItalicIcon,
  },
  {
    name: "underlined",
    Icon: UnderlineIcon,
  },
  {
    name: "strikethrough",
    Icon: StrikethroughIcon,
  },
  {
    name: "highlighted",
    Icon: HighlighterIcon,
  },
];

export const MarksTooltip: FunctionComponent<MarksTooltipProps> = ({
  activeMarks,
  toggleMark,
  focusEditorView,
  openLinkModal,
}) => {
  const theme = useTheme();

  return (
    <Paper
      elevation={4}
      sx={{
        display: "flex",
        overflow: "hidden",
        position: "absolute",
        left: "50%",
        marginTop: -1,
        transform: "translate(-50%, -100%)",
        zIndex: "10",
      }}
    >
      <Stack
        direction="row"
        sx={({ palette }) => ({
          overflow: "hidden",
          border: `1px solid ${palette.gray[20]}`,
          borderRightWidth: 0,
          borderTopLeftRadius: 4,
          borderBottomLeftRadius: 4,
        })}
      >
        <FormatButton
          value="link"
          selected={activeMarks.some((mark) => mark.name === "link")}
          onClick={() => {
            openLinkModal();
            focusEditorView();
          }}
        >
          <LinkIcon
            sx={{
              fill: "inherit",
              fontSize: 16,
              mr: 0.5,
            }}
          />
          Link
        </FormatButton>
      </Stack>

      <Divider
        color={theme.palette.gray[30]}
        sx={{ width: "1px", color: "red" }}
      />

      <Stack
        direction="row"
        sx={({ palette }) => ({
          p: 0.125,
          gap: 0.125,
          overflow: "hidden",
          border: `1px solid ${palette.gray[20]}`,
          borderLeftWidth: 0,
          borderTopRightRadius: 4,
          borderBottomRightRadius: 4,
        })}
      >
        {marks.map(({ name, Icon }) => (
          <FormatButton
            value={name}
            sx={{
              px: 1,
              height: 32,
              borderRadius: 0.5,
              fill: theme.palette.gray[80],

              [`&.${toggleButtonClasses.selected}`]: {
                fill: theme.palette.gray[90],
              },
            }}
            key={name}
            onClick={() => {
              toggleMark(name);
              focusEditorView();
            }}
            selected={activeMarks.some((mark) => mark.name === name)}
          >
            <Icon
              sx={{
                fill: "inherit",
                fontSize: 16,
              }}
            />
          </FormatButton>
        ))}
      </Stack>
    </Paper>
  );
};

import { CSSProperties, FunctionComponent } from "react";
import { DropdownIcon } from "../../../shared/icons";

interface MarksTooltipProps {
  activeMarks: { name: string; attrs?: Record<string, string> }[];
  toggleMark: (name: string, attrs?: Record<string, string>) => void;
  focusEditorView: () => void;
  openLinkModal: () => void;
}

const marks = [
  {
    name: "strong",
    text: "B",
  },
  {
    name: "em",
    text: "I",
  },
  {
    name: "underlined",
    text: "U",
  },
  {
    name: "link",
    text: "Link",
  },
];

export const MarksTooltip: FunctionComponent<MarksTooltipProps> = ({
  activeMarks,
  toggleMark,
  focusEditorView,
  openLinkModal,
}) => {
  const getMarkBtnStyle = (name: string): CSSProperties => {
    const isActive = activeMarks.find((mark) => mark.name === name);

    if (isActive) {
      if (name === "link") {
        return {
          color: "#3B82F6",
        };
      }

      return {
        backgroundColor: "#3B82F6",
        color: "#ffffff",
      };
    } else {
      return {
        backgroundColor: "#ffffff",
        color: "#000000",
      };
    }
  };

  const handleToggleMark = (name: string) => {
    if (name === "link") {
      openLinkModal();
    } else {
      toggleMark(name);
    }

    focusEditorView();
  };

  return (
    <div
      style={{
        boxShadow:
          "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
        left: "50%",
        marginTop: "-0.25rem",
        position: "absolute",
        transform: "translate(-50%, -100%)",
        zIndex: "10",
      }}
    >
      <div
        style={{
          display: "flex",
          backgroundColor: "#ffffff",
        }}
      >
        {marks.map(({ name, text }) => (
          <button
            style={{
              alignItems: "center",
              borderColor: "#D1D5DB",
              borderWidth: "0",
              cursor: "pointer",
              display: "flex",
              paddingBottom: "0.25rem",
              paddingLeft: "1rem",
              paddingRight: "1rem",
              paddingTop: "0.25rem",
              ...getMarkBtnStyle(name),
            }}
            key={name}
            onClick={() => handleToggleMark(name)}
            type="button"
          >
            {text}
            {name === "link" && (
              <DropdownIcon
                style={{
                  marginLeft: "0.5rem",
                }}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

import { css } from "@hashintel/ds-helpers/css";

import { useEditorContext } from "./editor-context";
import { NetSelector } from "./net-selector";

// Inline editable field component
const EditableField = ({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
}) => (
  <input
    type="text"
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    className={css({
      background: "[transparent]",
      border: "none",
      fontSize: "size.textsm",
      fontWeight: "medium",
      color: "core.gray.90",
      padding: "spacing.2",
      _focus: {
        outline: "1px solid",
        outlineColor: "core.blue.70",
        borderRadius: "radius.4",
      },
    })}
  />
);

// Simple angle right icon
const AngleRightIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M6 4l4 4-4 4V4z" />
  </svg>
);

export const TitleAndNetSelect = () => {
  const { existingNets, loadPetriNet, parentNet, petriNetId, setTitle, title } =
    useEditorContext();

  return (
    <div
      className={css({
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        background: "core.gray.10",
        borderBottom: "1px solid",
        borderBottomColor: "core.gray.20",
        paddingY: "spacing.3",
        paddingX: "spacing.6",
      })}
    >
      <div
        className={css({
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: "spacing.3",
        })}
      >
        {parentNet && (
          <>
            <button
              type="button"
              onClick={() => {
                loadPetriNet(parentNet.parentNetId);
              }}
              className={css({
                background: "[transparent]",
                border: "none",
                color: "core.gray.80",
                cursor: "pointer",
                transition: "[color 150ms]",
                whiteSpace: "nowrap",
                _hover: {
                  color: "core.gray.90",
                },
              })}
            >
              {parentNet.title}
            </button>
            <span
              className={css({
                fontSize: "[14px]",
                color: "core.gray.50",
              })}
            >
              <AngleRightIcon />
            </span>
          </>
        )}
        <EditableField
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Process"
        />
      </div>

      <NetSelector
        disabledOptions={petriNetId ? [petriNetId] : undefined}
        key={petriNetId}
        onSelect={(net) => {
          loadPetriNet(net.netId);
        }}
        options={existingNets.map((net) => ({
          netId: net.netId,
          title: net.title,
        }))}
        value={petriNetId}
      />
    </div>
  );
};

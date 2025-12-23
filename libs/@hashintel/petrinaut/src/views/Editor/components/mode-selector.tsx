import { SegmentGroup } from "@ark-ui/react/segment-group";
import { css, cva } from "@hashintel/ds-helpers/css";
import { refractive } from "@hashintel/refractive";

export interface ModeSelectorProps {
  mode: "edit" | "simulate";
  onChange: (mode: "edit" | "simulate") => void;
}

const refractiveContainerStyle = css({
  borderRadius: "[12px]",
  backgroundColor: "[rgba(255, 255, 255, 0.6)]",
  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.15)",
});

const segmentRootStyle = css({
  padding: "spacing.3",
  display: "flex",
  gap: "spacing.1",
  position: "relative",
});

const segmentIndicatorStyle = css({
  position: "absolute",
  width: "var(--width)",
  height: "var(--height)",
  left: "var(--left)",
  top: "var(--top)",
  backgroundColor: "[black]",
  borderRadius: "[8px]",
  transition: "[all 200ms cubic-bezier(0.4, 0, 0.2, 1)]",
  zIndex: 0,
});

const segmentItemStyle = css({
  position: "relative",
  zIndex: 1,
  padding: "spacing.3",
  fontSize: "size.textsm",
  fontWeight: "medium",
  cursor: "pointer",
  transition: "[color 200ms]",
  borderRadius: "[8px]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "[80px]",
});

const segmentItemTextStyle = cva({
  base: {
    transition: "[color 200ms]",
  },
  variants: {
    selected: {
      true: {
        color: "[white]",
      },
      false: {
        color: "core.gray.70",
      },
    },
  },
});

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  mode,
  onChange,
}) => {
  const options = [
    { name: "Edit", value: "edit" },
    { name: "Simulate", value: "simulate" },
  ];

  return (
    <div>
      <refractive.div
        className={refractiveContainerStyle}
        refraction={{
          radius: 12,
          blur: 3,
          bezelWidth: 18,
          glassThickness: 100,
        }}
      >
        <SegmentGroup.Root
          value={mode}
          onValueChange={(details) => {
            if (details.value) {
              onChange(details.value as "edit" | "simulate");
            }
          }}
          className={segmentRootStyle}
        >
          <SegmentGroup.Indicator className={segmentIndicatorStyle} />

          {options.map((option) => (
            // Ark UI uses string values; our mode union matches these option values.
            <SegmentGroup.Item
              key={option.value}
              value={option.value}
              className={segmentItemStyle}
            >
              <SegmentGroup.ItemText
                className={segmentItemTextStyle({
                  selected: mode === option.value,
                })}
              >
                {option.name}
              </SegmentGroup.ItemText>
              <SegmentGroup.ItemControl />
              <SegmentGroup.ItemHiddenInput />
            </SegmentGroup.Item>
          ))}
        </SegmentGroup.Root>
      </refractive.div>
    </div>
  );
};

import { SegmentGroup } from "@ark-ui/react/segment-group";
import { css, cva } from "@hashintel/ds-helpers/css";
import { refractive } from "@hashintel/refractive";

import { Tooltip } from "../../../components/tooltip";

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

const segmentItemStyle = cva({
  base: {
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
  },
  variants: {
    disabled: {
      true: {
        cursor: "not-allowed",
        opacity: "[0.5]",
        pointerEvents: "none",
      },
    },
  },
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
    { name: "Edit", value: "edit", disabled: false },
    { name: "Simulate", value: "simulate", disabled: true },
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
              const selectedOption = options.find(
                (opt) => opt.value === details.value
              );
              if (selectedOption && !selectedOption.disabled) {
                onChange(details.value as "edit" | "simulate");
              }
            }
          }}
          className={segmentRootStyle}
        >
          <SegmentGroup.Indicator className={segmentIndicatorStyle} />

          {options.map((option) => {
            const item = (
              <SegmentGroup.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className={segmentItemStyle({ disabled: option.disabled })}
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
            );

            if (option.disabled) {
              return (
                <Tooltip
                  key={option.value}
                  content="Simulate tab is disabled temporarily. Simulation is available in Edit Mode."
                >
                  <span>{item}</span>
                </Tooltip>
              );
            }

            return item;
          })}
        </SegmentGroup.Root>
      </refractive.div>
    </div>
  );
};

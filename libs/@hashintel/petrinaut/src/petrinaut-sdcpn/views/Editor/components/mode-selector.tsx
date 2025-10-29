import { SegmentGroup } from "@ark-ui/react/segment-group";
import { RefractivePane } from "@hashintel/ds-components/refractive-pane";
import { css } from "@hashintel/ds-helpers/css";

export interface ModeSelectorProps {
  mode: "edit" | "simulate";
  onChange: (mode: "edit" | "simulate") => void;
}

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
      <RefractivePane
        radius={12}
        blur={1.5}
        specularOpacity={0}
        scaleRatio={1}
        bezelWidth={20}
        glassThickness={120}
        refractiveIndex={1.5}
        className={css({
          // padding: "[12px]",
          borderRadius: "[12px]",
          backgroundColor: "[rgba(255, 255, 255, 0.8)]",
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.15)",
        })}
        style={{
          padding: "4px",
        }}
      >
        <SegmentGroup.Root
          value={mode}
          onValueChange={(details) => {
            if (details.value) {
              onChange(details.value as "edit" | "simulate");
            }
          }}
          className={css({
            padding: "[12px]",
            display: "flex",
            gap: "spacing.1",
            position: "relative",
          })}
        >
          <SegmentGroup.Indicator
            className={css({
              position: "absolute",
              width: "var(--width)",
              height: "var(--height)",
              left: "var(--left)",
              top: "var(--top)",
              backgroundColor: "[black]",
              borderRadius: "[8px]",
              transition: "[all 200ms cubic-bezier(0.4, 0, 0.2, 1)]",
              zIndex: 0,
            })}
          />

          {options.map((option) => (
            <SegmentGroup.Item
              key={option.value}
              value={option.value}
              className={css({
                position: "relative",
                zIndex: 1,
                padding: "spacing.2",
                paddingX: "spacing.4",
                fontSize: "size.textsm",
                fontWeight: "medium",
                cursor: "pointer",
                transition: "[color 200ms]",
                borderRadius: "[8px]",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "[80px]",
              })}
              style={{
                padding: "4px 4px",
              }}
            >
              <SegmentGroup.ItemText
                className={css({
                  color: mode === option.value ? "[white]" : "core.gray.70",
                  transition: "[color 200ms]",
                })}
              >
                {option.name}
              </SegmentGroup.ItemText>
              <SegmentGroup.ItemControl />
              <SegmentGroup.ItemHiddenInput />
            </SegmentGroup.Item>
          ))}
        </SegmentGroup.Root>
      </RefractivePane>
    </div>
  );
};

import { Portal } from "@ark-ui/react/portal";
import { createListCollection, Select } from "@ark-ui/react/select";
import { TbChevronDown } from "react-icons/tb";

// Pool of 10 well-differentiated colors for types
const TYPE_COLOR_POOL = [
  { value: "#3b82f6", label: "Blue" },
  { value: "#ef4444", label: "Red" },
  { value: "#10b981", label: "Green" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#ec4899", label: "Pink" },
  { value: "#14b8a6", label: "Teal" },
  { value: "#f97316", label: "Orange" },
  { value: "#6366f1", label: "Indigo" },
  { value: "#84cc16", label: "Lime" },
];

interface ColorSelectProps {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}

export const ColorSelect: React.FC<ColorSelectProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const collection = createListCollection({ items: TYPE_COLOR_POOL });

  return (
    <Select.Root
      collection={collection}
      value={[value]}
      onValueChange={(details) => {
        const selectedColor = details.value[0];
        if (selectedColor) {
          onChange(selectedColor);
        }
      }}
      disabled={disabled}
      positioning={{ sameWidth: true }}
    >
      <Select.Control>
        <Select.Trigger
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: "6px 8px",
            border: "1px solid rgba(0, 0, 0, 0.1)",
            borderRadius: 4,
            backgroundColor: disabled ? "rgba(0, 0, 0, 0.05)" : "white",
            cursor: disabled ? "not-allowed" : "pointer",
            fontSize: 14,
            width: "100%",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: 3,
                backgroundColor: value,
                border: "1px solid rgba(0, 0, 0, 0.1)",
                flexShrink: 0,
              }}
            />
            <div style={{ fontSize: 12, fontFamily: "monospace" }}>{value}</div>
          </div>
          <Select.Indicator>
            <TbChevronDown style={{ fontSize: 16, color: "#666" }} />
          </Select.Indicator>
        </Select.Trigger>
      </Select.Control>
      <Portal>
        <Select.Positioner>
          <Select.Content
            style={{
              backgroundColor: "white",
              border: "1px solid rgba(0, 0, 0, 0.1)",
              borderRadius: 4,
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
              padding: 4,
              zIndex: 1000,
            }}
          >
            <Select.ItemGroup>
              {collection.items.map((item) => (
                <Select.Item
                  key={item.value}
                  item={item}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "8px 10px",
                    cursor: "pointer",
                    borderRadius: 3,
                    fontSize: 13,
                    transition: "background-color 0.15s ease",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 3,
                        backgroundColor: item.value,
                        border: "1px solid rgba(0, 0, 0, 0.1)",
                        flexShrink: 0,
                      }}
                    />
                    <Select.ItemText>
                      <div style={{ fontSize: 12, fontFamily: "monospace" }}>
                        {item.value}
                      </div>
                    </Select.ItemText>
                  </div>
                  <Select.ItemIndicator>
                    <span style={{ fontSize: 14, color: "#3b82f6" }}>✓</span>
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.ItemGroup>
          </Select.Content>
        </Select.Positioner>
      </Portal>
      <Select.HiddenSelect />
    </Select.Root>
  );
};

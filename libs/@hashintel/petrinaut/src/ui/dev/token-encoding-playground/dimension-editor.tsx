import { Button, Select, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { PlaygroundDimension } from "./physical-layout";
import type { SelectItem } from "@hashintel/ds-components";
import type { ColorElementType } from "@hashintel/petrinaut-core";

export type DimensionEditorProps = {
  dimensions: PlaygroundDimension[];
  onChange: (dimensions: PlaygroundDimension[]) => void;
};

const typeOptions: SelectItem<ColorElementType>[] = [
  { value: "real", text: "Real" },
  { value: "integer", text: "Integer" },
  { value: "boolean", text: "Boolean" },
  { value: "uuid", text: "UUID" },
  { value: "string", text: "String" },
];

const listStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
});

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
});

const nameInputStyle = css({
  display: "flex",
  flex: "[1]",
  minWidth: "[0]",

  "& input": {
    fontFamily: "mono",
  },
});

const typeSelectStyle = css({
  width: "[110px]",
  flexShrink: 0,
});

/**
 * Store-free version of the type-properties dimension list: local state only,
 * for the playground story.
 */
export const DimensionEditor: React.FC<DimensionEditorProps> = ({
  dimensions,
  onChange,
}) => {
  const updateAt = (index: number, update: Partial<PlaygroundDimension>) => {
    onChange(
      dimensions.map((dimension, dimensionIndex) =>
        dimensionIndex === index ? { ...dimension, ...update } : dimension,
      ),
    );
  };

  return (
    <div className={listStyle}>
      {dimensions.map((dimension, index) => (
        // eslint-disable-next-line react/no-array-index-key -- rows are positional
        <div key={index} className={rowStyle}>
          <TextInput
            value={dimension.name}
            size="sm"
            width="fullWidth"
            className={nameInputStyle}
            placeholder="dimension_name"
            onChange={(name) => updateAt(index, { name })}
            connectToRightInput
          />
          <Select
            required
            value={dimension.type}
            onChange={(type) => updateAt(index, { type })}
            items={typeOptions}
            size="sm"
            className={typeSelectStyle}
            connectToLeftInput
          />
          <Button
            onClick={() =>
              onChange(dimensions.filter((_, other) => other !== index))
            }
            size="xxs"
            variant="ghost"
            iconName="close"
            aria-label={`Remove dimension ${dimension.name}`}
          />
        </div>
      ))}
      <Button
        onClick={() =>
          onChange([
            ...dimensions,
            // First free dim_N: length alone can collide after removals.
            {
              name: (() => {
                let index = dimensions.length;
                while (dimensions.some((d) => d.name === `dim_${index}`)) {
                  index++;
                }
                return `dim_${index}`;
              })(),
              type: "real",
            },
          ])
        }
        size="xs"
        variant="ghost"
        iconName="plus"
      >
        Add dimension
      </Button>
    </div>
  );
};

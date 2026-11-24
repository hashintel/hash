/**
 * The dimensions of the token type, one row each: a name, a type, and a
 * button that removes the row.
 */

import { COLOR_ELEMENT_TYPES } from "@hashintel/petrinaut-core";

import { isNameShared } from "./encode-token";

import type { Dimension } from "./encode-token";

/** The first `dim_N` no dimension has; a count alone repeats after a removal. */
const unusedName = (dimensions: readonly Dimension[]): string => {
  let index = dimensions.length;
  while (dimensions.some((dimension) => dimension.name === `dim_${index}`)) {
    index += 1;
  }
  return `dim_${index}`;
};

export const DimensionList = ({
  dimensions,
  onChange,
}: {
  dimensions: Dimension[];
  onChange: (dimensions: Dimension[]) => void;
}) => {
  const change = (index: number, changed: Partial<Dimension>) =>
    onChange(
      dimensions.map((dimension, at) =>
        at === index ? { ...dimension, ...changed } : dimension,
      ),
    );

  return (
    <div className="pnd-dimensions">
      {dimensions.map((dimension, index) => (
        // A row is its position: two dimensions may share a name while typing,
        // which the encoding refuses and each of the two rows marks.
        <div key={index} className="pnd-dimension">
          <input
            aria-label={`Name of dimension ${index + 1}`}
            aria-invalid={isNameShared(dimensions, dimension.name)}
            spellCheck={false}
            value={dimension.name}
            onChange={(event) => change(index, { name: event.target.value })}
          />
          <select
            aria-label={`Type of ${dimension.name}`}
            value={dimension.type}
            onChange={(event) => {
              const type = COLOR_ELEMENT_TYPES.find(
                (candidate) => candidate === event.target.value,
              );
              if (type !== undefined) {
                change(index, { type });
              }
            }}
          >
            {COLOR_ELEMENT_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
          <button
            type="button"
            aria-label={`Remove ${dimension.name}`}
            onClick={() => onChange(dimensions.filter((_, at) => at !== index))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([
            ...dimensions,
            { name: unusedName(dimensions), type: "real" },
          ])
        }
      >
        Add dimension
      </button>
    </div>
  );
};

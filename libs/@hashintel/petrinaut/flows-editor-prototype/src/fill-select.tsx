import { Select as DsSelect } from "@hashintel/ds-components";

type DsSelectProps<TValue extends string> = Parameters<
  typeof DsSelect<TValue>
>[0];

/**
 * The code-ds Select with the Flows selected-row style: a single Select marks
 * the picked row with the fill instead of the tick. Multi selects keep their
 * checkboxes.
 */
export const Select = <TValue extends string>(
  props: DsSelectProps<TValue>,
) => {
  if (props.multiple) {
    return <DsSelect {...props} />;
  }
  const items = props.items.map((entry) =>
    "items" in entry
      ? {
          ...entry,
          items: entry.items.map((item) => ({
            ...item,
            selectedStyle: "highlight" as const,
          })),
        }
      : { ...entry, selectedStyle: "highlight" as const },
  );
  return <DsSelect {...props} items={items} />;
};

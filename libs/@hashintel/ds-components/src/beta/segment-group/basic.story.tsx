import * as SegmentGroup from "./segment-group";

export const App = () => {
  const items = ["React", "Solid", "Svelte", "Vue"];

  return (
    <SegmentGroup.Root defaultValue="React">
      <SegmentGroup.Indicator />
      <SegmentGroup.Items items={items} />
    </SegmentGroup.Root>
  );
};

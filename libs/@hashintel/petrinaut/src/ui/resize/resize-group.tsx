// oxlint-disable-next-line no-restricted-imports -- the one place that hands the library its group
import { Group, type GroupProps } from "react-resizable-panels";

/**
 * A group of `react-resizable-panels`: what every split of the editor is.
 *
 * The library shows its resize cursor with a style rule for every element of
 * the document, which it writes when the pointer comes within reach of a
 * separator and removes when the pointer leaves. Each write makes the browser
 * work out the style of the whole editor again. This group turns that off,
 * and a separator shows the cursor on the strip a pointer grabs it by.
 */
export const ResizeGroup = (props: Omit<GroupProps, "disableCursor">) => (
  <Group {...props} disableCursor />
);

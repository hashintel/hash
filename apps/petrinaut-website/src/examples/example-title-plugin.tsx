import { css } from "@hashintel/ds-helpers/css";
import { useTitle } from "@hashintel/petrinaut/react";
import { definePetrinautPlugin } from "@hashintel/petrinaut/ui";

const titleStyle = css({
  minWidth: "0",
  overflow: "hidden",
  color: "neutral.s90",
  fontSize: "sm",
  fontWeight: "medium",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const ExampleTitle = () => <span className={titleStyle}>{useTitle()}</span>;

/**
 * The example's title as plain text at the start of the top bar. The review
 * pages hide the editor's title field, which is an input, and show this
 * instead.
 */
export const exampleTitlePlugin = definePetrinautPlugin({
  id: "website.example-title",
  name: "Example title",
  topBarItems: [
    {
      id: "website.example-title.title",
      placement: "top-bar-start",
      component: ExampleTitle,
    },
  ],
});

import { Button, Icon, Menu, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { UI_MESSAGES } from "../../../../constants/ui-messages";

const aiMenuItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
});

/**
 * The "More options" menu in the header of a code section: it loads the
 * section's default template, and holds the place of generating the code.
 */
export const CodeTemplateMenu: React.FC<{
  onLoadDefault: () => void;
  disabled?: boolean;
}> = ({ onLoadDefault, disabled }) => (
  <Menu
    trigger={
      <Button
        disabled={disabled}
        aria-label="More options"
        tooltip="More options"
        variant="ghost"
        size="xs"
        iconName="ellipsisVertical"
      />
    }
    items={[
      {
        id: "load-default",
        text: "Load default template",
        onClick: onLoadDefault,
      },
      {
        id: "generate-ai",
        text: (
          <Tooltip
            content={UI_MESSAGES.AI_FEATURE_COMING_SOON}
            position="bottom"
          >
            <div className={aiMenuItemStyle}>
              <Icon name="sparkles" size="sm" />
              Generate with AI
            </div>
          </Tooltip>
        ),
        disabled: true,
        onClick: () => {
          // TODO: Implement AI generation
        },
      },
    ]}
  />
);

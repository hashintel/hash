import { Button, Chip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

export type PromptChip = {
  id: string;
  label: string;
  prompt: string;
};

/**
 * Quick-action chips shown when the net already has content — they ask the
 * AI to audit or describe the existing model rather than build from scratch.
 */
export const REVIEW_CHIPS: PromptChip[] = [
  {
    id: "suggest-improvements",
    label: "Suggest improvements",
    prompt:
      "Review the current Petri net and suggest a few improvements. Don't make changes yet — let me choose.",
  },
  {
    id: "review-completeness",
    label: "Review completeness",
    prompt:
      "Review the current Petri net for completeness. Anything implied by the domain that isn't modelled?",
  },
  {
    id: "explain-this-model",
    label: "Explain this model",
    prompt:
      "Explain this Petri net in plain terms — what the modelled process is, the role of each feature, etc.",
  },
];

const containerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  minWidth: "[0]",
});

const railStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  flex: "[1]",
  minWidth: "[0]",
  flexWrap: "wrap",
});

const chipStyle = css({
  flexShrink: 0,
});

const chipDisabledStyle = css({
  opacity: "[0.5]",
  pointerEvents: "none",
});

const dismissStyle = css({
  flexShrink: 0,
  color: "neutral.s80",
  _hover: {
    color: "neutral.s110",
  },
});

export type PromptChipsProps = {
  chips: PromptChip[];
  disabled?: boolean;
  onDismiss: () => void;
  onSelect: (prompt: string) => void;
};

export const PromptChips = ({
  chips,
  disabled = false,
  onDismiss,
  onSelect,
}: PromptChipsProps) => {
  if (chips.length === 0) {
    return null;
  }

  return (
    <div className={containerStyle}>
      <div className={railStyle} data-prompt-chips data-wrap>
        {chips.map((chip) => (
          <Chip
            key={chip.id}
            className={cx(chipStyle, disabled && chipDisabledStyle)}
            variant="soft"
            shape="round"
            aria-disabled={disabled || undefined}
            onClick={disabled ? undefined : () => onSelect(chip.prompt)}
          >
            {chip.label}
          </Chip>
        ))}
      </div>
      <Button
        className={dismissStyle}
        size="xs"
        variant="ghost"
        tone="neutral"
        iconName="close"
        aria-label="Dismiss quick actions"
        onClick={onDismiss}
        tooltip="Dismiss quick actions"
      />
    </div>
  );
};

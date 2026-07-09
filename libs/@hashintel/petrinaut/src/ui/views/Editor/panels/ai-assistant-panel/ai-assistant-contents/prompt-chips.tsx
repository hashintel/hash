import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

export type PromptChip = {
  id: string;
  label: string;
  prompt: string;
};

/**
 * Quick-action chips shown when the net is empty — they kick off a
 * domain-shaped build with the AI's interview-first behaviour taking over.
 */
export const STARTER_CHIPS: PromptChip[] = [
  {
    id: "supply-chain",
    label: "Supply chain",
    prompt:
      "Build a supply-chain SDCPN — orders flowing through warehouses, in-transit, and delivered states. Interview me first for more details.",
  },
  {
    id: "epidemic",
    label: "Epidemic",
    prompt:
      "Build an SIR-style epidemic model with susceptible, infected, and recovered places. Interview me first for more details.",
  },
  {
    id: "surprise-me",
    label: "Surprise me",
    prompt:
      "Pick an interesting domain and build a small but complete SDCPN end-to-end — use all available features (including place visualizers).",
  },
];

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
  gap: "1",
  flex: "[1]",
  minWidth: "[0]",
  overflowX: "auto",
  scrollbarWidth: "[none]",
  "&::-webkit-scrollbar": {
    display: "none",
  },
});

const chipStyle = css({
  flexShrink: 0,
  backgroundColor: "white",
  _hover: {
    backgroundColor: "neutral.s10",
  },
  _disabled: {
    backgroundColor: "white",
  },
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
      <div className={railStyle}>
        {chips.map((chip) => (
          <Button
            key={chip.id}
            className={chipStyle}
            size="xs"
            variant="subtle"
            tone="neutral"
            disabled={disabled}
            onClick={() => onSelect(chip.prompt)}
          >
            {chip.label}
          </Button>
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

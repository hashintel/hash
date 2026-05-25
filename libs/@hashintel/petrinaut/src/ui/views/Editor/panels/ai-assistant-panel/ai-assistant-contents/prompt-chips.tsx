import { css } from "@hashintel/ds-helpers/css";

import { Button } from "../../../../../components/button";

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
      "Build a small supply-chain SDCPN — orders flowing through warehouses, in-transit, and delivered states. Interview me briefly about volumes and lead times first, then build it with a couple of useful metrics and scenarios.",
  },
  {
    id: "manufacturing-line",
    label: "Manufacturing line",
    prompt:
      "Build a small manufacturing line with stations, buffers, and rework. Ask me a couple of clarifying questions about throughput, cycle times, and failure rates first, then build it with relevant metrics and scenarios.",
  },
  {
    id: "epidemic",
    label: "Epidemic",
    prompt:
      "Build an SIR-style epidemic model with susceptible, infected, and recovered places. Ask me briefly about population size and transmission/recovery rates, then add a couple of useful metrics (peak prevalence, attack rate) and a baseline-vs-intervention scenario.",
  },
  {
    id: "surprise-me",
    label: "Surprise me",
    prompt:
      "Pick an interesting domain and build a small but complete SDCPN end-to-end — places, transitions, parameters, one or two scenarios, and a couple of metrics. Use sensible defaults throughout and tell me the choices you made.",
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
      "Review the current Petri net and suggest improvements. Look at naming, structure, missing transitions, parameter tunability, scenario coverage, and code quality. Don't make changes yet — just list the proposals so I can pick which to apply.",
  },
  {
    id: "review-completeness",
    label: "Review completeness",
    prompt:
      "Review the current Petri net for completeness. Are there states or transitions implied by the domain that I haven't modelled? Any places without producers or consumers? Inputs the simulation can't reach, or outputs that go nowhere? List any gaps you find.",
  },
  {
    id: "explain-this-model",
    label: "Explain this model",
    prompt:
      "Explain this Petri net in plain English — what the modelled process is, the role of each place and transition, what the parameters represent, what the scenarios are testing, and what the metrics measure. Aim for someone who's never seen this net before.",
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
        tooltipDisplay="inline"
      />
    </div>
  );
};

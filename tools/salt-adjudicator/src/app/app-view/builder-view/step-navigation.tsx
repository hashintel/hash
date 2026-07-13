import type { BuilderState, BuilderStep } from "../../app-controller/model.ts";

const STEPS: ReadonlyArray<{
  id: BuilderStep;
  label: string;
}> = [
  { id: "import", label: "Import" },
  { id: "qualification", label: "Anchors" },
  { id: "planning", label: "Plan" },
  { id: "review", label: "Review" },
  { id: "result", label: "Bundle" },
];

const canOpenStep = (step: BuilderStep, builder: BuilderState): boolean => {
  if (step === "import") {
    return true;
  }
  if (step === "qualification" || step === "planning") {
    return builder.cards !== null;
  }
  if (step === "review") {
    return builder.plan !== null;
  }
  return builder.result !== null;
};

export const StepNavigation = ({
  builder,
  onSelect,
}: {
  builder: BuilderState;
  onSelect: (step: BuilderStep) => void;
}) => (
  <nav class="builder-step-navigation" aria-label="Study builder steps">
    <ol>
      {STEPS.map((step, stepIndex) => (
        <li key={step.id}>
          <button
            type="button"
            aria-current={builder.step === step.id ? "step" : undefined}
            disabled={!canOpenStep(step.id, builder)}
            onClick={() => onSelect(step.id)}
          >
            <span>{String(stepIndex + 1).padStart(2, "0")}</span>
            {step.label}
          </button>
        </li>
      ))}
    </ol>
  </nav>
);

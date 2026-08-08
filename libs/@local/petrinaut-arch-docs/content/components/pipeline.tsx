/**
 * A numbered left-to-right chain of steps, wrapping on narrow screens.
 *
 * Used where the old HTML pages drew an arrow chain: the compilation pipeline,
 * the fixed order of a simulation step, the metrics pipeline.
 */

import "./diagram.css";
import { Inline } from "./inline";

export interface StepSpec {
  label: string;
  note?: string;
}

export interface PipelineProps {
  title?: string;
  steps: StepSpec[];
  /** Numbers the steps. Off for pipelines where order is not a sequence. */
  numbered?: boolean;
}

export const Pipeline = ({ title, steps, numbered = false }: PipelineProps) => (
  <figure className="pnd">
    {title === undefined ? null : (
      <figcaption className="pnd-title">{title}</figcaption>
    )}
    <div className="pnd-pipeline">
      {steps.map((step, index) => (
        // A fragment per step so the separator sits between, not inside, boxes.
        <Step
          key={index}
          index={index}
          last={index === steps.length - 1}
          numbered={numbered}
          step={step}
        />
      ))}
    </div>
  </figure>
);

const Step = ({
  index,
  last,
  numbered,
  step,
}: {
  index: number;
  last: boolean;
  numbered: boolean;
  step: StepSpec;
}) => (
  <>
    <div className="pnd-step">
      {numbered ? <div className="pnd-step-index">{index + 1}</div> : null}
      <div className="pnd-box-label">
        <Inline text={step.label} />
      </div>
      {step.note === undefined ? null : (
        <div className="pnd-box-note">
          <Inline text={step.note} />
        </div>
      )}
    </div>
    {last ? null : (
      <div aria-hidden="true" className="pnd-arrow">
        →
      </div>
    )}
  </>
);

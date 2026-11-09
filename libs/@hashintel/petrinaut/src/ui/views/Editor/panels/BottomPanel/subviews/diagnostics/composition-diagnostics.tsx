import { use, useState } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { ActiveNetContext } from "../../../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { problemTextStyle } from "../../../../../../constants/problem-severity";
import {
  bulletStyle,
  countOf,
  diagnosticButtonStyle,
  diagnosticItemStyle,
  DiagnosticsGroup,
  diagnosticsListStyle,
} from "./diagnostics-group";

import type { CompositionProblem } from "@hashintel/petrinaut-core";

/**
 * The problems with the net's composition: its fusions, its ports and its
 * interfaces. Clicking one opens the net it is in and selects the fusion,
 * the port or the instance.
 */
export const CompositionDiagnostics = ({
  problems,
}: {
  problems: CompositionProblem[];
}) => {
  const { setActiveSubnetId } = use(ActiveNetContext);
  const { selectItem } = use(EditorContext);
  const [isExpanded, setIsExpanded] = useState(true);
  const countWith = (severity: CompositionProblem["severity"]) =>
    problems.filter((problem) => problem.severity === severity).length;
  const errorCount = countWith("error");
  // Each kind the list holds, said apart: "1 error, 2 notes".
  const counts = [
    [errorCount, "error"],
    [countWith("warning"), "warning"],
    [countWith("info"), "note"],
  ] as const;

  const reveal = (problem: CompositionProblem) => {
    setActiveSubnetId(problem.subnetId);
    switch (problem.kind) {
      case "fusion":
        selectItem({ type: "fusion", id: problem.fusionId });
        return;
      case "port":
        selectItem({ type: "place", id: problem.placeId });
        return;
      case "interface":
        if (problem.instanceId !== undefined) {
          selectItem({ type: "componentInstance", id: problem.instanceId });
        }
    }
  };

  return (
    <DiagnosticsGroup
      label="Composition"
      count={counts
        .filter(([count]) => count > 0)
        .map(([count, noun]) => countOf(count, noun))
        .join(", ")}
      hasErrors={errorCount > 0}
      expanded={isExpanded}
      onToggle={() => setIsExpanded((expanded) => !expanded)}
    >
      <ul className={diagnosticsListStyle}>
        {problems.map((problem, index) => (
          <li
            // The list is derived afresh on every render, and one check can
            // report twice on one fusion.
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            className={diagnosticItemStyle}
          >
            <button
              type="button"
              onClick={() => reveal(problem)}
              className={cx(diagnosticButtonStyle, problemTextStyle)}
              data-severity={problem.severity}
            >
              <span className={bulletStyle}>•</span>
              {problem.message}
            </button>
          </li>
        ))}
      </ul>
    </DiagnosticsGroup>
  );
};

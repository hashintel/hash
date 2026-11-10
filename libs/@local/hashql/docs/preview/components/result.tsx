import styles from "./result.module.css";

import type { ReactNode } from "react";

/** What a program's result is: what it printed, or the error that stopped it. */
export type ResultKind = "output" | "error";

export interface ResultProps {
  /** Whether the result is the program's output or the error that stopped it. Defaults to `"output"`. */
  readonly kind?: ResultKind;
  /**
   * Whether the result is what the language specifies rather than what a run
   * printed. A recorded result is the output of running the program above it.
   */
  readonly expected?: boolean;
  readonly children: ReactNode;
}

const nounOf = (kind: ResultKind, expected: boolean): string => {
  if (kind === "error") {
    return "error";
  }

  return expected ? "result" : "output";
};

/** A collapsible result placed immediately after its code block or code tabs. */
export function Result({
  kind = "output",
  expected = false,
  children,
}: ResultProps): ReactNode {
  const noun = nounOf(kind, expected);

  return (
    <details
      className={styles["result"]}
      data-kind={kind}
      data-expected={expected ? "" : undefined}
    >
      <summary className={styles["result-summary"]}>
        <svg
          className={styles["result-chevron"]}
          viewBox="0 0 16 16"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M6 3.5 10.5 8 6 12.5" />
        </svg>
        <span className={styles["result-show"]}>{`Show ${noun}`}</span>
        <span className={styles["result-hide"]}>{`Hide ${noun}`}</span>
      </summary>
      <div className={styles["result-panel"]}>{children}</div>
    </details>
  );
}

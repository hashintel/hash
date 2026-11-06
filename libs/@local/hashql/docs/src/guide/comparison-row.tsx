/* oxlint-disable react/jsx-no-literals -- This documentation has no localization layer. */
import { Code } from "./code.js";
import styles from "./comparison.module.css";

import type rows from "./comparison-rows.json";
import type * as Language from "./Language.js";
import type { ReactElement } from "react";

export function ComparisonRow({
  row,
  host,
  query,
  headingId,
}: {
  readonly row: (typeof rows)[number];
  readonly host: Language.Host;
  readonly query: Language.Query;
  readonly headingId: string;
}): ReactElement {
  const queryCode = row.codes[query.id];

  return (
    <section
      id={row.id}
      className={styles["guide-comparison-row"]}
      aria-labelledby={headingId}
    >
      <h3 id={headingId}>
        <a href={`#${row.id}`}>{row.title}</a>
      </h3>
      <div className={styles["guide-comparison-pair"]}>
        <Code language={host} code={row.codes[host.id]} />
        {queryCode === null ? (
          <div className={styles["guide-comparison-unavailable"]}>
            <p>Not available in Draft yet.</p>
            {row.id === "functions" ? (
              <a href="https://linear.app/hash/issue/BE-1015/build-typed-hashql-functions-in-draft">
                Track function construction
              </a>
            ) : (
              <a href={`/docs/hashql/intro#${row.anchor}`}>
                Read about the language operation
              </a>
            )}
            <p>Choose either HashQL notation to see this form.</p>
          </div>
        ) : (
          <Code language={query} code={queryCode} />
        )}
      </div>
      {row.id === "lists" && (
        <p className={styles["guide-comparison-notice"]}>
          The current SDK index descriptor differs from the language&apos;s
          Option result. See the differences below.
        </p>
      )}
      <details>
        <summary>What differs</summary>
        <p>{row.note}</p>
      </details>
      <a
        className={styles["guide-comparison-explanation"]}
        href={`/docs/hashql/intro#${row.anchor}`}
      >
        Explanation in the introduction
      </a>
    </section>
  );
}

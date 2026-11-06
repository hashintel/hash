/* oxlint-disable react/jsx-no-literals -- This documentation has no localization layer. */
"use client";

import { useCallback, useId, useState } from "react";

import { ComparisonRow } from "./comparison-row.js";
import rows from "./comparison-rows.json" with { type: "json" };
import styles from "./comparison.module.css";
import * as Language from "./Language.js";

import type { ChangeEvent, ReactElement } from "react";

/** Independent language choices keep each comparison beside its semantic differences. */
export function Comparison(): ReactElement {
  const id = useId();
  const [host, setHost] = useState<Language.Host>(Language.hosts[2]);
  const [query, setQuery] = useState<Language.Query>(Language.queries[0]);
  const selectHost = useCallback(
    (event: ChangeEvent<HTMLSelectElement>): void => {
      const selected = Language.hosts.find(
        (language) => language.id === event.currentTarget.value,
      );
      if (selected !== undefined) {
        setHost(selected);
      }
    },
    [],
  );
  const selectQuery = useCallback(
    (event: ChangeEvent<HTMLSelectElement>): void => {
      const selected = Language.queries.find(
        (language) => language.id === event.currentTarget.value,
      );
      if (selected !== undefined) {
        setQuery(selected);
      }
    },
    [],
  );

  return (
    <div className={styles["guide-comparison"]}>
      <div className={styles["guide-comparison-controls"]}>
        <div>
          <label htmlFor={`${id}-host`}>A language you know</label>
          <select id={`${id}-host`} value={host.id} onChange={selectHost}>
            {Language.hosts.map((language) => (
              <option key={language.id} value={language.id}>
                {language.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-query`}>The HashQL form</label>
          <select id={`${id}-query`} value={query.id} onChange={selectQuery}>
            {Language.queries.map((language) => (
              <option key={language.id} value={language.id}>
                {language.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <details className={styles["guide-comparison-jump"]}>
        <summary>Jump to a form</summary>
        <nav
          className={styles["guide-comparison-topics"]}
          aria-label="Comparison topics"
        >
          {rows.map((row) => (
            <a key={row.id} href={`#${row.id}`}>
              {row.title}
            </a>
          ))}
        </nav>
      </details>
      {rows.map((row) => (
        <ComparisonRow
          key={row.id}
          row={row}
          host={host}
          query={query}
          headingId={`${id}-${row.id}`}
        />
      ))}
    </div>
  );
}

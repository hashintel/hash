/**
 * `@hashintel/brunch-agent-repertoire` — the harness's own teaching (ADR-0007).
 *
 * `repertoire.yaml` fills every guidance and runbook key the harness owns with
 * the default an interviewer is taught before any plugin speaks; every entry
 * names its source. A binding renders it interleaved with a plugin definition
 * (`renderInstructions` in the harness); a plugin never imports it — a plugin
 * cell is written against the harness's definition of the key, not against
 * this text.
 *
 * **This package resolves `@hashintel/brunch-agent` and nothing else.**
 */

import { readRepertoire } from "@hashintel/brunch-agent";

import repertoireYaml from "../repertoire.yaml?raw";

/** The repertoire; reading fails loudly at module load if a key is empty or unsourced. */
export const repertoire = readRepertoire(repertoireYaml);

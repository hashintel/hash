import { readRepertoire } from "./teaching/repertoire";
import repertoireYaml from "./teaching/repertoire.yaml?raw";

/**
 * The harness's validated default teaching.
 *
 * The repertoire fills every guidance and runbook key before a plugin adds its
 * formalism-specific cells. Every entry names its evidence source, and reading
 * fails at module load if a key is empty or unsourced. Bindings and evaluation
 * composition may import `@hashintel/brunch-agent/prompts`; plugins may not.
 *
 * @see ADR-0007 for the repertoire contract.
 * @see ADR-0008 for its placement in the core package.
 */
export const repertoire = readRepertoire(repertoireYaml);

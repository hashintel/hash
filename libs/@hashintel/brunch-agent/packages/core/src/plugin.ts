import * as v from "valibot";

import type { CaptureInputProposal } from "./capture-store";
import type { PluginFile } from "./plugin-file";

/**
 * The plugin descriptor — identity only, at this stage.
 *
 * The plugin's real surface is its packs and the four operations (spec §6.1,
 * §11.1). Those are **deliberately absent here**: spec §13's two-targets rule
 * says the trivial target must not freeze the plugin contract before the hard
 * target has stressed it, so nothing in this scaffold ratifies the SDK export
 * surface. What the descriptor fixes now is only what the topology needs —
 * that a plugin declares which target formalism it defines, and does so through
 * Valibot like every other boundary in the system (spec §12.4).
 *
 * ADR-0006 adds the plugin file: a per-formalism sectioned Markdown document
 * whose three tables parameterise the harness's fold, completion, and cue. A
 * plugin that carries one is a kind-and-slot plugin and proposes slot
 * assertions; the tracer plugin still has none.
 */
export const PluginDescriptor = v.object({
  /** Package-level identity, matching the `plugin-*` role prefix (spec §12.2). */
  name: v.pipe(
    v.string(),
    v.regex(/^plugin-[a-z][a-z0-9-]*$/, "expected a `plugin-<name>` name"),
  ),
  /** The target formalism this plugin elicits toward — gherkin, sdcpn — never a domain. */
  targetFormalism: v.pipe(v.string(), v.nonEmpty()),
});

export interface PluginProposalType {
  readonly name: string;
  readonly description: string;
  readonly schema: v.GenericSchema<unknown, CaptureInputProposal>;
}

export type Plugin = v.InferOutput<typeof PluginDescriptor> & {
  /** FE-1392's declared floor; FE-1393 grows the catalog and SDK around it. */
  readonly proposalCatalog: readonly [PluginProposalType];
  /** The parsed plugin file (ADR-0006); absent for a plugin without one. */
  readonly file?: PluginFile;
};

/**
 * Declare a plugin. Inversion of control (spec §4): the plugin declares and
 * registers; the harness discovers, orders, and invokes. Nothing a plugin
 * declares can reach persistence — the storage port is harness-defined and
 * binding-implemented, and plugins are storage-blind (spec §9.6).
 */
export function definePlugin(descriptor: Plugin): Plugin {
  const identity = v.parse(PluginDescriptor, descriptor);
  const [proposal, ...extraProposals] = descriptor.proposalCatalog;
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- Public JavaScript callers still require the runtime cardinality guard.
  if (!proposal || extraProposals.length > 0) {
    throw new TypeError(
      "This slice requires exactly one declared proposal type.",
    );
  }
  const name = v.parse(v.pipe(v.string(), v.nonEmpty()), proposal.name);
  const description = v.parse(
    v.pipe(v.string(), v.nonEmpty()),
    proposal.description,
  );
  return {
    ...identity,
    proposalCatalog: [{ ...proposal, name, description }],
    ...(descriptor.file === undefined ? {} : { file: descriptor.file }),
  };
}

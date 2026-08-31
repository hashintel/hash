/**
 * The substrate-capability list (spec §10), recorded as data.
 *
 * This is the core/binding seam, the portability pressure test, and the early
 * smell detector all at once: porting means reimplementing this list, and
 * exotic Flue-shaped entries appearing in it is the smell. Keeping it as a
 * checkable record rather than prose is what lets the second-binding test
 * (spec §14.2) be asked of every future addition — "genuinely
 * substrate-specific, or mechanism leaking into Flue's dialect?"
 *
 * Binding-size asymmetry is expected, not failure: each binding absorbs what
 * its substrate lacks or forbids.
 */

/** How a binding satisfies one capability. */
export type Provision =
  /** The substrate offers it directly. */
  | "native"
  /** The substrate lacks or forbids it; the binding supplies it itself. */
  | "absorbed";

export interface Capability {
  readonly id: number;
  readonly name: string;
  readonly provision: Provision;
  /** How this binding satisfies it, in Flue's dialect. */
  readonly mechanism: string;
}

export const CAPABILITIES: readonly Capability[] = [
  {
    id: 1,
    name: "Register a tool",
    provision: "native",
    mechanism: "defineTool / useTool",
  },
  {
    id: 2,
    name: "Contribute instructions",
    provision: "native",
    mechanism: "render return",
  },
  {
    id: 3,
    name: "Persist per-conversation state",
    provision: "native",
    mechanism: "usePersistentState, atomic with its unit of work",
  },
  {
    id: 4,
    name: "Emit an affordance payload",
    provision: "native",
    mechanism: "data channel + tool output parts",
  },
  {
    id: 5,
    name: "Suspend for reply",
    provision: "absorbed",
    mechanism:
      "no ask primitive: terminate:true + pending-affordance slot + fresh dispatch",
  },
  {
    id: 6,
    name: "Private model call",
    provision: "native",
    mechanism: "harness.prompt scratch conversation",
  },
  {
    id: 7,
    name: "Subscribe to the would-stop lifecycle seam",
    provision: "native",
    mechanism:
      "useAgentFinish + ctx.append; fires on suspensions, so the pending guard is load-bearing; loop-guarded",
  },
  {
    id: 8,
    name: "Read the durable entry projection with provenance-discriminating entry kinds",
    provision: "absorbed",
    mechanism:
      "public materialized history snapshot over a host-injected conversation URL/transport; `role`/`purpose` discriminate provenance; no raw entry ranges",
  },
  {
    id: 9,
    name: "Inject typed non-user signal entries",
    provision: "native",
    mechanism:
      "ctx.append / dispatch({kind:'signal'}); projects structurally non-user",
  },
  {
    id: 10,
    name: "Provide a transactional durable store outside conversation state",
    provision: "absorbed",
    mechanism:
      "Flue neither provides nor forbids; the binding owns the storage-port implementation",
  },
];

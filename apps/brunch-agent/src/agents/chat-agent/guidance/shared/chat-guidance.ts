/**
 * What a guidance arm hands back to the agent once it has mounted its model,
 * skills, Ledger tools and instructions.
 */
export interface ChatGuidance {
  readonly system: string;
  /**
   * The runtime instructions, for an arm that owns its copies; without them
   * the agent and the SDCPN plugin mount the shared text.
   */
  readonly instructions?: {
    /** The ping and browser-tool policy in a document-bound conversation. */
    readonly bound: string;
    /** The ping policy in a conversation without browser tools. */
    readonly unbound: string;
    readonly queryBasis: string;
    readonly capability: string;
    readonly experimentDrafting: string;
  };
}

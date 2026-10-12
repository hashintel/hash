import { PetrinautAgent } from "./petrinaut/agent.ts";

/** One agent this app serves under `/agents/<route>`. */
export interface MountedAgent {
  readonly route: string;
  readonly agent: typeof PetrinautAgent;
  /** Further route segments that serve the same agent. */
  readonly aliases?: readonly string[];
  /** Kept off a production server: comparison candidates are for local runs. */
  readonly devOnly?: boolean;
}

/**
 * Every agent this app serves. A candidate is a copy of an agent directory
 * with its own `agentName`, registered here under its own route.
 */
export const agents: readonly MountedAgent[] = [
  {
    route: "petrinaut",
    agent: PetrinautAgent,
    // The deployed website still calls `/agents/chat`; drop this once its
    // `VITE_BRUNCH_CHAT_ENDPOINT` names `/agents/petrinaut`.
    aliases: ["chat"],
  },
];

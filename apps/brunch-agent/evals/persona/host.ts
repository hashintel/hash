/**
 * Where a persona run meets Brunch: the app whose page the persona's messages
 * are typed into. The launcher owns the run's lifecycle, the persona agent,
 * the bridge and every turn; a host owns what differs between apps: which
 * services the run starts, how its page reaches a shown assistant, and what
 * the app holds that evidence keeps.
 */
import type { PersonaBrowserSession } from "./browser-turn.ts";
import type { GuidanceSources } from "./guidance-manifest.ts";
import type { Page } from "@playwright/test";

export type PersonaHostName = "website" | "hash";

/** A net to start from: a parsed Petrinaut file and the bytes' digest. */
export interface PersonaInitialNet {
  readonly title: string;
  readonly sdcpn: Readonly<Record<string, unknown>>;
  readonly sourceSha256: string;
}

/** A service the run starts and owns, by root `package.json` script. */
export interface PersonaHostService {
  readonly script: string;
  readonly readyUrl: string;
  /**
   * Brunch's server, whose start recovers an interrupted turn: on resume it
   * starts only after the recording pause.
   */
  readonly recovers: boolean;
}

export type Environment = Record<string, string | undefined>;

/** One run's use of a host, from preparation to release. */
export interface PersonaHostRun {
  /** What `run.json` keeps for this host; a resume hands it back. */
  readonly record: Readonly<Record<string, unknown>>;
  readonly environment: Environment;
  readonly services: readonly PersonaHostService[];
  /** Turbo filters for what the services need built first. */
  readonly buildFilters: readonly string[];
  /**
   * Opens a fresh run's page with the assistant shown; nothing is sent.
   * Returns fields to add to `run.json`.
   */
  readonly open: (
    page: Page,
    input: { readonly initialNet?: PersonaInitialNet },
  ) => Promise<Readonly<Record<string, unknown>>>;
  /**
   * Opens a resumed run's page on its original document, refusing when the
   * page no longer holds it, before Brunch recovers the interrupted turn.
   */
  readonly reopen: (
    page: Page,
    session: PersonaBrowserSession,
  ) => Promise<void>;
  /** Reloads the page and shows the assistant again, once Brunch has recovered. */
  readonly reload: (page: Page) => Promise<void>;
  /** Writes the app's net for the conversation into `evidence/net.json`. */
  readonly capture: (
    page: Page,
    session: PersonaBrowserSession,
    evidenceDirectory: string,
  ) => Promise<void>;
  /** Releases what preparation took beyond the services. */
  readonly release: () => Promise<void>;
}

export interface PersonaHost {
  readonly name: PersonaHostName;
  /** The Brunch agent the host talks to, fingerprinted for each run. */
  readonly guidance: GuidanceSources;
  readonly prepare: (input: {
    readonly environment: Environment;
    readonly run: string;
    /** The retained run's record on resume. */
    readonly retained?: Readonly<Record<string, unknown>>;
    readonly signal: AbortSignal;
    readonly report: (text: string) => void;
  }) => Promise<PersonaHostRun>;
}

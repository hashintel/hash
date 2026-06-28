import RudderAnalytics from "@rudderstack/rudder-sdk-node";

import { frontendDomain } from "@local/hash-isomorphic-utils/environment";

import { logger } from "../logger";
import { telemetryEnvironment } from "./environment";

import type {
  FrontendTelemetryEvent,
  TelemetryEnvironment,
} from "@local/hash-isomorphic-utils/telemetry/types";
import type { Request } from "express";

const RUDDERSTACK_KEY = process.env.HASH_API_RUDDERSTACK_KEY;
const RUDDERSTACK_DATA_PLANE_URL =
  "https://hashcruddtqbra.dataplane.eu.rudderstack.com";

/** Server-only event names */
export type ServerTelemetryEventName = "analysis_run" | "user_register";

/** An actor identity for req-less callers (background jobs, webhooks). */
export interface TelemetryActor {
  accountId: string;
  shortname?: string;
}

/**
 * The common envelope every event shares. Built internally by the service from
 * a `req` or an actor; callers never construct one themselves.
 */
interface EventEnvelope {
  userId?: string;
  anonymousId?: string;
  context: {
    ip?: string;
    userAgent?: string;
    app: { environment: TelemetryEnvironment; frontendDomain: string };
  };
  baseProperties: {
    environment: TelemetryEnvironment;
    frontendDomain: string;
    shortname?: string;
    frontendProvided: boolean;
  };
  timestamp: Date;
}

class TelemetryService {
  private client: RudderAnalytics | null | undefined = undefined;

  private getClient(): RudderAnalytics | null {
    if (this.client === undefined) {
      if (!RUDDERSTACK_KEY || !RUDDERSTACK_DATA_PLANE_URL) {
        this.client = null;
        return null;
      }
      this.client = new RudderAnalytics(RUDDERSTACK_KEY, {
        dataPlaneUrl: RUDDERSTACK_DATA_PLANE_URL,
      });
    }
    return this.client;
  }

  /** The single place a request-scoped envelope is built. */
  private buildEnvelope(
    req: Request,
    opts: { frontendProvided: boolean; anonymousId?: string },
  ): EventEnvelope {
    const { user } = req;
    return {
      userId: user?.accountId,
      anonymousId: user ? undefined : opts.anonymousId,
      context: {
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        app: { environment: telemetryEnvironment, frontendDomain },
      },
      baseProperties: {
        environment: telemetryEnvironment,
        frontendDomain,
        shortname: user?.shortname,
        frontendProvided: opts.frontendProvided,
      },
      timestamp: new Date(),
    };
  }

  /** Envelope for req-less callers: no IP/user-agent, never frontend-provided. */
  private buildActorEnvelope(actor: TelemetryActor): EventEnvelope {
    return {
      userId: actor.accountId,
      context: {
        app: { environment: telemetryEnvironment, frontendDomain },
      },
      baseProperties: {
        environment: telemetryEnvironment,
        frontendDomain,
        shortname: actor.shortname,
        frontendProvided: false,
      },
      timestamp: new Date(),
    };
  }

  private emit(
    envelope: EventEnvelope,
    event: string,
    properties: Record<string, unknown>,
  ): void {
    const client = this.getClient();
    // The SDK requires an identity; drop anonymous-and-unidentified events.
    if (!client || (!envelope.userId && !envelope.anonymousId)) {
      return;
    }
    // The SDK's `apiObject` type does not accept `unknown`-valued property bags,
    // so we cast at this boundary rather than constraining dynamic properties.
    client.track({
      userId: envelope.userId,
      anonymousId: envelope.anonymousId,
      event,
      properties: { ...envelope.baseProperties, ...properties },
      context: envelope.context,
      timestamp: envelope.timestamp,
    } as unknown as RudderAnalytics.TrackParams);
  }

  private emitPage(
    envelope: EventEnvelope,
    name: string,
    properties: Record<string, unknown>,
  ): void {
    const client = this.getClient();
    if (!client || (!envelope.userId && !envelope.anonymousId)) {
      return;
    }
    client.page({
      userId: envelope.userId,
      anonymousId: envelope.anonymousId,
      name,
      properties: { ...envelope.baseProperties, ...properties },
      context: envelope.context,
      timestamp: envelope.timestamp,
    } as unknown as RudderAnalytics.PageParams);
  }

  // ─── Public, envelope-free API ───

  /** A server-origin event tied to an incoming request. */
  track(
    req: Request,
    event: ServerTelemetryEventName,
    properties: Record<string, unknown> = {},
  ): void {
    this.emit(
      this.buildEnvelope(req, { frontendProvided: false }),
      event,
      properties,
    );
  }

  /** A server-origin event for a req-less caller (webhooks, background jobs). */
  trackForActor(
    actor: TelemetryActor,
    event: ServerTelemetryEventName,
    properties: Record<string, unknown> = {},
  ): void {
    this.emit(this.buildActorEnvelope(actor), event, properties);
  }

  /** Relay allowlisted events reported by the browser. */
  trackFromClient(
    req: Request,
    payload: { anonymousId?: string; events: FrontendTelemetryEvent[] },
  ): void {
    const envelope = this.buildEnvelope(req, {
      frontendProvided: true,
      anonymousId: payload.anonymousId,
    });

    for (const ev of payload.events) {
      if (ev.type === "page") {
        this.emitPage(envelope, ev.name, ev.properties ?? {});
      } else {
        this.emit(envelope, ev.name, ev.properties ?? {});
      }
    }
  }

  /** Associate an actor with traits (e.g. on registration). */
  identifyActor(actor: TelemetryActor, traits: Record<string, unknown>): void {
    const client = this.getClient();
    if (!client) {
      return;
    }
    client.identify({
      userId: actor.accountId,
      traits,
      context: {
        app: { environment: telemetryEnvironment, frontendDomain },
      },
    } as unknown as RudderAnalytics.IdentifyParams);
  }

  /** Flush buffered events; call on graceful shutdown. */
  async flush(): Promise<void> {
    try {
      await this.client?.flush();
    } catch (error) {
      logger.warn(`Could not flush telemetry client: ${error}`);
    }
  }
}

export const telemetry = new TelemetryService();

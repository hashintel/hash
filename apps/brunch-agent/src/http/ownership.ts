/** Hono middleware for the mounted Flue conversation route. */

import {
  BRUNCH_CONVERSATION_HEADER,
  BRUNCH_DOCUMENT_REVISION_HEADER,
  BRUNCH_PRINCIPAL_HEADER,
} from "@hashintel/brunch-agent-transport-aisdk/headers";

import { ownsFlueInstance } from "../conversation/identity.ts";
import {
  discardReportedDocumentRevision,
  reportDocumentRevision,
  reportedRevisionSubmissionId,
} from "../conversation/reported-document-revision.ts";
import { diagnostics } from "../runtime-diagnostics.ts";

import type { AgentSendResult } from "@flue/sdk";
import type { DocumentRevisionId } from "@hashintel/petrinaut-core";
import type { MiddlewareHandler } from "hono";

export const agentOwnershipGuard = (
  mountPrefix: string,
  agentName: string,
): MiddlewareHandler => {
  return async (context, next) => {
    let stagedDocumentRevision:
      | {
          submissionId: AgentSendResult["submissionId"];
          revisionId: DocumentRevisionId;
        }
      | undefined;
    const principalKey = context.req.header(BRUNCH_PRINCIPAL_HEADER)?.trim();
    const conversationId = context.req
      .header(BRUNCH_CONVERSATION_HEADER)
      ?.trim();
    if (
      principalKey === undefined ||
      principalKey.length === 0 ||
      conversationId === undefined ||
      conversationId.length === 0
    ) {
      return context.json({ error: "unauthorized" }, 401);
    }
    const instanceId = context.req.path
      .slice(mountPrefix.length)
      .split("/")
      .find((segment) => segment.length > 0);
    if (
      instanceId === undefined ||
      !ownsFlueInstance({ principalKey, conversationId }, instanceId)
    ) {
      return context.json({ error: "forbidden" }, 403);
    }
    if (
      context.req.method === "POST" &&
      context.req.path === `${mountPrefix}${instanceId}`
    ) {
      const documentRevisionId = context.req
        .header(BRUNCH_DOCUMENT_REVISION_HEADER)
        ?.trim();
      if (
        documentRevisionId !== undefined &&
        (documentRevisionId.length === 0 || documentRevisionId.length > 256)
      )
        return context.json({ error: "invalid-document-revision" }, 400);
      // Initial data is immutable, so bind it to the authorized conversation at admission.
      // The agent's canonical schema still owns shape validation.
      const body: unknown = await context.req.raw
        .clone()
        .json()
        .catch((error: unknown) => {
          // The agent's schema still refuses the body; the parse failure
          // itself would otherwise leave no trace. Classification only.
          diagnostics.report("http.admission-body", error, {
            instanceId,
            contentType: context.req.header("content-type"),
          });
          return undefined;
        });
      if (typeof body === "object" && body !== null && "initialData" in body) {
        const data = body.initialData;
        if (
          typeof data === "object" &&
          data !== null &&
          ("browser" in data || "construction" in data)
        ) {
          const browser =
            "construction" in data
              ? data.construction
              : "browser" in data
                ? data.browser
                : undefined;
          if (
            typeof browser === "object" &&
            browser !== null &&
            "binding" in browser
          ) {
            const binding = browser.binding;
            if (
              typeof binding === "object" &&
              binding !== null &&
              "conversationId" in binding &&
              binding.conversationId !== conversationId
            )
              return context.json({ error: "forbidden" }, 403);
          }
        }
      }
      const message =
        typeof body === "object" && body !== null && "message" in body
          ? body.message
          : body;
      if (
        documentRevisionId !== undefined &&
        typeof message === "object" &&
        message !== null &&
        "kind" in message &&
        message.kind === "user" &&
        typeof body === "object" &&
        body !== null &&
        "idempotencyKey" in body &&
        typeof body.idempotencyKey === "string"
      ) {
        const submissionId = reportedRevisionSubmissionId(
          agentName,
          instanceId,
          body.idempotencyKey,
        );
        if (reportDocumentRevision(submissionId, documentRevisionId))
          stagedDocumentRevision = {
            submissionId,
            revisionId: documentRevisionId,
          };
      }
    }
    try {
      await next();
    } catch (error) {
      if (stagedDocumentRevision !== undefined)
        discardReportedDocumentRevision(
          stagedDocumentRevision.submissionId,
          stagedDocumentRevision.revisionId,
        );
      throw error;
    }
    if (stagedDocumentRevision === undefined) return;
    if (context.res.status !== 202) {
      discardReportedDocumentRevision(
        stagedDocumentRevision.submissionId,
        stagedDocumentRevision.revisionId,
      );
      return;
    }
    const admission: unknown = await context.res
      .clone()
      .json()
      .catch(() => undefined);
    if (isDeduplicatedAdmission(admission))
      discardReportedDocumentRevision(
        stagedDocumentRevision.submissionId,
        stagedDocumentRevision.revisionId,
      );
  };
};

const isDeduplicatedAdmission = (
  value: unknown,
): value is Required<Pick<AgentSendResult, "deduplicated">> =>
  typeof value === "object" &&
  value !== null &&
  "deduplicated" in value &&
  value.deduplicated === true;

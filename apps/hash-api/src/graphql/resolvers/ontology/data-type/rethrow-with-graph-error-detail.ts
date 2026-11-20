/**
 * The graph wraps every write failure in a generic outer message ("Could not
 * insert into store"), keeping the actual cause — a base-URL collision, an
 * unsatisfiable constraint, a denied permission — in nested source contexts
 * and printable attachments. Surface those so the client can tell the
 * failures apart.
 */

/**
 * A nested generic store wrapper repeats what the outer one already said —
 * an update failing on its version insert wraps "Could not insert into
 * store" inside "Could not update store". The outermost survives as the
 * message of last resort; nested ones are dropped.
 */
const genericStoreContext =
  /^(?:Could not (?:insert into|update|query from) store|The store encountered an error)$/;

/**
 * Frames echoing Postgres diagnostics stay server-side even at the
 * allowed depth — the driver folds DETAIL/HINT into its error text
 */
const postgresDiagnostic =
  /duplicate key value|violates .{0,30}constraint|\bSQLSTATE\b|\bDETAIL:|\bHINT:|\bKey \(|relation "[^"]*"|syntax error at or near/i;

export const rethrowWithGraphErrorDetail = (error: unknown): never => {
  // Three context levels: the graph's wrapper, its cause, and the cause's
  // own source (an update failing on its version insert nests one further).
  // Deeper frames carry database diagnostics that must not reach clients.
  const details: string[] = [];
  const walk = (frames: unknown, depth: number) => {
    if (!Array.isArray(frames) || depth > 2) {
      return;
    }
    for (const frame of frames) {
      if (Array.isArray(frame)) {
        walk(frame, depth);
      } else if (frame && typeof frame === "object") {
        if (
          "context" in frame &&
          typeof frame.context === "string" &&
          (depth === 0 || !genericStoreContext.test(frame.context))
        ) {
          details.push(frame.context);
        }
        if ("attachments" in frame && Array.isArray(frame.attachments)) {
          for (const attachment of frame.attachments) {
            if (typeof attachment === "string") {
              details.push(attachment);
            }
          }
        }
        if ("sources" in frame) {
          walk(frame.sources, depth + 1);
        }
      }
    }
  };
  if (error && typeof error === "object" && "status" in error) {
    walk((error.status as { contents?: unknown }).contents, 0);
  }

  const surfaced = details.filter((detail) => !postgresDiagnostic.test(detail));

  // With one detail the outer wrapper is all there is — the original error
  // already says as much, unless it isn't an Error at all
  if (surfaced.length > (error instanceof Error ? 1 : 0)) {
    throw new Error(surfaced.join(": "), {
      cause: error instanceof Error ? error : undefined,
    });
  }
  throw error;
};

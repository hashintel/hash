import type {
  InferEntitiesCallerParams,
  InferEntitiesUserArguments,
} from "@local/hash-isomorphic-utils/temporal-types";
import {
  inferenceModelNames,
  InferEntitiesReturn,
  inferEntitiesUserArgumentKeys,
} from "@local/hash-isomorphic-utils/temporal-types";
import { StatusCode } from "@local/status";
import type { ApplicationFailure } from "@temporalio/client";
import type { WorkflowFailedError } from "@temporalio/client/src/errors";
import type { RequestHandler } from "express";

import { genId } from "../util";

export const inferEntitiesController: RequestHandler<
  {},
  InferEntitiesReturn,
  InferEntitiesUserArguments
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- https://github.com/DefinitelyTyped/DefinitelyTyped/issues/50871
> = async (req, res): Promise<void> => {
  const user = req.user;

  if (!user) {
    res.status(401).send({
      code: StatusCode.Unauthenticated,
      contents: [],
      message: "Unauthenticated",
    });
    return;
  }

  const temporal = req.context.temporalClient;
  if (!temporal) {
    res.status(500).send({
      code: StatusCode.Internal,
      contents: [],
      message: "No Temporal client available to request handler",
    });
    return;
  }

  const userArguments = req.body;
  if (inferEntitiesUserArgumentKeys.some((key) => !(key in userArguments))) {
    res.status(400).send({
      code: StatusCode.InvalidArgument,
      contents: [],
      message: `Invalid request body – expected an object containing all of ${inferEntitiesUserArgumentKeys.join(
        ", ",
      )}`,
    });
    return;
  }

  if (!inferenceModelNames.includes(userArguments.model)) {
    res.status(400).send({
      code: StatusCode.InvalidArgument,
      contents: [],
      message: `Invalid request body – expected 'model' to be one of ${inferenceModelNames.join(
        ", ",
      )}`,
    });
    return;
  }

  res.header("Content-Type", "application/json");

  const keepAliveInterval = setInterval(() => {
    res.write("");
  }, 10_000);

  try {
    const status = await temporal.workflow.execute<
      (params: InferEntitiesCallerParams) => Promise<InferEntitiesReturn>
    >("inferEntities", {
      taskQueue: "ai",
      args: [
        {
          authentication: { actorId: user.accountId },
          userArguments,
        },
      ],
      workflowId: `inferEntities-${genId()}`,
      retry: {
        maximumAttempts: 1,
      },
    });

    clearInterval(keepAliveInterval);

    res.status(200).write(JSON.stringify(status));
    res.end();
  } catch (err) {
    clearInterval(keepAliveInterval);

    const errorCause = (err as WorkflowFailedError).cause?.cause as
      | ApplicationFailure
      | undefined;

    const errorDetails = errorCause?.details?.[0] as
      | InferEntitiesReturn
      | undefined;

    if (!errorDetails) {
      res.status(500).write(
        JSON.stringify({
          code: StatusCode.Internal,
          contents: [],
          message: `Unexpected error from Infer Entities workflow: ${
            (err as Error).message
          }`,
        }),
      );
      res.end();
      return;
    }

    switch (errorDetails.code) {
      case StatusCode.InvalidArgument:
      case StatusCode.FailedPrecondition:
      case StatusCode.OutOfRange:
        res.status(400);
        break;
      case StatusCode.Unauthenticated:
        res.status(401);
        break;
      case StatusCode.PermissionDenied:
        res.status(403);
        break;
      case StatusCode.NotFound:
        res.status(404);
        break;
      case StatusCode.Aborted:
      case StatusCode.AlreadyExists:
        res.status(409);
        break;
      case StatusCode.ResourceExhausted:
        res.status(429);
        break;
      case StatusCode.Cancelled:
        res.status(499);
        break;
      case StatusCode.Ok:
      case StatusCode.DataLoss:
      case StatusCode.Internal:
      case StatusCode.Unknown:
        res.status(500);
        break;
      case StatusCode.Unimplemented:
        res.status(501);
        break;
      case StatusCode.Unavailable:
        res.status(503);
        break;
      case StatusCode.DeadlineExceeded:
        res.status(504);
        break;
      default:
        res.status(500);
    }
    res.write(JSON.stringify(errorDetails));
    res.end();
  }
};

import {
  InferEntitiesCallerParams,
  InferEntitiesReturn,
  inferEntitiesUserArgumentKeys,
  InferEntitiesUserArguments,
} from "@local/hash-isomorphic-utils/temporal-types";
import { StatusCode } from "@local/status";
import { RequestHandler } from "express";

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
        maximumAttempts: 3,
      },
    });

    clearInterval(keepAliveInterval);

    res.status(200).send(status);
  } catch (err) {
    clearInterval(keepAliveInterval);

    const errorStatus = (err as Error).cause as InferEntitiesReturn;
    switch (errorStatus.code) {
      case StatusCode.InvalidArgument:
      case StatusCode.FailedPrecondition:
      case StatusCode.OutOfRange:
        res.status(400).send(errorStatus);
        break;
      case StatusCode.Unauthenticated:
        res.status(401).send(errorStatus);
        break;
      case StatusCode.PermissionDenied:
        res.status(403).send(errorStatus);
        break;
      case StatusCode.NotFound:
        res.status(404).send(errorStatus);
        break;
      case StatusCode.Aborted:
      case StatusCode.AlreadyExists:
        res.status(409).send(errorStatus);
        break;
      case StatusCode.ResourceExhausted:
        res.status(429).send(errorStatus);
        break;
      case StatusCode.Cancelled:
        res.status(499).send(errorStatus);
        break;
      case StatusCode.Ok:
      case StatusCode.DataLoss:
      case StatusCode.Internal:
      case StatusCode.Unknown:
        res.status(500).send(errorStatus);
        break;
      case StatusCode.Unimplemented:
        res.status(501).send(errorStatus);
        break;
      case StatusCode.Unavailable:
        res.status(503).send(errorStatus);
        break;
      case StatusCode.DeadlineExceeded:
        res.status(504).send(errorStatus);
        break;
    }
  }
};

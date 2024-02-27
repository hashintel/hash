import { RequestHandler } from "express";

import { getUserSimpleWebs, SimpleWeb } from "./shared/webs";

export type GptGetUserWebsResponseBody =
  | { error: string }
  | {
      userWebs: SimpleWeb[];
    };

export const gptGetUserWebs: RequestHandler<
  Record<string, never>,
  GptGetUserWebsResponseBody
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
> = async (req, res) => {
  const { user } = req;

  if (!user) {
    res.status(401).send({ error: "No authenticated user" });
    return;
  }

  if (!user.shortname) {
    res.status(401).send({ error: "User has not completed signup." });
    return;
  }

  const userWebs = await getUserSimpleWebs(
    req.context,
    { actorId: user.accountId },
    { user },
  );

  res.status(200).json({ userWebs });
};

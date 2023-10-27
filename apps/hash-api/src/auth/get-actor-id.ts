import { Request } from "express";

import { publicUserAccountId } from "./public-user-account-id";

export const getActorIdFromRequest = (request: Request) =>
  request.user?.accountId ?? publicUserAccountId;

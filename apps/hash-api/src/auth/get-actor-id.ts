import type { Request } from "express";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";

export const getActorIdFromRequest = (request: Request) =>
  request.user?.accountId ?? publicUserAccountId;

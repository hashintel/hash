import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type { Request } from "express";

export const getActorIdFromRequest = (request: Request) =>
  request.user?.accountId ?? publicUserAccountId;

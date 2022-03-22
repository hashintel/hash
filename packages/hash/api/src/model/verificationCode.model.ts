import { rword } from "rword";
import { VerificationCode } from ".";
import { DbClient } from "../db";
import { VerificationCodeMetadata as GQLVerificationCodeMetadata } from "../graphql/apiTypes.gen";

// Maximum age of a valid verification code (1 hour)
export const MAX_AGE_MS = 1000 * 60 * 60;
// Maximum number of times a user is able to attempt to verify their verification code
export const MAX_ATTEMPTS = 5;
// Maximum age of a verification code before it can be pruned from the datastore
export const PRUNE_AGE_MS = 1000 * 60 * 60 * 24 * 7;

type VerificationCodeConstructorArgs = {
  id: string;
  code: string;
  emailAddress: string;
  accountId: string;
  userId: string;
  numberOfAttempts: number;
  used: boolean;
  createdAt: Date;
};

class __VerificationCode {
  id: string;
  code: string;
  emailAddress: string;
  accountId: string;
  userId: string;
  numberOfAttempts: number;
  used: boolean;
  createdAt: Date;

  private static generateCode() {
    return (rword.generate(4) as string[]).join("-");
  }

  constructor({
    id,
    code,
    emailAddress,
    accountId,
    userId,
    numberOfAttempts,
    used,
    createdAt,
  }: VerificationCodeConstructorArgs) {
    this.id = id;
    this.code = code;
    this.emailAddress = emailAddress;
    this.accountId = accountId;
    this.userId = userId;
    this.numberOfAttempts = numberOfAttempts;
    this.used = used;
    this.createdAt = createdAt;
  }

  static async create(
    client: DbClient,
    params: { accountId: string; userId: string; emailAddress: string },
  ) {
    const dbVerificationCode = await client.createVerificationCode({
      ...params,
      code: VerificationCode.generateCode(),
    });

    return new VerificationCode(dbVerificationCode);
  }

  static async getById(
    client: DbClient,
    params: { id: string },
  ): Promise<VerificationCode | null> {
    const dbVerificationCode = await client.getVerificationCode(params);

    return dbVerificationCode ? new VerificationCode(dbVerificationCode) : null;
  }

  hasExceededMaximumAttempts() {
    return this.numberOfAttempts >= MAX_ATTEMPTS;
  }

  hasExpired() {
    return this.createdAt.getTime() < new Date().getTime() - MAX_AGE_MS;
  }

  hasBeenUsed() {
    return this.used;
  }

  async incrementAttempts(client: DbClient) {
    await client.incrementVerificationCodeAttempts({
      id: this.id,
      userId: this.userId,
    });
  }

  async setToUsed(client: DbClient) {
    await client.setVerificationCodeToUsed({
      id: this.id,
      userId: this.userId,
    });
    this.used = true;
  }

  toGQLVerificationCodeMetadata(): GQLVerificationCodeMetadata {
    return {
      id: this.id,
      createdAt: this.createdAt.toISOString(),
    };
  }
}

export default __VerificationCode;

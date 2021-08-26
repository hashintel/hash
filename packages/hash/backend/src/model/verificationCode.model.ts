import { rword } from "rword";
import { DBClient } from "../db";
import { VerificationCodeMetadata as GQLVerificationCodeMetadata } from "../graphql/apiTypes.gen";

// Maximum age of a valid verification code (1 hour)
export const MAX_AGE = 1000 * 60 * 60;
// Maximum number of times a user is able to attempt to verify their verification code
export const MAX_ATTEMPTS = 5;

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

class VerificationCode {
  id: string;
  code: string;
  emailAddress: string;
  accountId: string;
  userId: string;
  numberOfAttempts: number;
  used: boolean;
  createdAt: Date;

  private static generateCode = () => (rword.generate(4) as string[]).join("-");

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

  static create =
    (db: DBClient) =>
    (args: { accountId: string; userId: string; emailAddress: string }) =>
      db
        .createVerificationCode({
          ...args,
          code: VerificationCode.generateCode(),
        })
        .then((dbVerificationCode) => new VerificationCode(dbVerificationCode));

  static getById =
    (db: DBClient) =>
    ({ id }: { id: string }): Promise<VerificationCode | null> =>
      db
        .getVerificationCode({ id })
        .then((dbVerificationCode) =>
          dbVerificationCode ? new VerificationCode(dbVerificationCode) : null
        );

  hasExceededMaximumAttempts = () => this.numberOfAttempts >= MAX_ATTEMPTS;

  hasExpired = () => this.createdAt.getTime() < new Date().getTime() - MAX_AGE;

  hasBeenUsed = () => this.used;

  incrementAttempts = (db: DBClient) =>
    db.incrementVerificationCodeAttempts({ id: this.id, userId: this.userId });

  setToUsed = (db: DBClient) =>
    db
      .setVerificationCodeToUsed({ id: this.id, userId: this.userId })
      .then(() => {
        this.used = true;
      });

  toGQLVerificationCodeMetadata = (): GQLVerificationCodeMetadata => ({
    id: this.id,
    createdAt: this.createdAt,
  });
}

export default VerificationCode;

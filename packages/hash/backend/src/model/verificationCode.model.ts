import { rword } from "rword";
import { DBAdapter } from "src/db";
import { VerificationCodeMetadata as GQLVerificationCodeMetadata } from "src/graphql/apiTypes.gen";

// Maximum age of a valid verification code (1 hour)
export const MAX_AGE = 1000 * 60 * 60;
// Maximum number of times a user is able to attempt to verify their verification code
export const MAX_ATTEMPTS = 5;

type VerificationCodeConstructorArgs = {
  id: string;
  code: string;
  userId: string;
  numberOfAttempts: number;
  createdAt: Date;
};

class VerificationCode {
  id: string;
  code: string;
  userId: string;
  numberOfAttempts: number;
  createdAt: Date;

  private static generateCode = () => (rword.generate(4) as string[]).join("-");

  constructor({
    id,
    code,
    userId,
    numberOfAttempts,
    createdAt,
  }: VerificationCodeConstructorArgs) {
    this.id = id;
    this.code = code;
    this.userId = userId;
    this.numberOfAttempts = numberOfAttempts;
    this.createdAt = createdAt;
  }

  static create =
    (db: DBAdapter) =>
    ({ accountId, userId }: { accountId: string; userId: string }) =>
      db
        .createVerificationCode({
          accountId,
          userId,
          code: VerificationCode.generateCode(),
        })
        .then((dbVerificationCode) => new VerificationCode(dbVerificationCode));

  static getById =
    (db: DBAdapter) =>
    ({ id }: { id: string }): Promise<VerificationCode | null> =>
      db
        .getVerificationCode({ id })
        .then((dbVerificationCode) =>
          dbVerificationCode ? new VerificationCode(dbVerificationCode) : null
        );

  hasExceededMaximumAttempts = () => this.numberOfAttempts >= MAX_ATTEMPTS;

  hasExpired = () => this.createdAt.getTime() < new Date().getTime() - MAX_AGE;

  incrementAttempts = (db: DBAdapter) =>
    db.incrementVerificationCodeAttempts({ id: this.id, userId: this.userId });

  toGQLVerificationCodeMetadata = (): GQLVerificationCodeMetadata => ({
    id: this.id,
    createdAt: this.createdAt,
  });
}

export default VerificationCode;

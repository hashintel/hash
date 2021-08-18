import { Connection } from "./types";

import { sql } from "slonik";
import { DBVerificationCode } from "../../types/dbTypes";

/** Insert a row into the entities table. */
export const insertVerificationCode = async (
  conn: Connection,
  params: {
    id: string;
    accountId: string;
    userId: string;
    code: string;
    emailAddress: string;
    createdAt: Date;
  }
): Promise<void> => {
  await conn.query(sql`
    insert into verification_codes (
      verification_id, account_id, user_id,
      verification_code, email_address, created_at
    )
    values (
      ${params.id}, ${params.accountId}, ${params.userId},
      ${params.code}, ${params.emailAddress}, ${params.createdAt.toISOString()}
    )
  `);
};

export const getVerificationCode = async (
  conn: Connection,
  params: { id: string }
): Promise<DBVerificationCode | null> => {
  const row = await conn.one(sql`
    select verification_id, user_id, verification_code, email_address, number_of_attempts, created_at
    from verification_codes
    where verification_id = ${params.id}
  `);
  return {
    id: row["verification_id"] as string,
    userId: row["user_id"] as string,
    code: row["verification_code"] as string,
    emailAddress: row["email_address"] as string,
    numberOfAttempts: row["number_of_attempts"] as number,
    createdAt: new Date(row["created_at"] as string),
  };
};

export const incrementVerificationCodeAttempts = async (
  conn: Connection,
  params: {
    id: string;
    userId: string;
  }
): Promise<void> => {
  await conn.query(sql`
    update verification_codes
    set number_of_attempts = number_of_attempts + 1
    where verification_id = ${params.id} and user_id = ${params.userId}
  `);
};

export const pruneVerificationCodes = async (
  conn: Connection
): Promise<number> => {
  const count = await conn.oneFirst(sql`
    with deleted as (
      delete from verification_codes
      where created_at < (now() - interval '1 day')
      returning *
    )
    select count(*) from deleted
  `);
  return count as number;
};

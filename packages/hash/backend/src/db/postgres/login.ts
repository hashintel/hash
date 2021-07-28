import { Connection } from "./types";
import { LoginCode } from "../adapter";

import { sql } from "slonik";

/** Insert a row into the entities table. */
export const insertLoginCode = async (
  conn: Connection,
  params: {
    loginId: string;
    accountId: string;
    userId: string;
    code: string;
    createdAt: Date;
  }
): Promise<void> => {
  await conn.query(sql`
    insert into login_codes (login_id, account_id, user_id, login_code, created_at)
    values (
      ${params.loginId}, ${params.accountId}, ${params.userId},
      ${params.code}, ${params.createdAt.toISOString()}
    )
  `);
};

export const getLoginCode = async (
  conn: Connection,
  params: { loginId: string }
): Promise<LoginCode | null> => {
  const row = await conn.one(sql`
    select login_id, user_id, login_code, number_of_attempts, created_at
    from login_codes
    where login_id = ${params.loginId}
  `);
  return {
    id: row["login_id"] as string,
    userId: row["user_id"] as string,
    code: row["login_code"] as string,
    numberOfAttempts: row["number_of_attempts"] as number,
    createdAt: new Date(row["created_at"] as string),
  };
};

export const incrementLoginCodeAttempts = async (
  conn: Connection,
  params: {
    loginCode: LoginCode;
  }
): Promise<void> => {
  const { id, userId } = params.loginCode;
  await conn.query(sql`
    update login_codes
    set number_of_attempts = number_of_attempts + 1
    where login_id = ${id} and user_id = ${userId}
  `);
};

export const pruneLoginCodes = async (conn: Connection): Promise<number> => {
  const count = await conn.oneFirst(sql`
    with deleted as (
      delete from login_codes
      where created_at < (now() - interval '1 day')
      returning *
    )
    select count(*) from deleted
  `);
  return count as number;
};

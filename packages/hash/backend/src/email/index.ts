import { LoginCode } from "src/db/adapter";
import { DbUser } from "src/types/dbTypes";

export const sendLoginCodeToUser = async (
  loginCode: LoginCode,
  user: DbUser
): Promise<void> => {
  // TODO: send the login code to the user's inbox
  console.log(
    `Sending login '${loginCode.code}' code to '${user.properties.email}'`
  );
};

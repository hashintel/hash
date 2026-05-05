export const defaultPassword = "test-pw-1ab2";

interface TestUser {
  readonly email: string;
  readonly shortname: string;
  readonly displayName: string;
  readonly password: string;
}

const user = (
  email: string,
  shortname: string,
  displayName: string,
): TestUser => ({
  email,
  shortname,
  displayName,
  password: defaultPassword,
});

/**
 * Pre-defined test users. Every email listed here must also appear in
 * `USER_EMAIL_ALLOW_LIST` in `.env.test`, otherwise signup will be
 * blocked by the allowlist gate.
 *
 * Each test that modifies user state (password, TOTP, etc.) should use
 * its own dedicated user so tests can run in parallel without conflicts.
 */
export const testUsers = {
  // Signin / Signout
  signinTest: user("signin-test@example.com", "signin-test", "Signin Test"),
  signoutTest: user("signout-test@example.com", "signout-test", "Signout Test"),

  // Password
  pwChange: user("pw-change@example.com", "pw-change", "PW Change"),
  pwRecovery: user("pw-recovery@example.com", "pw-recovery", "PW Recovery"),

  // MFA
  mfaEnable: user("mfa-enable@example.com", "mfa-enable", "MFA Enable"),
  mfaLogin: user("mfa-login@example.com", "mfa-login", "MFA Login"),
  mfaBackup: user("mfa-backup@example.com", "mfa-backup", "MFA Backup"),
  mfaDisable: user("mfa-disable@example.com", "mfa-disable", "MFA Disable"),
  mfaWrongCode: user(
    "mfa-wrong-code@example.com",
    "mfa-wrong-code",
    "MFA Wrong Code",
  ),

  // Signup
  signupAllowlisted: user(
    "signup-allow@example.com",
    "signup-allow",
    "Signup Allow",
  ),
} as const;

local claims = std.extVar('claims');

local email =
  if "email" in claims && claims.email != "" then claims.email
  else error "Google OIDC: no email claim found in token";

{
  identity: {
    traits: {
      emails: [email],
    },
    verified_addresses: if "email_verified" in claims && claims.email_verified then [
      {
        value: email,
        via: "email",
      },
    ] else [],
  },
}

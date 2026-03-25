local claims = std.extVar('claims');

// Microsoft may provide email via 'email', 'preferred_username', or 'upn'
local email =
  if "email" in claims && claims.email != "" then claims.email
  else if "preferred_username" in claims && claims.preferred_username != "" then claims.preferred_username
  else claims.upn;

{
  identity: {
    traits: {
      emails: [email],
    },
    // Microsoft Entra ID emails are verified by the directory
    verified_addresses: [
      {
        value: email,
        via: "email",
      },
    ],
  },
}

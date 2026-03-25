local claims = std.extVar('claims');

// Microsoft may provide email via 'email', 'preferred_username', or 'upn'
local email =
  if "email" in claims && claims.email != "" then claims.email
  else if "preferred_username" in claims && claims.preferred_username != "" then claims.preferred_username
  else if "upn" in claims && claims.upn != "" then claims.upn
  else error "Microsoft OIDC: no email claim found in token";

{
  identity: {
    traits: {
      emails: [email],
    },
    // Microsoft Entra ID verifies directory emails; check email_verified
    // claim if present, otherwise trust the directory.
    verified_addresses: if "email_verified" in claims then (
      if claims.email_verified then [
        { value: email, via: "email" },
      ] else []
    ) else [
      { value: email, via: "email" },
    ],
  },
}

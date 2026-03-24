local claims = std.extVar('claims');
{
  identity: {
    traits: {
      emails: [claims.email],
    },
    verified_addresses: if "email_verified" in claims && claims.email_verified then [
      {
        value: claims.email,
        via: "email",
      },
    ] else [],
  },
}

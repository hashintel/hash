permit (
  principal in HASH::Web::Role::"{role_id}",
  action in [HASH::Action::"update", HASH::Action::"view"],
  resource in HASH::Web::"{web_id}"
);

permit (
  principal in HASH::Team::Role::"{admin_role_id}",
  action == HASH::Action::"update",
  resource == HASH::Entity::"{entity_id}"
);

permit (
  principal in HASH::Team::Role::"{member_role_id}",
  action == HASH::Action::"update",
  resource == HASH::Entity::"{entity_id}"
);

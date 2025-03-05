permit (
  principal in HASH::Team::"{team_id}",
  action == HASH::Action::"update",
  resource == HASH::Entity::"{entity_id}"
);

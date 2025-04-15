permit (
  principal in HASH::Team::"{team_id}",
  action in [HASH::Action::"update"],
  resource == HASH::Entity::"{entity_id}"
);

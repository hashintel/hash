permit (
  principal in HASH::Subteam::"{team_id}",
  action in [HASH::Action::"update"],
  resource == HASH::Entity::"{entity_id}"
);

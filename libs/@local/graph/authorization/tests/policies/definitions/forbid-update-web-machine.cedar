forbid (
  principal is HASH::User,
  action == HASH::Action::"update",
  resource is HASH::Entity
)
when
{
  resource.entity_types.contains(HASH::EntityType::"https://hash.ai/@h/types/entity-type/machine/v/1") ||
  resource.entity_types.contains(HASH::EntityType::"https://hash.ai/@h/types/entity-type/machine/v/2")
};

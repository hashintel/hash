permit (
  principal,
  action in [HASH::Action::"view"],
  resource is HASH::Entity in HASH::Web::"{system_web_id}"
);

permit (
  principal,
  action in [HASH::Action::"view"],
  resource is HASH::Entity
)
when
{
  resource.entity_types.contains(HASH::EntityType::"https://hash.ai/@h/types/entity-type/actor/v/2") ||
  resource.entity_types.contains(HASH::EntityType::"https://hash.ai/@h/types/entity-type/organization/v/2")
};

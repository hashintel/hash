permit (
  principal,
  action == HASH::Action::"view",
  resource is HASH::Entity in HASH::Web::"{system_web_id}"
);

permit (
  principal,
  action == HASH::Action::"view",
  resource is HASH::Entity
)
when
{
  resource.entity_types
    .containsAny
    (
      [HASH::EntityType::"https://hash.ai/@h/types/entity-type/actor/v/2",
       HASH::EntityType::"https://hash.ai/@h/types/entity-type/organization/v/2"]
    )
};

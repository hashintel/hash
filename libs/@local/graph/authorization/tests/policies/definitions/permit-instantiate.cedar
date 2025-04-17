permit (
  principal,
  action in [HASH::Action::"instantiate"],
  resource is HASH::EntityType
)
unless
{
  resource.base_url == "https://hash.ai/@h/types/entity-type/actor/" ||
  resource.base_url == "https://hash.ai/@h/types/entity-type/machine/" ||
  resource.base_url == "https://hash.ai/@h/types/entity-type/user/" ||
  resource.base_url == "https://hash.ai/@h/types/entity-type/organization/" ||
  resource.base_url == "https://hash.ai/@h/types/entity-type/hash-instance/"
};

permit (
  principal == HASH::Machine::"{system_machine_id}",
  action in [HASH::Action::"instantiate"],
  resource is HASH::EntityType
);

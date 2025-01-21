package policies

import rego.v1

user_policies contains policy if {
	input.principal.type == "user"
	some user_principal, user in data.users
	glob.match(user_principal, null, input.principal.id)

	some user_policy in user.policies
	some policy in user.policies
}

user_policies contains policy if {
	input.principal.type == "user"
	some user_principal, user in data.users
	user_principal == input.principal.id
	some organization in user.organizations
	some role in graph.reachable(data.organizations[organization.name].roles, organization.roles)
	some policy in data.organizations[organization.name].policies[role]
}

any_entity_policy(entity_id, policies, level) if {
	some policy in policies
	policy.effect.type == "deny"
	policy.effect.level >= level
	entity_condition(data.entities[entity_id], policy)
}

all_policies contains entity_id if {
	some entity_id, entity in data.entities
	some policy in user_policies
	policy.effect.type == "allow"
	entity_condition(entity, policy)
	not any_entity_policy(entity_id, user_policies, policy.effect.level)
}

entity_condition(entity, policy) if {
	entity.owner == policy.resource.owner
}

entity_condition(entity, policy) if {
	entity.property == policy.resource.property
}

entity_condition(entity, policy) if {
	entity.type == policy.resource.type
}

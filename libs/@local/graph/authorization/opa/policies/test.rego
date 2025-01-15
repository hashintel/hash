package policies

import rego.v1

user_policies contains policy if {
	input.principal.type == "user"
	some user_principal, user in data.users
	glob.match(user_principal, null, input.principal.id)

	# policies = user.policies
	# principal := concat(":", ["user", user_principal])

	# policies := {policy |
	some user_policy in user.policies
	some policy in user.policies
}

# policies = is_entity_allowed(data.entities[input.resource], user_policy)
# policy = user_policy
# }

user_policies contains policy if {
	input.principal.type == "user"
	some user_principal, user in data.users
	user_principal == input.principal.id
	some organization in user.organizations

	# print("principal:", user_principal, " organization:", organization, "user:", user)
	some role in graph.reachable(data.organizations[organization.name].roles, organization.roles)

	# principal := concat(":", ["org", organization.name, "role"])

	# policies := {policy |
	some policy in data.organizations[organization.name].policies[role]
}

entity_policy if {
	some entity_id, entity in data.entities
	some policy in user_policies
	entity_condition(entity, policy)
}

# policies = is_entity_allowed(data.entities[input.resource], policy)
# }

# allow_entity[entity_id] := policies if {}
#
allowed_policies contains policy if {
	some policy in user_policies
	some entity in data.entities
	entity_condition(entity, policy)
	policy.effect.type == "allow"
}

denied_policies contains policy if {
	some policy in user_policies
	some entity in data.entities
	entity_condition(entity, policy)
	policy.effect.type == "deny"
}

has_higher_policy(policies, level) := policy if {
	some policy in policies
	policy.effect.level > level
	policy.effect.type == "allow"
}

has_lower_negative_policy(policies, level) := policy if {
	some policy in policies
	policy.effect.level < level
	policy.effect.type == "deny"
}

has_higher_negative_policy(policies, level) := policy if {
	some policy in policies
	policy.effect.level >= level
	policy.effect.type == "deny"
}

all_policies if {
	some policy in user_policies
	some entity in data.entities
	policy.effect.type == "allow"
	entity_condition(entity, policy)
	not has_higher_negative_policy(user_policies, policy.effect.level)
}

all_policies if {
	some policy in user_policies
	some entity in data.entities
	policy.effect.type == "allow"
	entity_condition(entity, policy)

	every neg_policy in user_policies {
		neg_policy.effect.level >= policy.effect.level
		neg_policy.effect.type == "deny"
		not_entity_condition(entity, neg_policy)
	}
}

# all_policies if {
# 	some policy in user_policies
# 	some entity in data.entities
# 	policy.effect.type == "allow"
# 	entity_condition(entity, policy)
# 	neg_policy := has_lower_negative_policy(user_policies, policy.effect.level)
# 	not_entity_condition(entity, neg_policy)
# }

# all_policies if {
# 	some neg_policy in user_policies
# 	some entity in data.entities
# 	neg_policy.effect.type == "deny"
# 	not_entity_condition(entity, neg_policy)
# 	policy := has_higher_policy(user_policies, neg_policy.effect.level)
# 	entity_condition(entity, policy)
# }

# policy.effect.type == "deny"

# all_policies := array.concat([policy | some policy in allowed_policies], [policy | some policy in denied_policies])

allow contains entity_id if {
	some entity_id, entity in data.entities

	max({level |
		some policy in allowed_policies
		level = policy.effect.level
	}) > max({level |
		some policy in denied_policies
		level = policy.effect.level
	} | {-1})
}

# print(is_entity_denied(entity, policy))

# not is_entity_denied(entity, policy)
# print(effect)

# })

# print(max({effect | some effect in user_policies}))

# entity := input.entities[input.entity]
#
default entity_condition(entity, policy) := false

entity_condition(entity, policy) if {
	# print("positive owner", entity.owner, policy.resource.owner)
	entity.owner == policy.resource.owner
}

entity_condition(entity, policy) if {
	# print("positive value", entity.value, policy.resource.value)
	entity.value == policy.resource.value
}

entity_condition(entity, policy) if {
	# print("positive type", entity.type, policy.resource.type)
	entity.type == policy.resource.type
}

default not_entity_condition(entity, policy) := true

not_entity_condition(entity, policy) if {
	# print("negative owner", entity.owner, policy.resource.owner)
	entity.owner != policy.resource.owner
}

not_entity_condition(entity, policy) if {
	# print("negative value", entity.value, policy.resource.value)
	entity.value != policy.resource.value
}

not_entity_condition(entity, policy) if {
	# print("negative type", entity.type, policy.resource.type)
	entity.type != policy.resource.type
}

# is_entity_allowed(entity, policy) contains level if {
# entity_condition(entity, policy)
# policy.effect.type == "allow"
# level == policy.effect.level
# }
# is_entity_denied(entity, policy) contains level if {
# 	entity_condition(entity, policy)
# 	policy.effect.type == "deny"
# 	level = policy.effect.level
# }
# is_entity_denied(entity, policy) := effect if {
# 	# print(entity, policy)
# 	entity.owner == policy.resource.owner
# 	# print(policy.effect.level, level)
# 	policy.effect.type == "deny"
# 	# policy.effect.level >= level
# 	effect = {"type": "deny", "level": policy.effect.level}
# }
# policy.owner == input.resource.owner
# policy.effect == "allow"

use core::error::Error;

use hash_graph_authorization::{
    AuthorizationApi,
    policies::{
        Effect, Policy, PolicyId,
        action::ActionName,
        principal::{
            PrincipalConstraint,
            role::RoleId,
            team::{SubteamId, TeamId},
        },
        resource::{EntityResourceConstraint, EntityResourceFilter, ResourceConstraint},
        store::{CreateWebParameter, PrincipalStore as _},
    },
};
use hash_graph_postgres_store::store::{AsClient, PostgresStore};
use type_system::{
    knowledge::entity::id::EntityUuid,
    provenance::{ActorEntityUuid, ActorId, ActorType, AiId, MachineId, UserId},
    web::OwnedById,
};
use uuid::Uuid;

use crate::DatabaseTestWrapper;

/// Struct to hold all the IDs created during test setup for easier reference
#[expect(
    dead_code,
    reason = "It's easier to reference the IDs in the test code"
)]
struct TestPolicyEnvironment {
    // Teams
    web1: OwnedById,
    web2: OwnedById,
    subteam1: SubteamId,
    subteam2: SubteamId,
    nested_subteam: SubteamId,

    // Roles
    web1_role: RoleId,
    web2_role: RoleId,
    subteam1_role: RoleId,
    subteam2_role: RoleId,
    nested_subteam_role: RoleId,

    // Actors
    user1: UserId,
    user2: UserId,
    machine_id: MachineId,
    ai_id: AiId,

    // Policies
    policies: TestPolicyIds,
}

/// Struct to hold all policy IDs for easier reference
struct TestPolicyIds {
    global: PolicyId,
    user_type: PolicyId,
    machine_type: PolicyId,
    user1: PolicyId,
    web1_role: PolicyId,
    subteam1: PolicyId,
    web2_role_user: PolicyId,
    deny_user1: PolicyId,
}

/// Sets up a complete test environment with various principals and relationships
///
/// The test environment creates the following structure:
///
/// ```text
///            ┌─────────┐
///            │  web 1  │─────────────┐
///            └────┬────┘             │
///                 │                  │
///       ┌─────────┴──────────┐       │
///       │                    │       │
///  ┌────┴────┐          ┌────┴────┐  │
///  │subteam 1│──────────│subteam 2│  │
///  └────┬────┘          └─────────┘  │
///       │                            │
///       │                            │
///  ┌────┴─────┐                      │
///  │nested_sub│                      │
///  └──────────┘                      │
///                                    │
///           ┌─────────┐              │
///           │  web 2  │──────────────┘
///           └─────────┘
///
/// ROLES:
/// - user1 → web1_role
/// - user2 → subteam1_role, web2_role
/// - machine → subteam2_role
/// - ai → nested_subteam_role
///
/// POLICIES:
/// - global (all)
/// - user_type → User
/// - machine_type → Machine
/// - user1 → specific to user1
/// - web1_role → role specific
/// - web2_role_user → role with actor type constraint
/// - subteam1 → team based
/// - deny_user1 → forbid policy
/// ```
#[expect(clippy::too_many_lines)]
async fn setup_policy_test_environment(
    client: &mut PostgresStore<impl AsClient, impl AuthorizationApi>,
    actor_id: ActorId,
) -> Result<TestPolicyEnvironment, Box<dyn Error>> {
    // Register actions
    client.register_action(ActionName::Create).await?;
    client.register_action(ActionName::View).await?;
    client.register_action(ActionName::ViewEntity).await?;
    client.register_action(ActionName::Update).await?;
    client.register_action(ActionName::Instantiate).await?;

    // Create web teams (top level)
    let web1_id = client
        .create_web(actor_id, CreateWebParameter { id: None })
        .await?;
    let web2_id = client
        .create_web(actor_id, CreateWebParameter { id: None })
        .await?;

    // Create subteams with different hierarchies
    let subteam_1_id = client.create_subteam(None, TeamId::Web(web1_id)).await?;
    let subteam_2_id = client.create_subteam(None, TeamId::Web(web1_id)).await?;
    let nested_subteam_id = client
        .create_subteam(None, TeamId::Subteam(subteam_1_id))
        .await?;

    // Create roles for each team
    let web_1_role_id = client.create_role(None, TeamId::Web(web1_id)).await?;
    let web_2_role_id = client.create_role(None, TeamId::Web(web2_id)).await?;
    let subteam1_role_id = client
        .create_role(None, TeamId::Subteam(subteam_1_id))
        .await?;
    let subteam2_role_id = client
        .create_role(None, TeamId::Subteam(subteam_2_id))
        .await?;
    let nested_subteam_role_id = client
        .create_role(None, TeamId::Subteam(nested_subteam_id))
        .await?;

    // Create actors of different types
    let user1_id = client.create_user(None).await?;
    let user2_id = client.create_user(None).await?;
    let machine_id = client.create_machine(None).await?;
    let ai_id = client.create_ai(None).await?;

    // Assign roles to actors in different combinations
    client
        .assign_role_to_actor(ActorId::User(user1_id), web_1_role_id)
        .await?;
    client
        .assign_role_to_actor(ActorId::User(user2_id), subteam1_role_id)
        .await?;
    client
        .assign_role_to_actor(ActorId::User(user2_id), web_2_role_id)
        .await?;
    client
        .assign_role_to_actor(ActorId::Machine(machine_id), subteam2_role_id)
        .await?;
    client
        .assign_role_to_actor(ActorId::Ai(ai_id), nested_subteam_role_id)
        .await?;

    // Create policies of various types

    // 1. Global policies (no principal constraint)
    let global_policy_id = client
        .create_policy(Policy {
            id: PolicyId::new(Uuid::new_v4()),
            effect: Effect::Permit,
            principal: None,
            actions: vec![ActionName::All],
            resource: None,
            constraints: None,
        })
        .await?;

    // 2. Actor type specific policies
    let user_type_policy_id = client
        .create_policy(Policy {
            id: PolicyId::new(Uuid::new_v4()),
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::ActorType {
                actor_type: ActorType::User,
            }),
            actions: vec![ActionName::View],
            resource: None,
            constraints: None,
        })
        .await?;

    let machine_type_policy_id = client
        .create_policy(Policy {
            id: PolicyId::new(Uuid::new_v4()),
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::ActorType {
                actor_type: ActorType::Machine,
            }),
            actions: vec![ActionName::Update],
            resource: None,
            constraints: None,
        })
        .await?;

    // 3. Specific actor policies
    let user1_policy_id = client
        .create_policy(Policy {
            id: PolicyId::new(Uuid::new_v4()),
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::Actor {
                actor: ActorId::User(user1_id),
            }),
            actions: vec![ActionName::Create],
            resource: None,
            constraints: None,
        })
        .await?;

    // 4. Role-based policies
    let web1_role_policy_id = client
        .create_policy(Policy {
            id: PolicyId::new(Uuid::new_v4()),
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::Role {
                role: web_1_role_id,
                actor_type: None,
            }),
            actions: vec![ActionName::Instantiate],
            resource: None,
            constraints: None,
        })
        .await?;

    // 5. Team-based policies
    let subteam1_policy_id = client
        .create_policy(Policy {
            id: PolicyId::new(Uuid::new_v4()),
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::Team {
                team: TeamId::Subteam(subteam_1_id),
                actor_type: None,
            }),
            actions: vec![ActionName::ViewEntity],
            resource: None,
            constraints: None,
        })
        .await?;

    // 6. Role with actor type constraint
    let web2_role_user_policy_id = client
        .create_policy(Policy {
            id: PolicyId::new(Uuid::new_v4()),
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::Role {
                role: web_2_role_id,
                actor_type: Some(ActorType::User),
            }),
            actions: vec![ActionName::Create],
            resource: None,
            constraints: None,
        })
        .await?;

    // 7. Deny policies for testing priority
    let deny_user1_policy_id = client
        .create_policy(Policy {
            id: PolicyId::new(Uuid::new_v4()),
            effect: Effect::Forbid,
            principal: Some(PrincipalConstraint::Actor {
                actor: ActorId::User(user1_id),
            }),
            actions: vec![ActionName::Update],
            resource: None,
            constraints: None,
        })
        .await?;

    Ok(TestPolicyEnvironment {
        // Teams
        web1: web1_id,
        web2: web2_id,
        subteam1: subteam_1_id,
        subteam2: subteam_2_id,
        nested_subteam: nested_subteam_id,

        // Roles
        web1_role: web_1_role_id,
        web2_role: web_2_role_id,
        subteam1_role: subteam1_role_id,
        subteam2_role: subteam2_role_id,
        nested_subteam_role: nested_subteam_role_id,

        // Actors
        user1: user1_id,
        user2: user2_id,
        machine_id,
        ai_id,

        // Policies
        policies: TestPolicyIds {
            global: global_policy_id,
            user_type: user_type_policy_id,
            machine_type: machine_type_policy_id,
            user1: user1_policy_id,
            web1_role: web1_role_policy_id,
            subteam1: subteam1_policy_id,
            web2_role_user: web2_role_user_policy_id,
            deny_user1: deny_user1_policy_id,
        },
    })
}

#[tokio::test]
async fn global_policies() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    let env = setup_policy_test_environment(&mut client, actor_id).await?;

    // Every actor should get global policies
    let user1_policies = client
        .get_policies_for_actor(ActorId::User(env.user1))
        .await?;
    let user2_policies = client
        .get_policies_for_actor(ActorId::User(env.user2))
        .await?;
    let machine_policies = client
        .get_policies_for_actor(ActorId::Machine(env.machine_id))
        .await?;
    let ai_policies = client
        .get_policies_for_actor(ActorId::Ai(env.ai_id))
        .await?;
    let nonexisting_policies = client
        .get_policies_for_actor(ActorId::User(UserId::new(ActorEntityUuid::new(
            EntityUuid::new(Uuid::new_v4()),
        ))))
        .await?;

    // All actors should have the global policy
    assert!(
        user1_policies.contains_key(&env.policies.global),
        "User1 should have global policy"
    );
    assert!(
        user2_policies.contains_key(&env.policies.global),
        "User2 should have global policy"
    );
    assert!(
        machine_policies.contains_key(&env.policies.global),
        "Machine should have global policy"
    );
    assert!(
        ai_policies.contains_key(&env.policies.global),
        "AI should have global policy"
    );
    assert!(
        nonexisting_policies.contains_key(&env.policies.global),
        "Non-existent actor should have global policy"
    );

    Ok(())
}

#[tokio::test]
async fn actor_type_policies() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    let env = setup_policy_test_environment(&mut client, actor_id).await?;

    // Test user type policies
    let user1_policies = client
        .get_policies_for_actor(ActorId::User(env.user1))
        .await?;
    let user2_policies = client
        .get_policies_for_actor(ActorId::User(env.user2))
        .await?;
    let machine_policies = client
        .get_policies_for_actor(ActorId::Machine(env.machine_id))
        .await?;
    let nonexisting_machine_policies = client
        .get_policies_for_actor(ActorId::Machine(MachineId::new(ActorEntityUuid::new(
            EntityUuid::new(Uuid::new_v4()),
        ))))
        .await?;

    // Users should have user type policies, machines should not
    assert!(
        user1_policies.contains_key(&env.policies.user_type),
        "User1 should have user type policy"
    );
    assert!(
        user2_policies.contains_key(&env.policies.user_type),
        "User2 should have user type policy"
    );
    assert!(
        !machine_policies.contains_key(&env.policies.user_type),
        "Machine should not have user type policy"
    );
    assert!(
        !nonexisting_machine_policies.contains_key(&env.policies.user_type),
        "Non-existent machine should not have access"
    );

    // Machines should have machine type policies, users should not
    assert!(
        !user1_policies.contains_key(&env.policies.machine_type),
        "User1 should not have machine type policy"
    );
    assert!(
        !user2_policies.contains_key(&env.policies.machine_type),
        "User2 should not have machine type policy"
    );
    assert!(
        machine_policies.contains_key(&env.policies.machine_type),
        "Machine should have machine type policy"
    );
    assert!(
        nonexisting_machine_policies.contains_key(&env.policies.machine_type),
        "Non-existent machine should have machine type policy"
    );

    Ok(())
}

#[tokio::test]
async fn specific_actor_policies() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    let env = setup_policy_test_environment(&mut client, actor_id).await?;

    // user1 has a specific policy assigned
    let user1_policies = client
        .get_policies_for_actor(ActorId::User(env.user1))
        .await?;
    let user2_policies = client
        .get_policies_for_actor(ActorId::User(env.user2))
        .await?;
    let nonexisting_user_policies = client
        .get_policies_for_actor(ActorId::User(UserId::new(ActorEntityUuid::new(
            EntityUuid::new(Uuid::new_v4()),
        ))))
        .await?;

    // User1 should have its specific policy, user2 should not
    assert!(
        user1_policies.contains_key(&env.policies.user1),
        "User1 should have its specific policy"
    );
    assert!(
        !user2_policies.contains_key(&env.policies.user1),
        "User2 should not have User1's policy"
    );
    assert!(
        !nonexisting_user_policies.contains_key(&env.policies.user1),
        "Non-existent user should not have User1's policy"
    );

    Ok(())
}

#[tokio::test]
async fn role_based_policies() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    let env = setup_policy_test_environment(&mut client, actor_id).await?;

    // Test role-based policies
    let user1_policies = client
        .get_policies_for_actor(ActorId::User(env.user1))
        .await?;
    let user2_policies = client
        .get_policies_for_actor(ActorId::User(env.user2))
        .await?;

    // User1 has web1_role, should have its policies
    assert!(
        user1_policies.contains_key(&env.policies.web1_role),
        "User1 should have web1_role policy"
    );

    // User2 has web2_role and should have type-constrained policy for that role
    assert!(
        user2_policies.contains_key(&env.policies.web2_role_user),
        "User2 should have web2_role_user policy"
    );

    // Create a machine with web1_role to test actor type constraints
    let special_machine_id = client.create_machine(None).await?;
    client
        .assign_role_to_actor(ActorId::Machine(special_machine_id), env.web1_role)
        .await?;
    client
        .assign_role_to_actor(ActorId::Machine(special_machine_id), env.web2_role)
        .await?;

    let machine_policies = client
        .get_policies_for_actor(ActorId::Machine(special_machine_id))
        .await?;

    // Machine has web1_role but should still get role-based policies without actor type constraints
    assert!(
        machine_policies.contains_key(&env.policies.web1_role),
        "Machine with web1_role should get its policies"
    );
    // Machine has web2_role but should not get role-based policies with actor type constraints
    assert!(
        !machine_policies.contains_key(&env.policies.web2_role_user),
        "Machine with web2_role should not get its policies"
    );

    Ok(())
}

#[tokio::test]
async fn team_hierarchy_policies() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    let env = setup_policy_test_environment(&mut client, actor_id).await?;

    // Test team hierarchies
    // User2 has subteam1_role, AI has nested_subteam_role which is under subteam1
    let user2_policies = client
        .get_policies_for_actor(ActorId::User(env.user2))
        .await?;
    let ai_policies = client
        .get_policies_for_actor(ActorId::Ai(env.ai_id))
        .await?;

    // User2 should have subteam1's policies
    assert!(
        user2_policies.contains_key(&env.policies.subteam1),
        "User2 should have subteam1 policy"
    );

    // AI with nested_subteam_role should inherit policies from parent subteam1
    assert!(
        ai_policies.contains_key(&env.policies.subteam1),
        "AI should inherit subteam1 policy through team hierarchy"
    );

    Ok(())
}

#[tokio::test]
async fn policy_count_and_content() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    let env = setup_policy_test_environment(&mut client, actor_id).await?;

    let nonexistent_id = UserId::new(ActorEntityUuid::new(EntityUuid::new(Uuid::new_v4())));

    let user1_policies = client
        .get_policies_for_actor(ActorId::User(env.user1))
        .await?;
    let user2_policies = client
        .get_policies_for_actor(ActorId::User(env.user2))
        .await?;
    let machine_policies = client
        .get_policies_for_actor(ActorId::Machine(env.machine_id))
        .await?;
    let ai_policies = client
        .get_policies_for_actor(ActorId::Ai(env.ai_id))
        .await?;
    let nonexistent_policies = client
        .get_policies_for_actor(ActorId::User(nonexistent_id))
        .await?;

    // Verify that we have at least one policy for each actor
    assert_eq!(user1_policies.len(), 5);
    assert_eq!(user2_policies.len(), 4);
    assert_eq!(machine_policies.len(), 2);
    assert_eq!(ai_policies.len(), 2);
    assert_eq!(nonexistent_policies.len(), 2);

    // Verify policy content for one case - ensuring actions are preserved correctly
    let web1_role_policy = &user1_policies[&env.policies.web1_role];
    assert_eq!(
        web1_role_policy.actions,
        vec![ActionName::Instantiate],
        "web1_role policy should have Instantiate action"
    );

    let deny_policy = &user1_policies[&env.policies.deny_user1];
    assert_eq!(
        deny_policy.effect,
        Effect::Forbid,
        "Deny policy should have Forbid effect"
    );
    assert_eq!(
        deny_policy.actions,
        vec![ActionName::Update],
        "Deny policy should have Update action"
    );

    Ok(())
}

#[tokio::test]
async fn role_assignment_changes() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    let env = setup_policy_test_environment(&mut client, actor_id).await?;

    // Initial policy count
    let user2_policies = client
        .get_policies_for_actor(ActorId::User(env.user2))
        .await?;
    let initial_count = user2_policies.len();
    let has_web2_policy = user2_policies.contains_key(&env.policies.web2_role_user);
    assert!(
        has_web2_policy,
        "User2 should initially have web2_role_user policy"
    );

    // Remove web2_role from user2
    client
        .unassign_role_from_actor(ActorId::User(env.user2), env.web2_role)
        .await?;

    // Should have fewer policies now
    let updated_policies = client
        .get_policies_for_actor(ActorId::User(env.user2))
        .await?;
    assert!(
        !updated_policies.contains_key(&env.policies.web2_role_user),
        "User2 should no longer have web2_role_user policy after role removal"
    );
    assert!(
        updated_policies.len() < initial_count,
        "User2 should have fewer policies after role removal"
    );

    // Add a different role (web1_role)
    client
        .assign_role_to_actor(ActorId::User(env.user2), env.web1_role)
        .await?;

    // Should have different policies now after adding a new role
    let final_policies = client
        .get_policies_for_actor(ActorId::User(env.user2))
        .await?;

    // We should have more policies after adding a role
    assert!(
        final_policies.len() > updated_policies.len(),
        "Adding a role should increase the number of policies"
    );

    // Verify that we have the policies we expect
    assert_eq!(
        final_policies.len(),
        updated_policies.len() + 1,
        "Should have exactly one more policy after adding web1_role"
    );

    Ok(())
}

#[tokio::test]
async fn resource_constraints_are_preserved() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.seed([]).await?;

    let user_id = client.create_user(None).await?;
    client.register_action(ActionName::All).await?;

    // Create a policy with resource constraints
    let resource_policy_id = client
        .create_policy(Policy {
            id: PolicyId::new(Uuid::new_v4()),
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::Actor {
                actor: ActorId::User(user_id),
            }),
            actions: vec![ActionName::All],
            resource: Some(ResourceConstraint::Entity(EntityResourceConstraint::Any {
                filter: EntityResourceFilter::All {
                    filters: Vec::new(),
                },
            })),
            constraints: None,
        })
        .await?;

    let policies = client
        .get_policies_for_actor(ActorId::User(user_id))
        .await?;

    // Ensure resource constraint is preserved
    assert!(
        policies.contains_key(&resource_policy_id),
        "Policy should be retrievable"
    );
    assert!(
        policies[&resource_policy_id].resource.is_some(),
        "Resource constraint should be preserved"
    );

    // Check that the resource constraint is the same one we set
    match &policies[&resource_policy_id].resource {
        Some(ResourceConstraint::Entity(EntityResourceConstraint::Any { .. })) => {
            // Constraint type preserved correctly
        }
        _ => panic!("Resource constraint not preserved correctly"),
    }

    Ok(())
}

#[tokio::test]
async fn multiple_actor_roles() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    // Create teams and roles
    let web_id = client
        .create_web(actor_id, CreateWebParameter { id: None })
        .await?;
    let role1_id = client.create_role(None, TeamId::Web(web_id)).await?;
    let role2_id = client.create_role(None, TeamId::Web(web_id)).await?;
    let role3_id = client.create_role(None, TeamId::Web(web_id)).await?;

    // Create user with multiple roles
    let user_id = client.create_user(None).await?;
    client
        .assign_role_to_actor(ActorId::User(user_id), role1_id)
        .await?;
    client
        .assign_role_to_actor(ActorId::User(user_id), role2_id)
        .await?;
    client
        .assign_role_to_actor(ActorId::User(user_id), role3_id)
        .await?;

    // Create policies for each role
    let policy1_id = client
        .create_policy(Policy {
            id: PolicyId::new(Uuid::new_v4()),
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::Role {
                role: role1_id,
                actor_type: None,
            }),
            actions: vec![ActionName::All],
            resource: None,
            constraints: None,
        })
        .await?;

    let policy2_id = client
        .create_policy(Policy {
            id: PolicyId::new(Uuid::new_v4()),
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::Role {
                role: role2_id,
                actor_type: None,
            }),
            actions: vec![ActionName::All],
            resource: None,
            constraints: None,
        })
        .await?;

    let policy3_id = client
        .create_policy(Policy {
            id: PolicyId::new(Uuid::new_v4()),
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::Role {
                role: role3_id,
                actor_type: None,
            }),
            actions: vec![ActionName::All],
            resource: None,
            constraints: None,
        })
        .await?;

    // Verify all policies are retrieved
    let policies = client
        .get_policies_for_actor(ActorId::User(user_id))
        .await?;

    assert!(
        policies.contains_key(&policy1_id),
        "Should get policy for role1"
    );
    assert!(
        policies.contains_key(&policy2_id),
        "Should get policy for role2"
    );
    assert!(
        policies.contains_key(&policy3_id),
        "Should get policy for role3"
    );
    assert!(
        policies.len() >= 3,
        "Should get at least the 3 role policies"
    );

    Ok(())
}

#[tokio::test]
async fn deep_team_hierarchy() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    // Create a deep team hierarchy
    let web_id = client
        .create_web(actor_id, CreateWebParameter { id: None })
        .await?;
    let subteam1_id = client.create_subteam(None, TeamId::Web(web_id)).await?;
    let subteam2_id = client
        .create_subteam(None, TeamId::Subteam(subteam1_id))
        .await?;
    let subteam3_id = client
        .create_subteam(None, TeamId::Subteam(subteam2_id))
        .await?;
    let subteam4_id = client
        .create_subteam(None, TeamId::Subteam(subteam3_id))
        .await?;
    let subteam5_id = client
        .create_subteam(None, TeamId::Subteam(subteam4_id))
        .await?;

    // Create roles
    let subteam5_role_id = client
        .create_role(None, TeamId::Subteam(subteam5_id))
        .await?;

    // Create user assigned to the deepest role
    let user_id = client.create_user(None).await?;
    client
        .assign_role_to_actor(ActorId::User(user_id), subteam5_role_id)
        .await?;

    // Create policies
    let web_policy_id = client
        .create_policy(Policy {
            id: PolicyId::new(Uuid::new_v4()),
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::Team {
                team: TeamId::Web(web_id),
                actor_type: None,
            }),
            actions: vec![ActionName::All],
            resource: None,
            constraints: None,
        })
        .await?;

    let subteam1_policy_id = client
        .create_policy(Policy {
            id: PolicyId::new(Uuid::new_v4()),
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::Team {
                team: TeamId::Subteam(subteam1_id),
                actor_type: None,
            }),
            actions: vec![ActionName::All],
            resource: None,
            constraints: None,
        })
        .await?;

    let subteam5_policy_id = client
        .create_policy(Policy {
            id: PolicyId::new(Uuid::new_v4()),
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::Team {
                team: TeamId::Subteam(subteam5_id),
                actor_type: None,
            }),
            actions: vec![ActionName::All],
            resource: None,
            constraints: None,
        })
        .await?;

    // User should get all policies through the hierarchy
    let policies = client
        .get_policies_for_actor(ActorId::User(user_id))
        .await?;

    assert!(
        policies.contains_key(&web_policy_id),
        "User should inherit web team policy"
    );
    assert!(
        policies.contains_key(&subteam1_policy_id),
        "User should inherit subteam1 policy"
    );
    assert!(
        policies.contains_key(&subteam5_policy_id),
        "User should have direct subteam5 policy"
    );

    Ok(())
}

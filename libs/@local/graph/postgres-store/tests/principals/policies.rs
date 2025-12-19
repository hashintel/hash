use alloc::borrow::Cow;
use core::error::Error;
use std::collections::{HashMap, HashSet};

use hash_graph_authorization::policies::{
    Effect, PolicyId,
    action::ActionName,
    principal::PrincipalConstraint,
    resource::{EntityResourceConstraint, EntityResourceFilter, ResourceConstraint},
    store::{
        CreateWebParameter, PolicyCreationParams, PolicyStore as _, PrincipalStore as _,
        ResolvePoliciesParams,
    },
};
use hash_graph_postgres_store::store::{AsClient, PostgresStore};
use pretty_assertions::assert_eq;
use type_system::principal::{
    actor::{ActorId, ActorType, AiId, MachineId, UserId},
    actor_group::{ActorGroupId, TeamId, WebId},
    role::{RoleId, RoleName},
};
use uuid::Uuid;

use crate::DatabaseTestWrapper;

/// Struct to hold all the IDs created during test setup for easier reference.
#[expect(
    dead_code,
    reason = "It's easier to reference the IDs in the test code"
)]
struct TestPolicyEnvironment {
    // Teams
    web1: WebId,
    web2: WebId,
    team1: TeamId,
    team2: TeamId,
    nested_team: TeamId,

    // Roles
    web1_role: RoleId,
    web2_role: RoleId,
    team1_role: RoleId,
    team2_role: RoleId,
    nested_team_role: RoleId,

    // Actors
    user1: UserId,
    user2: UserId,
    machine_id: MachineId,
    ai_id: AiId,

    // Policies
    policies: TestPolicyIds,
}

impl TestPolicyEnvironment {
    fn assert_policies(
        &self,
        policies: impl IntoIterator<Item = PolicyId>,
        expected_policies: impl IntoIterator<Item = PolicyId>,
    ) {
        let all_policies: HashSet<_> = HashSet::from([
            self.policies.global,
            self.policies.user_type,
            self.policies.machine_type,
            self.policies.user1,
            self.policies.web1_role,
            self.policies.team1,
            self.policies.web2_role_user,
            self.policies.deny_user1,
        ]);

        let actual_policies = policies
            .into_iter()
            .collect::<HashSet<_>>()
            .intersection(&all_policies)
            .copied()
            .collect::<HashSet<_>>();

        let expected_policies: HashSet<_> = expected_policies.into_iter().collect();

        assert_eq!(
            actual_policies, expected_policies,
            "Expected policies do not match actual policies"
        );
    }
}

/// Struct to hold all policy IDs for easier reference.
struct TestPolicyIds {
    global: PolicyId,
    user_type: PolicyId,
    machine_type: PolicyId,
    user1: PolicyId,
    web1_role: PolicyId,
    team1: PolicyId,
    web2_role_user: PolicyId,
    deny_user1: PolicyId,
}

/// Sets up a complete test environment with various principals and relationships.
///
/// The test environment creates the following structure:
///
/// ```text
///           ┌─────────┐
///           │  web 1  │────────────┐
///           └────┬────┘            │
///                │                 │
///       ┌────────┴──────────┐      │
///       │                   │      │
///  ┌────┴───┐          ┌────┴───┐  │
///  │ team 1 │          │ team 2 │  │
///  └────┬───┘          └────────┘  │
///       │                          │
///       │                          │
/// ┌─────┴───────┐                  │
/// │ nested_team │                  │
/// └─────────────┘                  │
///                                  │
///           ┌─────────┐            │
///           │  web 2  │────────────┘
///           └─────────┘
///
/// ROLES:
/// - user1 → web1_role
/// - user2 → team1_role, web2_role
/// - machine → team2_role
/// - ai → nested_team_role
///
/// POLICIES:
/// - global (all)
/// - user_type → User
/// - machine_type → Machine
/// - user1 → specific to user1
/// - web1_role → role specific
/// - web2_role_user → role with actor type constraint
/// - team1 → team based
/// - deny_user1 → forbid policy
/// ```
#[expect(clippy::too_many_lines)]
async fn setup_policy_test_environment(
    client: &mut PostgresStore<impl AsClient>,
    actor_id: ActorId,
) -> Result<TestPolicyEnvironment, Box<dyn Error>> {
    // Create web teams (top level)
    let web1_id = client
        .create_web(
            actor_id,
            CreateWebParameter {
                id: None,
                administrator: Some(actor_id),
                shortname: None,
                is_actor_web: false,
            },
        )
        .await?
        .web_id;
    let web2_id = client
        .create_web(
            actor_id,
            CreateWebParameter {
                id: None,
                administrator: Some(actor_id),
                shortname: None,
                is_actor_web: false,
            },
        )
        .await?
        .web_id;

    // Create teams with different hierarchies
    let team_1_id = client
        .insert_team(None, ActorGroupId::Web(web1_id), "team-1")
        .await?;
    let team_2_id = client
        .insert_team(None, ActorGroupId::Web(web1_id), "team-2")
        .await?;
    let nested_team_id = client
        .insert_team(None, ActorGroupId::Team(team_1_id), "nested-team")
        .await?;

    // Create roles for each team
    let web_1_role_id = client
        .get_role(ActorGroupId::Web(web1_id), RoleName::Administrator)
        .await?
        .expect("role should exist")
        .id();
    let web_2_role_id = client
        .get_role(ActorGroupId::Web(web2_id), RoleName::Administrator)
        .await?
        .expect("role should exist")
        .id();
    let team1_role_id = client
        .create_role(None, ActorGroupId::Team(team_1_id), RoleName::Administrator)
        .await?;
    let team2_role_id = client
        .create_role(None, ActorGroupId::Team(team_2_id), RoleName::Administrator)
        .await?;
    let nested_team_role_id = client
        .create_role(
            None,
            ActorGroupId::Team(nested_team_id),
            RoleName::Administrator,
        )
        .await?;

    // Create actors of different types
    let user1_id = client.create_user(None).await?;
    let user2_id = client.create_user(None).await?;
    let machine_id = client.create_machine(None, "test-machine").await?;
    let ai_id = client.create_ai(None, "test-ai").await?;

    // Assign roles to actors in different combinations
    client
        .assign_role_by_id(ActorId::User(user1_id), web_1_role_id)
        .await?;
    client
        .assign_role_by_id(ActorId::User(user2_id), team1_role_id)
        .await?;
    client
        .assign_role_by_id(ActorId::User(user2_id), web_2_role_id)
        .await?;
    client
        .assign_role_by_id(ActorId::Machine(machine_id), team2_role_id)
        .await?;
    client
        .assign_role_by_id(ActorId::Ai(ai_id), nested_team_role_id)
        .await?;

    // Create policies of various types

    // 1. Global policies (no principal constraint)
    let global_policy_id = client
        .create_policy(
            actor_id.into(),
            PolicyCreationParams {
                name: None,
                effect: Effect::Permit,
                principal: None,
                actions: vec![ActionName::All],
                resource: None,
            },
        )
        .await?;

    // 2. Actor type specific policies
    let user_type_policy_id = client
        .create_policy(
            actor_id.into(),
            PolicyCreationParams {
                name: None,
                effect: Effect::Permit,
                principal: Some(PrincipalConstraint::ActorType {
                    actor_type: ActorType::User,
                }),
                actions: vec![ActionName::View],
                resource: None,
            },
        )
        .await?;

    let machine_type_policy_id = client
        .create_policy(
            actor_id.into(),
            PolicyCreationParams {
                name: None,
                effect: Effect::Permit,
                principal: Some(PrincipalConstraint::ActorType {
                    actor_type: ActorType::Machine,
                }),
                actions: vec![ActionName::Update],
                resource: None,
            },
        )
        .await?;

    // 3. Specific actor policies
    let user1_policy_id = client
        .create_policy(
            actor_id.into(),
            PolicyCreationParams {
                name: None,
                effect: Effect::Permit,
                principal: Some(PrincipalConstraint::Actor {
                    actor: ActorId::User(user1_id),
                }),
                actions: vec![ActionName::Create],
                resource: None,
            },
        )
        .await?;

    // 4. Role-based policies
    let web1_role_policy_id = client
        .create_policy(
            actor_id.into(),
            PolicyCreationParams {
                name: None,
                effect: Effect::Permit,
                principal: Some(PrincipalConstraint::Role {
                    role: web_1_role_id,
                    actor_type: None,
                }),
                actions: vec![ActionName::Instantiate],
                resource: None,
            },
        )
        .await?;

    // 5. Team-based policies
    let team1_policy_id = client
        .create_policy(
            actor_id.into(),
            PolicyCreationParams {
                name: None,
                effect: Effect::Permit,
                principal: Some(PrincipalConstraint::ActorGroup {
                    actor_group: ActorGroupId::Team(team_1_id),
                    actor_type: None,
                }),
                actions: vec![ActionName::ViewEntity],
                resource: None,
            },
        )
        .await?;

    // 6. Role with actor type constraint
    let web2_role_user_policy_id = client
        .create_policy(
            actor_id.into(),
            PolicyCreationParams {
                name: None,
                effect: Effect::Permit,
                principal: Some(PrincipalConstraint::Role {
                    role: web_2_role_id,
                    actor_type: Some(ActorType::User),
                }),
                actions: vec![ActionName::Create],
                resource: None,
            },
        )
        .await?;

    // 7. Deny policies for testing priority
    let deny_user1_policy_id = client
        .create_policy(
            actor_id.into(),
            PolicyCreationParams {
                name: None,
                effect: Effect::Forbid,
                principal: Some(PrincipalConstraint::Actor {
                    actor: ActorId::User(user1_id),
                }),
                actions: vec![ActionName::Update, ActionName::ViewEntity],
                resource: None,
            },
        )
        .await?;

    Ok(TestPolicyEnvironment {
        // Teams
        web1: web1_id,
        web2: web2_id,
        team1: team_1_id,
        team2: team_2_id,
        nested_team: nested_team_id,

        // Roles
        web1_role: web_1_role_id,
        web2_role: web_2_role_id,
        team1_role: team1_role_id,
        team2_role: team2_role_id,
        nested_team_role: nested_team_role_id,

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
            team1: team1_policy_id,
            web2_role_user: web2_role_user_policy_id,
            deny_user1: deny_user1_policy_id,
        },
    })
}

#[tokio::test]
async fn global_policies() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    let env = setup_policy_test_environment(&mut client, actor_id).await?;

    // Every actor should get global policies
    let user1_policies = client
        .resolve_policies_for_actor(
            ActorId::User(env.user1).into(),
            ResolvePoliciesParams {
                actions: Cow::Borrowed(&[ActionName::All]),
            },
        )
        .await?
        .into_iter()
        .map(|policy| policy.original_policy_id)
        .collect::<HashSet<_>>();
    let user2_policies = client
        .resolve_policies_for_actor(
            ActorId::User(env.user2).into(),
            ResolvePoliciesParams {
                actions: Cow::Borrowed(&[ActionName::All]),
            },
        )
        .await?
        .into_iter()
        .map(|policy| policy.original_policy_id)
        .collect::<HashSet<_>>();
    let machine_policies = client
        .resolve_policies_for_actor(
            ActorId::Machine(env.machine_id).into(),
            ResolvePoliciesParams {
                actions: Cow::Borrowed(&[ActionName::All]),
            },
        )
        .await?
        .into_iter()
        .map(|policy| policy.original_policy_id)
        .collect::<HashSet<_>>();
    let ai_policies = client
        .resolve_policies_for_actor(
            ActorId::Ai(env.ai_id).into(),
            ResolvePoliciesParams {
                actions: Cow::Borrowed(&[ActionName::All]),
            },
        )
        .await?
        .into_iter()
        .map(|policy| policy.original_policy_id)
        .collect::<HashSet<_>>();
    let nonexisting_policies = client
        .resolve_policies_for_actor(
            ActorId::User(UserId::new(Uuid::new_v4())).into(),
            ResolvePoliciesParams {
                actions: Cow::Borrowed(&[ActionName::All]),
            },
        )
        .await?
        .into_iter()
        .map(|policy| policy.original_policy_id)
        .collect::<HashSet<_>>();

    // All actors should have the global policy
    assert!(
        user1_policies.contains(&env.policies.global),
        "User1 should have global policy"
    );
    assert!(
        user2_policies.contains(&env.policies.global),
        "User2 should have global policy"
    );
    assert!(
        machine_policies.contains(&env.policies.global),
        "Machine should have global policy"
    );
    assert!(
        ai_policies.contains(&env.policies.global),
        "AI should have global policy"
    );
    assert!(
        nonexisting_policies.contains(&env.policies.global),
        "Non-existent actor should have global policy"
    );

    Ok(())
}

#[tokio::test]
async fn actor_type_policies() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    let env = setup_policy_test_environment(&mut client, actor_id).await?;

    // Test user type policies
    let user1_policies = client
        .resolve_policies_for_actor(
            ActorId::User(env.user1).into(),
            ResolvePoliciesParams {
                actions: Cow::Owned(ActionName::all().collect()),
            },
        )
        .await?
        .into_iter()
        .map(|policy| policy.original_policy_id)
        .collect::<HashSet<_>>();
    let user2_policies = client
        .resolve_policies_for_actor(
            ActorId::User(env.user2).into(),
            ResolvePoliciesParams {
                actions: Cow::Owned(ActionName::all().collect()),
            },
        )
        .await?
        .into_iter()
        .map(|policy| policy.original_policy_id)
        .collect::<HashSet<_>>();
    let machine_policies = client
        .resolve_policies_for_actor(
            ActorId::Machine(env.machine_id).into(),
            ResolvePoliciesParams {
                actions: Cow::Owned(ActionName::all().collect()),
            },
        )
        .await?
        .into_iter()
        .map(|policy| policy.original_policy_id)
        .collect::<HashSet<_>>();
    let nonexisting_machine_policies = client
        .resolve_policies_for_actor(
            ActorId::Machine(MachineId::new(Uuid::new_v4())).into(),
            ResolvePoliciesParams {
                actions: Cow::Owned(ActionName::all().collect()),
            },
        )
        .await?
        .into_iter()
        .map(|policy| policy.original_policy_id)
        .collect::<HashSet<_>>();

    // Users should have user type policies, machines should not
    assert!(
        user1_policies.contains(&env.policies.user_type),
        "User1 should have user type policy"
    );
    assert!(
        user2_policies.contains(&env.policies.user_type),
        "User2 should have user type policy"
    );
    assert!(
        !machine_policies.contains(&env.policies.user_type),
        "Machine should not have user type policy"
    );
    assert!(
        !nonexisting_machine_policies.contains(&env.policies.user_type),
        "Non-existent machine should not have access"
    );

    // Machines should have machine type policies, users should not
    assert!(
        !user1_policies.contains(&env.policies.machine_type),
        "User1 should not have machine type policy"
    );
    assert!(
        !user2_policies.contains(&env.policies.machine_type),
        "User2 should not have machine type policy"
    );
    assert!(
        machine_policies.contains(&env.policies.machine_type),
        "Machine should have machine type policy"
    );
    assert!(
        nonexisting_machine_policies.contains(&env.policies.machine_type),
        "Non-existent machine should have machine type policy"
    );

    Ok(())
}

#[tokio::test]
async fn specific_actor_policies() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    let env = setup_policy_test_environment(&mut client, actor_id).await?;

    // user1 has a specific policy assigned
    let user1_policies = client
        .resolve_policies_for_actor(
            ActorId::User(env.user1).into(),
            ResolvePoliciesParams {
                actions: Cow::Owned(ActionName::all().collect()),
            },
        )
        .await?
        .into_iter()
        .map(|policy| policy.original_policy_id)
        .collect::<HashSet<_>>();
    let user2_policies = client
        .resolve_policies_for_actor(
            ActorId::User(env.user2).into(),
            ResolvePoliciesParams {
                actions: Cow::Owned(ActionName::all().collect()),
            },
        )
        .await?
        .into_iter()
        .map(|policy| policy.original_policy_id)
        .collect::<HashSet<_>>();
    let nonexisting_user_policies = client
        .resolve_policies_for_actor(
            ActorId::User(UserId::new(Uuid::new_v4())).into(),
            ResolvePoliciesParams {
                actions: Cow::Owned(ActionName::all().collect()),
            },
        )
        .await?
        .into_iter()
        .map(|policy| policy.original_policy_id)
        .collect::<HashSet<_>>();

    // User1 should have its specific policy, user2 should not
    assert!(
        user1_policies.contains(&env.policies.user1),
        "User1 should have its specific policy"
    );
    assert!(
        !user2_policies.contains(&env.policies.user1),
        "User2 should not have User1's policy"
    );
    assert!(
        !nonexisting_user_policies.contains(&env.policies.user1),
        "Non-existent user should not have User1's policy"
    );

    Ok(())
}

#[tokio::test]
async fn role_based_policies() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    let env = setup_policy_test_environment(&mut client, actor_id).await?;

    // Test role-based policies
    let user1_policies = client
        .resolve_policies_for_actor(
            ActorId::User(env.user1).into(),
            ResolvePoliciesParams {
                actions: Cow::Owned(ActionName::all().collect()),
            },
        )
        .await?
        .into_iter()
        .map(|policy| policy.original_policy_id)
        .collect::<HashSet<_>>();
    let user2_policies = client
        .resolve_policies_for_actor(
            ActorId::User(env.user2).into(),
            ResolvePoliciesParams {
                actions: Cow::Owned(ActionName::all().collect()),
            },
        )
        .await?
        .into_iter()
        .map(|policy| policy.original_policy_id)
        .collect::<HashSet<_>>();

    // User1 has web1_role, should have its policies
    assert!(
        user1_policies.contains(&env.policies.web1_role),
        "User1 should have web1_role policy"
    );

    // User2 has web2_role and should have type-constrained policy for that role
    assert!(
        user2_policies.contains(&env.policies.web2_role_user),
        "User2 should have web2_role_user policy"
    );

    // Create a machine with web1_role to test actor type constraints
    let special_machine_id = client.create_machine(None, "special-machine").await?;
    client
        .assign_role_by_id(ActorId::Machine(special_machine_id), env.web1_role)
        .await?;
    client
        .assign_role_by_id(ActorId::Machine(special_machine_id), env.web2_role)
        .await?;

    let machine_policies = client
        .resolve_policies_for_actor(
            ActorId::Machine(special_machine_id).into(),
            ResolvePoliciesParams {
                actions: Cow::Owned(ActionName::all().collect()),
            },
        )
        .await?
        .into_iter()
        .map(|policy| policy.original_policy_id)
        .collect::<HashSet<_>>();

    // Machine has web1_role but should still get role-based policies without actor type constraints
    assert!(
        machine_policies.contains(&env.policies.web1_role),
        "Machine with web1_role should get its policies"
    );
    // Machine has web2_role but should not get role-based policies with actor type constraints
    assert!(
        !machine_policies.contains(&env.policies.web2_role_user),
        "Machine with web2_role should not get its policies"
    );

    Ok(())
}

#[tokio::test]
async fn team_hierarchy_policies() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    let env = setup_policy_test_environment(&mut client, actor_id).await?;

    // Test team hierarchies
    // User2 has team1_role, AI has nested_team_role which is under team1
    let user2_policies = client
        .resolve_policies_for_actor(
            ActorId::User(env.user2).into(),
            ResolvePoliciesParams {
                actions: Cow::Owned(ActionName::all().collect()),
            },
        )
        .await?
        .into_iter()
        .map(|policy| policy.original_policy_id)
        .collect::<HashSet<_>>();
    let ai_policies = client
        .resolve_policies_for_actor(
            ActorId::Ai(env.ai_id).into(),
            ResolvePoliciesParams {
                actions: Cow::Owned(ActionName::all().collect()),
            },
        )
        .await?
        .into_iter()
        .map(|policy| policy.original_policy_id)
        .collect::<HashSet<_>>();

    // User2 should have team1's policies
    assert!(
        user2_policies.contains(&env.policies.team1),
        "User2 should have team1 policy"
    );

    // AI with nested_team_role should inherit policies from parent team1
    assert!(
        ai_policies.contains(&env.policies.team1),
        "AI should inherit team1 policy through team hierarchy"
    );

    Ok(())
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn policy_count_and_content() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    let env = setup_policy_test_environment(&mut client, actor_id).await?;

    let nonexistent_id = UserId::new(Uuid::new_v4());

    let user1_policies = client
        .resolve_policies_for_actor(
            ActorId::User(env.user1).into(),
            ResolvePoliciesParams {
                // We don't list `ViewEntity` here to test that it is still included in the
                // resulting policy
                actions: Cow::Borrowed(&[
                    ActionName::All,
                    ActionName::View,
                    ActionName::Update,
                    ActionName::Instantiate,
                    ActionName::Create,
                ]),
            },
        )
        .await?
        .into_iter()
        .map(|policy| (policy.original_policy_id, policy))
        .collect::<HashMap<_, _>>();
    let user2_policies = client
        .resolve_policies_for_actor(
            ActorId::User(env.user2).into(),
            ResolvePoliciesParams {
                actions: Cow::Owned(ActionName::all().collect()),
            },
        )
        .await?
        .into_iter()
        .map(|policy| (policy.original_policy_id, policy))
        .collect::<HashMap<_, _>>();
    let machine_policies = client
        .resolve_policies_for_actor(
            ActorId::Machine(env.machine_id).into(),
            ResolvePoliciesParams {
                actions: Cow::Owned(ActionName::all().collect()),
            },
        )
        .await?
        .into_iter()
        .map(|policy| (policy.original_policy_id, policy))
        .collect::<HashMap<_, _>>();
    let ai_policies = client
        .resolve_policies_for_actor(
            ActorId::Ai(env.ai_id).into(),
            ResolvePoliciesParams {
                actions: Cow::Owned(ActionName::all().collect()),
            },
        )
        .await?
        .into_iter()
        .map(|policy| (policy.original_policy_id, policy))
        .collect::<HashMap<_, _>>();
    let nonexistent_policies = client
        .resolve_policies_for_actor(
            ActorId::User(nonexistent_id).into(),
            ResolvePoliciesParams {
                actions: Cow::Owned(ActionName::all().collect()),
            },
        )
        .await?
        .into_iter()
        .map(|policy| (policy.original_policy_id, policy))
        .collect::<HashMap<_, _>>();

    // Verify that we have at least one policy for each actor
    env.assert_policies(
        user1_policies.keys().copied(),
        [
            env.policies.global,
            env.policies.user_type,
            env.policies.user1,
            env.policies.deny_user1,
            env.policies.web1_role,
        ],
    );
    env.assert_policies(
        user2_policies.keys().copied(),
        [
            env.policies.global,
            env.policies.user_type,
            env.policies.team1,
            env.policies.web2_role_user,
        ],
    );
    env.assert_policies(
        machine_policies.keys().copied(),
        [env.policies.global, env.policies.machine_type],
    );
    env.assert_policies(
        ai_policies.keys().copied(),
        [env.policies.global, env.policies.team1],
    );
    env.assert_policies(
        nonexistent_policies.keys().copied(),
        [env.policies.global, env.policies.user_type],
    );

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
        deny_policy.actions.iter().copied().collect::<HashSet<_>>(),
        HashSet::from([ActionName::Update]),
        "Deny policy should have no `ViewEntity` action"
    );

    Ok(())
}

#[tokio::test]
async fn role_assignment_changes() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    let env = setup_policy_test_environment(&mut client, actor_id).await?;

    // Initial policy count
    let user2_policies = client
        .resolve_policies_for_actor(
            ActorId::User(env.user2).into(),
            ResolvePoliciesParams {
                actions: Cow::Owned(ActionName::all().collect()),
            },
        )
        .await?
        .into_iter()
        .map(|policy| policy.original_policy_id)
        .collect::<HashSet<_>>();
    let initial_count = user2_policies.len();
    let has_web2_policy = user2_policies.contains(&env.policies.web2_role_user);
    assert!(
        has_web2_policy,
        "User2 should initially have web2_role_user policy"
    );

    // Remove web2_role from user2
    client
        .unassign_role_by_id(ActorId::User(env.user2), env.web2_role)
        .await?;

    // Should have fewer policies now
    let updated_policies = client
        .resolve_policies_for_actor(
            ActorId::User(env.user2).into(),
            ResolvePoliciesParams {
                actions: Cow::Owned(ActionName::all().collect()),
            },
        )
        .await?
        .into_iter()
        .map(|policy| policy.original_policy_id)
        .collect::<HashSet<_>>();
    assert!(
        !updated_policies.contains(&env.policies.web2_role_user),
        "User2 should no longer have web2_role_user policy after role removal"
    );
    assert!(
        updated_policies.len() < initial_count,
        "User2 should have fewer policies after role removal"
    );

    // Add a different role (web1_role)
    client
        .assign_role_by_id(ActorId::User(env.user2), env.web1_role)
        .await?;

    // Should have different policies now after adding a new role
    let final_policies = client
        .resolve_policies_for_actor(
            ActorId::User(env.user2).into(),
            ResolvePoliciesParams {
                actions: Cow::Owned(ActionName::all().collect()),
            },
        )
        .await?
        .into_iter()
        .map(|policy| policy.original_policy_id)
        .collect::<HashSet<_>>();

    // We should have more policies after adding a role
    assert!(
        final_policies.len() > updated_policies.len(),
        "Adding a role should increase the number of policies"
    );

    Ok(())
}

#[tokio::test]
async fn resource_constraints_are_preserved() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    let user_id = client.create_user(None).await?;

    // Create a policy with resource constraints
    let resource_policy_id = client
        .create_policy(
            actor_id.into(),
            PolicyCreationParams {
                name: None,
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
            },
        )
        .await?;

    let policies = client
        .resolve_policies_for_actor(
            ActorId::User(user_id).into(),
            ResolvePoliciesParams {
                actions: Cow::Borrowed(&[ActionName::All]),
            },
        )
        .await?
        .into_iter()
        .map(|policy| (policy.original_policy_id, policy))
        .collect::<HashMap<_, _>>();

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
#[expect(clippy::too_many_lines)]
async fn deep_team_hierarchy() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    // Create a deep team hierarchy
    let web_id = client
        .create_web(
            actor_id,
            CreateWebParameter {
                id: None,
                administrator: Some(actor_id),
                shortname: Some("test-web".to_owned()),
                is_actor_web: false,
            },
        )
        .await?
        .web_id;

    let team1_id = client
        .insert_team(None, ActorGroupId::Web(web_id), "team-1")
        .await?;
    let team2_id = client
        .insert_team(None, ActorGroupId::Team(team1_id), "team-2")
        .await?;
    let team3_id = client
        .insert_team(None, ActorGroupId::Team(team2_id), "team-3")
        .await?;
    let team4_id = client
        .insert_team(None, ActorGroupId::Team(team3_id), "team-4")
        .await?;
    let team5_id = client
        .insert_team(None, ActorGroupId::Team(team4_id), "team-5")
        .await?;

    // Create roles
    let team5_role_id = client
        .create_role(None, ActorGroupId::Team(team5_id), RoleName::Administrator)
        .await?;

    // Create user assigned to the deepest role
    let user_id = client.create_user(None).await?;
    client
        .assign_role_by_id(ActorId::User(user_id), team5_role_id)
        .await?;

    // Create policies
    let web_policy_id = client
        .create_policy(
            actor_id.into(),
            PolicyCreationParams {
                name: None,
                effect: Effect::Permit,
                principal: Some(PrincipalConstraint::ActorGroup {
                    actor_group: ActorGroupId::Web(web_id),
                    actor_type: None,
                }),
                actions: vec![ActionName::All],
                resource: None,
            },
        )
        .await?;

    let team1_policy_id = client
        .create_policy(
            actor_id.into(),
            PolicyCreationParams {
                name: None,
                effect: Effect::Permit,
                principal: Some(PrincipalConstraint::ActorGroup {
                    actor_group: ActorGroupId::Team(team1_id),
                    actor_type: None,
                }),
                actions: vec![ActionName::All],
                resource: None,
            },
        )
        .await?;

    let team5_policy_id = client
        .create_policy(
            actor_id.into(),
            PolicyCreationParams {
                name: None,
                effect: Effect::Permit,
                principal: Some(PrincipalConstraint::ActorGroup {
                    actor_group: ActorGroupId::Team(team5_id),
                    actor_type: None,
                }),
                actions: vec![ActionName::All],
                resource: None,
            },
        )
        .await?;

    // User should get all policies through the hierarchy
    let policies = client
        .resolve_policies_for_actor(
            ActorId::User(user_id).into(),
            ResolvePoliciesParams {
                actions: Cow::Borrowed(&[ActionName::All]),
            },
        )
        .await?
        .into_iter()
        .map(|policy| policy.original_policy_id)
        .collect::<HashSet<_>>();

    assert!(
        policies.contains(&web_policy_id),
        "User should inherit web team policy"
    );
    assert!(
        policies.contains(&team1_policy_id),
        "User should inherit team1 policy"
    );
    assert!(
        policies.contains(&team5_policy_id),
        "User should have direct team5 policy"
    );

    Ok(())
}

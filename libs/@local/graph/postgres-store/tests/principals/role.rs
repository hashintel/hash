use core::{assert_matches, error::Error};

use hash_graph_authorization::policies::{
    principal::PrincipalConstraint,
    store::{
        CreateWebParameter, PolicyFilter, PolicyStore as _, PrincipalFilter, PrincipalStore as _,
        RoleAssignmentStatus, RoleUnassignmentStatus,
    },
};
use hash_graph_postgres_store::permissions::PrincipalError;
use pretty_assertions::assert_eq;
use type_system::principal::{
    PrincipalId,
    actor::{ActorId, UserId},
    actor_group::{ActorGroupId, WebId},
    role::{Role, RoleId, RoleName, TeamRoleId, WebRoleId},
};
use uuid::Uuid;

use crate::DatabaseTestWrapper;

#[tokio::test]
async fn create_role() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    // First create a web to associate the role with
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

    let team_id = client.insert_team(None, web_id.into(), "team").await?;

    // Then create a role associated with the team
    let role_id = client
        .create_role(None, ActorGroupId::Team(team_id), RoleName::Administrator)
        .await?;
    assert!(client.is_role(role_id).await?);

    let Some(Role::Team(role)) = client
        .get_role(ActorGroupId::Team(team_id), RoleName::Administrator)
        .await?
    else {
        panic!("Role should exist");
    };
    assert_eq!(RoleId::Team(role.id), role_id);

    Ok(())
}

#[tokio::test]
async fn create_role_with_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    // First create a web to associate the role with
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

    let team_id = client.insert_team(None, web_id.into(), "team").await?;

    // Then create a role with a specific ID
    let id = Uuid::new_v4();
    let role_id = client
        .create_role(Some(id), ActorGroupId::Team(team_id), RoleName::Member)
        .await?;

    // Then create a role with a specific ID
    assert_eq!(role_id, RoleId::Team(TeamRoleId::new(id)));
    assert!(client.is_role(role_id).await?);

    let Some(Role::Team(role)) = client
        .get_role(ActorGroupId::Team(team_id), RoleName::Member)
        .await?
    else {
        panic!("Role should exist");
    };
    assert_eq!(RoleId::Team(role.id), role_id);

    Ok(())
}

#[tokio::test]
async fn create_role_with_nonexistent_team() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.seed().await?;

    // Try to create a role with a non-existent team
    let non_existent_team_id = ActorGroupId::Web(WebId::new(Uuid::new_v4()));
    let result = client
        .create_role(None, non_existent_team_id, RoleName::Member)
        .await;

    assert_matches!(
        result.expect_err("Creating a role with a non-existent team should fail").current_context(),
        PrincipalError::PrincipalNotFound { id } if *id == PrincipalId::ActorGroup(non_existent_team_id)
    );

    Ok(())
}

#[tokio::test]
async fn get_role() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    // First create a web to associate the role with
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

    // Get the role and verify its details
    let role = client
        .get_role(ActorGroupId::Web(web_id), RoleName::Administrator)
        .await?
        .expect("Role should exist");
    match role {
        Role::Web(role) => {
            assert_eq!(ActorGroupId::Web(role.web_id), ActorGroupId::Web(web_id));
            assert_eq!(role.name, RoleName::Administrator);
        }
        Role::Team(_) => panic!("Role should be a web role"),
    }

    Ok(())
}

#[tokio::test]
async fn delete_role() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    // First create a web to associate the role with
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

    let role_id = client
        .get_role(web_id.into(), RoleName::Administrator)
        .await?
        .expect("admin role should exist")
        .id();

    let role_policies = client
        .query_policies(
            actor_id.into(),
            &PolicyFilter {
                name: None,
                principal: Some(PrincipalFilter::Constrained(PrincipalConstraint::Role {
                    role: role_id,
                    actor_type: None,
                })),
            },
        )
        .await?;
    for policy in role_policies {
        client
            .delete_policy_by_id(actor_id.into(), policy.id)
            .await?;
    }

    // Delete the role
    client.delete_role(role_id).await?;
    assert!(!client.is_role(role_id).await?);

    Ok(())
}

#[tokio::test]
async fn delete_nonexistent_role() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.seed().await?;

    // Try to delete a non-existent role
    let non_existent_id = RoleId::Web(WebRoleId::new(Uuid::new_v4()));
    let result = client.delete_role(non_existent_id).await;

    assert_matches!(
        result.expect_err("Deleting a non-existent role should fail").current_context(),
        PrincipalError::PrincipalNotFound { id } if *id == PrincipalId::Role(non_existent_id)
    );

    Ok(())
}

#[tokio::test]
async fn assign_role_to_actor() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    // Create a team, role, and user
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

    let role_id = client
        .get_role(web_id.into(), RoleName::Administrator)
        .await?
        .expect("admin role should exist")
        .id();
    let user_id = client.create_user(None).await?;

    // Assign the role to the user
    assert_matches!(
        client
            .assign_role_by_id(ActorId::User(user_id), role_id)
            .await?,
        RoleAssignmentStatus::NewlyAssigned
    );

    // Get the user's roles
    let roles = client.get_actor_roles(ActorId::User(user_id)).await?;
    assert!(roles.contains_key(&role_id));

    // Get the role's actors
    let actors = client.get_role_actors(role_id).await?;
    assert!(actors.contains(&ActorId::User(user_id)));

    // Try to assign the same role again
    assert_matches!(
        client
            .assign_role_by_id(ActorId::User(user_id), role_id)
            .await?,
        RoleAssignmentStatus::AlreadyAssigned
    );

    Ok(())
}

#[tokio::test]
async fn assign_role_to_nonexistent_actor() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    // Create a team and role
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
    let role_id = client
        .get_role(web_id.into(), RoleName::Administrator)
        .await?
        .expect("admin role should exist")
        .id();

    // Try to assign the role to a non-existent user
    let non_existent_user_id = UserId::new(Uuid::new_v4());
    let result = client
        .assign_role_by_id(ActorId::User(non_existent_user_id), role_id)
        .await;

    assert_matches!(
        result.expect_err("Assigning a role to a non-existent actor should fail").current_context(),
        PrincipalError::PrincipalNotFound { id } if *id == PrincipalId::Actor(ActorId::User(non_existent_user_id))
    );

    Ok(())
}

#[tokio::test]
async fn assign_nonexistent_role_to_actor() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.seed().await?;

    // Create a user
    let user_id = client.create_user(None).await?;

    // Try to assign a non-existent role to the user
    let non_existent_role_id = RoleId::Web(WebRoleId::new(Uuid::new_v4()));
    let result = client
        .assign_role_by_id(ActorId::User(user_id), non_existent_role_id)
        .await;

    assert_matches!(
        result.expect_err("Assigning a non-existent role to an actor should fail").current_context(),
        PrincipalError::PrincipalNotFound { id } if *id == PrincipalId::Role(non_existent_role_id)
    );

    Ok(())
}

#[tokio::test]
async fn unassign_role_from_actor() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    // Create a team, role, and user
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
    let role_id = client
        .get_role(web_id.into(), RoleName::Administrator)
        .await?
        .expect("admin role should exist")
        .id();
    let user_id = client.create_user(None).await?;

    // Assign the role to the user
    client
        .assign_role_by_id(ActorId::User(user_id), role_id)
        .await?;

    // Verify the role was assigned
    let roles = client.get_actor_roles(ActorId::User(user_id)).await?;
    assert!(roles.contains_key(&role_id));

    // Unassign the role from the user
    assert_matches!(
        client
            .unassign_role_by_id(ActorId::User(user_id), role_id)
            .await?,
        RoleUnassignmentStatus::Unassigned
    );

    // Verify the role was unassigned
    let roles = client.get_actor_roles(ActorId::User(user_id)).await?;
    assert!(!roles.contains_key(&role_id));

    // Verify the actor was removed from the role
    let actors = client.get_role_actors(role_id).await?;
    assert!(!actors.contains(&ActorId::User(user_id)));

    // Try to unassign the role again
    assert_matches!(
        client
            .unassign_role_by_id(ActorId::User(user_id), role_id)
            .await?,
        RoleUnassignmentStatus::NotAssigned
    );

    Ok(())
}

#[tokio::test]
async fn get_actor_roles_empty() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.seed().await?;

    // Create a user
    let user_id = client.create_user(None).await?;

    // Get the user's roles (should be empty)
    let roles = client.get_actor_roles(ActorId::User(user_id)).await?;
    assert!(roles.is_empty());

    Ok(())
}

#[tokio::test]
async fn get_role_actors_empty() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    // First create a web to associate the role with
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

    let team_id = client.insert_team(None, web_id.into(), "team").await?;
    let role_id = client
        .create_role(None, ActorGroupId::Team(team_id), RoleName::Administrator)
        .await?;

    // Get the role's actors (should be empty)
    let actors = client.get_role_actors(role_id).await?;
    assert!(actors.is_empty());

    Ok(())
}

#[tokio::test]
async fn create_web_team_role() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    // Create a web team
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

    let role_id = client
        .get_role(web_id.into(), RoleName::Administrator)
        .await?
        .expect("admin role should exist")
        .id();

    // Verify the role was created properly
    let Some(Role::Web(role)) = client
        .get_role(ActorGroupId::Web(web_id), RoleName::Administrator)
        .await?
    else {
        panic!("Role should exist");
    };
    assert_eq!(RoleId::Web(role.id), role_id);

    Ok(())
}

#[tokio::test]
async fn assign_role_to_machine() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    // Create a web team, role, and machine
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
    let role_id = client
        .get_role(web_id.into(), RoleName::Administrator)
        .await?
        .expect("admin role should exist")
        .id();
    let machine_id = client.create_machine(None, "test-machine").await?;

    // Assign the role to the machine
    client
        .assign_role_by_id(ActorId::Machine(machine_id), role_id)
        .await?;

    // Get the machine's roles
    let roles = client.get_actor_roles(ActorId::Machine(machine_id)).await?;
    assert!(roles.contains_key(&role_id));

    // Get the role's actors
    let actors = client.get_role_actors(role_id).await?;
    assert!(actors.contains(&ActorId::Machine(machine_id)));

    // Unassign the role from the machine
    client
        .unassign_role_by_id(ActorId::Machine(machine_id), role_id)
        .await?;

    // Verify the role was unassigned
    let roles = client.get_actor_roles(ActorId::Machine(machine_id)).await?;
    assert!(!roles.contains_key(&role_id));

    Ok(())
}

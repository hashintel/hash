use core::{assert_matches::assert_matches, error::Error};

use hash_graph_authorization::policies::action::ActionName;
use hash_graph_postgres_store::permissions::ActionError;

use crate::DatabaseTestWrapper;

#[tokio::test]
async fn register_actions() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.client().await?;

    assert!(!client.has_action(ActionName::All).await?);
    client.register_action(ActionName::All, None).await?;
    assert!(client.has_action(ActionName::All).await?);
    client.unregister_action(ActionName::All).await?;
    assert!(!client.has_action(ActionName::All).await?);

    Ok(())
}

#[tokio::test]
async fn register_with_parent() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.client().await?;

    assert!(!client.has_action(ActionName::All).await?);
    client.register_action(ActionName::All, None).await?;
    assert!(client.has_action(ActionName::All).await?);

    assert!(!client.has_action(ActionName::Create).await?);
    client
        .register_action(ActionName::Create, Some(ActionName::All))
        .await?;
    assert!(client.has_action(ActionName::Create).await?);

    client.unregister_action(ActionName::Create).await?;
    assert!(!client.has_action(ActionName::Create).await?);

    client.unregister_action(ActionName::All).await?;
    assert!(!client.has_action(ActionName::All).await?);

    Ok(())
}

#[tokio::test]
async fn register_action_twice() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.client().await?;

    client.register_action(ActionName::All, None).await?;
    let result = client.register_action(ActionName::All, None).await;

    assert_matches!(
        result
            .expect_err("Registering an action twice should fail")
            .current_context(),
        ActionError::AlreadyExists {
            id: ActionName::All
        },
        "Error should indicate that action already exists"
    );

    Ok(())
}

#[tokio::test]
async fn register_with_non_existent_parent() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.client().await?;

    assert!(!client.has_action(ActionName::View).await?);
    let result = client
        .register_action(ActionName::View, Some(ActionName::All))
        .await;

    assert_matches!(
        result
            .expect_err("Unregistering a non-existent action should fail")
            .current_context(),
        ActionError::NotFound {
            id: ActionName::All
        },
        "Error should indicate that parent action does not exist"
    );

    Ok(())
}

#[tokio::test]
async fn register_without_parent() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.client().await?;

    assert!(!client.has_action(ActionName::View).await?);
    let result = client.register_action(ActionName::View, None).await;

    assert_matches!(
        result
            .expect_err("Unregistering a non-existent action should fail")
            .current_context(),
        ActionError::HasNoParent {
            id: ActionName::View
        },
        "Error should indicate that action does not have a parent"
    );

    Ok(())
}

#[tokio::test]
async fn unregister_non_existent_action() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.client().await?;

    assert!(!client.has_action(ActionName::All).await?);
    let result = client.unregister_action(ActionName::All).await;

    assert_matches!(
        result
            .expect_err("Unregistering a non-existent action should fail")
            .current_context(),
        ActionError::NotFound {
            id: ActionName::All
        },
        "Error should indicate that action does not exist"
    );

    Ok(())
}

#[tokio::test]
async fn action_hierarchy() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.client().await?;

    // Create a hierarchy: all -> create -> instantiate
    client.register_action(ActionName::All, None).await?;
    client
        .register_action(ActionName::Create, Some(ActionName::All))
        .await?;
    client
        .register_action(ActionName::Instantiate, Some(ActionName::Create))
        .await?;

    // Verify hierarchy is correctly established
    let parent_actions = client.get_parent_actions(ActionName::Instantiate).await?;
    assert_eq!(
        parent_actions,
        [ActionName::Create, ActionName::All],
        "Parent actions should be in order of depth"
    );

    // Delete hierarchy in correct order - bottom-up
    // Delete instantiate action first
    client.unregister_action(ActionName::Instantiate).await?;

    // Verify instantiate action no longer exists
    assert!(
        !client.has_action(ActionName::Instantiate).await?,
        "Instantiate action should be deleted"
    );

    // Verify create action still exists
    assert!(
        client.has_action(ActionName::Create).await?,
        "Create action should still exist"
    );

    // Now we can delete create action since it no longer has children
    client.unregister_action(ActionName::Create).await?;

    // Verify create action no longer exists
    assert!(
        !client.has_action(ActionName::Create).await?,
        "Create action should be deleted"
    );

    // Finally delete the root action
    client.unregister_action(ActionName::All).await?;
    assert!(
        !client.has_action(ActionName::All).await?,
        "All action should be deleted"
    );

    Ok(())
}

#[tokio::test]
async fn cannot_delete_action_with_children() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.client().await?;

    // Create a simple parent-child hierarchy
    client.register_action(ActionName::All, None).await?;
    client
        .register_action(ActionName::Create, Some(ActionName::All))
        .await?;

    // Delete the parent action
    let result = client.unregister_action(ActionName::All).await;

    assert_matches!(
        result
            .expect_err("Unregistering a parent action should fail")
            .current_context(),
        ActionError::HasChildren {
            id: ActionName::All
        },
        "Error should indicate that action has children"
    );

    Ok(())
}

#[tokio::test]
async fn get_empty_parent_actions() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.client().await?;

    client.register_action(ActionName::All, None).await?;
    let parent_actions = client.get_parent_actions(ActionName::All).await?;

    // Should return an empty vector for non-existent actions
    assert!(
        parent_actions.is_empty(),
        "Parent actions for root action should be empty"
    );

    Ok(())
}

#[tokio::test]
async fn get_parent_actions_non_existent() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (client, _actor_id) = db.client().await?;

    // Try to get parent actions for an action that doesn't exist
    let result = client.get_parent_actions(ActionName::View).await;
    assert_matches!(
        result
            .expect_err("Unregistering a parent action should fail")
            .current_context(),
        ActionError::NotFound {
            id: ActionName::View
        },
        "Error should indicate that action does not exist"
    );

    Ok(())
}

#[tokio::test]
async fn complex_action_hierarchy() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.client().await?;

    // Create a more complex hierarchy:
    //                    All
    //                   /   \
    //               Create   View
    //              /      \
    //     Instantiate    Update

    client.register_action(ActionName::All, None).await?;

    // First branch
    client
        .register_action(ActionName::Create, Some(ActionName::All))
        .await?;
    client
        .register_action(ActionName::Instantiate, Some(ActionName::Create))
        .await?;
    client
        .register_action(ActionName::Update, Some(ActionName::Create))
        .await?;

    // Second branch
    client
        .register_action(ActionName::View, Some(ActionName::All))
        .await?;

    // Verify hierarchies
    let instantiate_parents = client.get_parent_actions(ActionName::Instantiate).await?;
    assert_eq!(
        instantiate_parents,
        [ActionName::Create, ActionName::All],
        "Instantiate should have Create and All as parents"
    );

    let update_parents = client.get_parent_actions(ActionName::Update).await?;
    assert_eq!(
        update_parents,
        [ActionName::Create, ActionName::All],
        "Update should have Create and All as parents"
    );

    let view_parents = client.get_parent_actions(ActionName::View).await?;
    assert_eq!(
        view_parents,
        [ActionName::All],
        "View should have All as parent"
    );

    // Verify proper deletion order works
    client.unregister_action(ActionName::Instantiate).await?;
    client.unregister_action(ActionName::Update).await?;

    // Now Create can be deleted
    client.unregister_action(ActionName::Create).await?;

    // Delete the other branch
    client.unregister_action(ActionName::View).await?;

    // Finally delete the root
    client.unregister_action(ActionName::All).await?;

    // Verify all actions are gone
    assert!(!client.has_action(ActionName::All).await?);
    assert!(!client.has_action(ActionName::Create).await?);
    assert!(!client.has_action(ActionName::Instantiate).await?);
    assert!(!client.has_action(ActionName::Update).await?);
    assert!(!client.has_action(ActionName::View).await?);

    Ok(())
}

#[tokio::test]
async fn prevent_action_cycles() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.client().await?;

    // Create a simple hierarchy
    client.register_action(ActionName::All, None).await?;
    client
        .register_action(ActionName::Create, Some(ActionName::All))
        .await?;

    // Try to create a cycle by making All a child of Create
    // This should fail because it would create a cycle
    let result = client
        .register_action(ActionName::All, Some(ActionName::Create))
        .await;

    // We expect an error because ActionId::All already exists
    assert_matches!(
        result
            .expect_err("Creating a cycle should fail")
            .current_context(),
        ActionError::AlreadyExists {
            id: ActionName::All
        },
        "Error should indicate that action already exists"
    );

    Ok(())
}

#[tokio::test]
async fn prevent_self_cycles() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.client().await?;

    let result = client
        .register_action(ActionName::All, Some(ActionName::All))
        .await;
    assert_matches!(
        result
            .expect_err("Creating a self-cycle should fail")
            .current_context(),
        ActionError::HasSelfCycle {
            id: ActionName::All
        },
        "Error should indicate that action has a self-cycle"
    );

    Ok(())
}

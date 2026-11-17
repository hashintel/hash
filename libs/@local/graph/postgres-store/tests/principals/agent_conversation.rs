//! An agent conversation in an organization web is private to the member who created it.
//!
//! The seeded web policies let a member view, update and archive an agent conversation only if
//! they created it, while an administrator of the web keeps the access the web grants them.

use core::{error::Error, str::FromStr as _};
use std::collections::{HashMap, HashSet};

use error_stack::Report;
use hash_graph_authorization::policies::store::{CreateWebParameter, PrincipalStore as _};
use hash_graph_postgres_store::store::{InTransaction, PostgresStore};
use hash_graph_store::{
    data_type::{CreateDataTypeParams, DataTypeStore as _},
    entity::{CreateEntityParams, EntityStore as _, PatchEntityParams},
    entity_type::{CreateEntityTypeParams, EntityTypeStore as _},
    error::UpdateError,
    property_type::{CreatePropertyTypeParams, PropertyTypeStore as _},
    query::ConflictBehavior,
};
use hash_graph_test_data::data_type;
use hash_status::StatusCode;
use pretty_assertions::assert_eq;
use serde_json::json;
use time::OffsetDateTime;
use tokio_postgres::Transaction;
use type_system::{
    knowledge::{
        Entity,
        entity::{EntityId, provenance::ProvidedEntityEditionProvenance},
        property::{PropertyObject, PropertyObjectWithMetadata},
    },
    ontology::{
        VersionedUrl,
        data_type::DataType,
        entity_type::EntityType,
        property_type::PropertyType,
        provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
    },
    principal::{
        actor::{ActorId, ActorType, UserId},
        actor_group::{ActorGroupId, WebId},
        role::RoleName,
    },
    provenance::{OriginProvenance, OriginType},
};

use crate::DatabaseTestWrapper;

const AGENT_CONVERSATION_TYPE: &str = "https://hash.ai/@h/types/entity-type/agent-conversation/v/1";
const CONVERSATION_ID_TYPE: &str = "https://hash.ai/@h/types/property-type/conversation-id/v/1";
const CONVERSATION_ID: &str = "https://hash.ai/@h/types/property-type/conversation-id/";

/// An organization web holding one agent conversation, and the users whose access to it differs.
struct Fixture<'pool> {
    store: PostgresStore<Transaction<'pool>, InTransaction>,
    /// Member of the web who created the conversation.
    creator: UserId,
    /// Member of the web who did not create the conversation.
    member: UserId,
    /// Administrator of the web.
    administrator: UserId,
    conversation: EntityId,
}

const fn ontology_provenance() -> ProvidedOntologyEditionProvenance {
    ProvidedOntologyEditionProvenance {
        actor_type: ActorType::User,
        origin: OriginProvenance::from_empty_type(OriginType::Api),
        sources: Vec::new(),
    }
}

const fn entity_provenance() -> ProvidedEntityEditionProvenance {
    ProvidedEntityEditionProvenance {
        actor_type: ActorType::User,
        origin: OriginProvenance::from_empty_type(OriginType::Api),
        sources: Vec::new(),
    }
}

/// Creates the types an agent conversation needs, with the system types owned by `web_id`.
///
/// The types match the system types in shape and location, and creation skips any that already
/// exist, so the fixture works on an empty database and on one that already holds the system
/// types.
async fn create_agent_conversation_types(
    store: &mut PostgresStore<Transaction<'_>, InTransaction>,
    actor_id: ActorId,
    web_id: WebId,
) -> Result<(), Box<dyn Error>> {
    store
        .create_data_types(
            actor_id,
            [data_type::VALUE_V1, data_type::TEXT_V1]
                .into_iter()
                .map(|schema| {
                    Ok::<_, serde_json::Error>(CreateDataTypeParams {
                        schema: serde_json::from_str::<DataType>(schema)?,
                        ownership: OntologyOwnership::Remote {
                            fetched_at: OffsetDateTime::now_utc(),
                        },
                        conflict_behavior: ConflictBehavior::Skip,
                        provenance: ontology_provenance(),
                        conversions: HashMap::new(),
                    })
                })
                .collect::<Result<Vec<_>, _>>()?,
        )
        .await?;

    store
        .create_property_types(
            actor_id,
            [CreatePropertyTypeParams {
                schema: serde_json::from_value::<PropertyType>(json!({
                    "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
                    "kind": "propertyType",
                    "$id": CONVERSATION_ID_TYPE,
                    "title": "Conversation ID",
                    "description": "An identifier for a conversation, in the system that stores its messages.",
                    "oneOf": [
                        { "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1" }
                    ]
                }))?,
                ownership: OntologyOwnership::Local { web_id },
                conflict_behavior: ConflictBehavior::Skip,
                provenance: ontology_provenance(),
            }],
        )
        .await?;

    store
        .create_entity_types(
            actor_id,
            [CreateEntityTypeParams {
                schema: serde_json::from_value::<EntityType>(json!({
                    "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
                    "kind": "entityType",
                    "$id": AGENT_CONVERSATION_TYPE,
                    "type": "object",
                    "title": "Agent Conversation",
                    "description": "A conversation between a user and an AI agent about something, such as a process.",
                    "properties": {
                        CONVERSATION_ID: { "$ref": CONVERSATION_ID_TYPE }
                    },
                    "required": [CONVERSATION_ID]
                }))?,
                ownership: OntologyOwnership::Local { web_id },
                conflict_behavior: ConflictBehavior::Skip,
                provenance: ontology_provenance(),
                fetched_from_origin: false,
            }],
        )
        .await?;

    Ok(())
}

async fn setup(database: &mut DatabaseTestWrapper) -> Result<Fixture<'_>, Box<dyn Error>> {
    let (mut store, system_machine) = database.seed().await?;

    let creator = store.create_user(None).await?;
    let member = store.create_user(None).await?;
    let administrator = store.create_user(None).await?;

    let web_id = store
        .create_web(
            system_machine,
            CreateWebParameter {
                id: None,
                administrator: Some(ActorId::User(administrator)),
                shortname: None,
                is_actor_web: false,
            },
        )
        .await?
        .web_id;
    let member_role = store
        .get_role(ActorGroupId::Web(web_id), RoleName::Member)
        .await?
        .expect("web should have a member role")
        .id();
    store
        .assign_role_by_id(ActorId::User(creator), member_role)
        .await?;
    store
        .assign_role_by_id(ActorId::User(member), member_role)
        .await?;

    create_agent_conversation_types(&mut store, ActorId::User(administrator), web_id).await?;

    let conversation = store
        .create_entity(
            ActorId::User(creator),
            CreateEntityParams {
                web_id,
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([VersionedUrl::from_str(AGENT_CONVERSATION_TYPE)?]),
                properties: PropertyObjectWithMetadata::from_parts(
                    serde_json::from_value::<PropertyObject>(json!({
                        CONVERSATION_ID: "conversation-1"
                    }))?,
                    None,
                )?,
                confidence: None,
                link_data: None,
                draft: false,
                policies: Vec::new(),
                provenance: entity_provenance(),
                read_only: false,
            },
        )
        .await?
        .metadata
        .record_id
        .entity_id;

    Ok(Fixture {
        store,
        creator,
        member,
        administrator,
        conversation,
    })
}

impl Fixture<'_> {
    async fn can_view(&mut self, user: UserId) -> Result<bool, Box<dyn Error>> {
        Ok(self
            .store
            .get_entity_by_id(Some(ActorId::User(user)), self.conversation, None, None)
            .await?
            .is_some())
    }

    /// Requests an edit to the conversation, opening a draft of it, as `user`.
    async fn update(&mut self, user: UserId) -> Result<Entity, Report<UpdateError>> {
        self.store
            .patch_entity(
                ActorId::User(user),
                PatchEntityParams {
                    entity_id: self.conversation,
                    decision_time: None,
                    entity_type_ids: HashSet::new(),
                    properties: Vec::new(),
                    draft: Some(true),
                    archived: None,
                    confidence: None,
                    provenance: entity_provenance(),
                },
            )
            .await
    }

    async fn archive(&mut self, user: UserId) -> Result<Entity, Report<UpdateError>> {
        self.store
            .patch_entity(
                ActorId::User(user),
                PatchEntityParams {
                    entity_id: self.conversation,
                    decision_time: None,
                    entity_type_ids: HashSet::new(),
                    properties: Vec::new(),
                    draft: None,
                    archived: Some(true),
                    confidence: None,
                    provenance: entity_provenance(),
                },
            )
            .await
    }
}

fn status(report: &Report<UpdateError>) -> Option<StatusCode> {
    report.downcast_ref::<StatusCode>().copied()
}

#[tokio::test]
async fn view_creator() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;

    assert!(
        fixture.can_view(fixture.creator).await?,
        "creator should view their own conversation"
    );

    Ok(())
}

#[tokio::test]
async fn view_other_member() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;

    assert!(
        !fixture.can_view(fixture.member).await?,
        "another member should not view the conversation"
    );

    Ok(())
}

#[tokio::test]
async fn view_administrator() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;

    assert!(
        fixture.can_view(fixture.administrator).await?,
        "web administrator should view the conversation"
    );

    Ok(())
}

#[tokio::test]
async fn update_creator() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;

    fixture.update(fixture.creator).await?;

    Ok(())
}

#[tokio::test]
async fn update_other_member() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;

    let report = fixture
        .update(fixture.member)
        .await
        .expect_err("another member should not update the conversation");
    assert_eq!(
        status(&report),
        Some(StatusCode::PermissionDenied),
        "update should be refused for lack of permission: {report:?}"
    );

    Ok(())
}

#[tokio::test]
async fn archive_creator() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;

    fixture.archive(fixture.creator).await?;

    Ok(())
}

#[tokio::test]
async fn archive_other_member() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;

    let report = fixture
        .archive(fixture.member)
        .await
        .expect_err("another member should not archive the conversation");
    assert_eq!(
        status(&report),
        Some(StatusCode::PermissionDenied),
        "archive should be refused for lack of permission: {report:?}"
    );

    Ok(())
}

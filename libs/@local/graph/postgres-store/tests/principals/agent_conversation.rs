//! The seeded web policies let members and web administrators view, update and archive only the
//! agent conversations, and the links to their focus, that they created.

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
use hash_graph_test_data::{data_type, entity_type};
use hash_status::StatusCode;
use pretty_assertions::assert_eq;
use serde_json::json;
use time::OffsetDateTime;
use tokio_postgres::Transaction;
use type_system::{
    knowledge::{
        Entity,
        entity::{EntityId, Link, LinkEndpoint, provenance::ProvidedEntityEditionProvenance},
        property::{PropertyObject, PropertyObjectWithMetadata, metadata::PropertyProvenance},
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
const AGENT_ID_TYPE: &str = "https://hash.ai/@h/types/property-type/agent-id/v/1";
const AGENT_ID: &str = "https://hash.ai/@h/types/property-type/agent-id/";
const HAS_AGENT_CONVERSATION_FOCUS_TYPE: &str =
    "https://hash.ai/@h/types/entity-type/has-agent-conversation-focus/v/1";
const LINK_TYPE: &str = "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1";
const NOTE_TYPE: &str = "https://hash.ai/@h/types/entity-type/conversation-test-note/v/1";

/// An organization web holding one agent conversation, and the users whose access to it differs.
struct Fixture<'pool> {
    store: PostgresStore<Transaction<'pool>, InTransaction>,
    web_id: WebId,
    /// User in the web who created the conversation.
    creator: UserId,
    /// Member of the web who did not create the conversation.
    member: UserId,
    /// Administrator of the web.
    administrator: UserId,
    conversation: EntityId,
    /// An entity in the web, created by the administrator, that the conversation focuses on.
    subject: EntityId,
    /// The creator's link from the conversation to its subject.
    focus: EntityId,
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

/// Creates the property types an agent conversation has, owned by `web_id`.
async fn create_property_types(
    store: &mut PostgresStore<Transaction<'_>, InTransaction>,
    actor_id: ActorId,
    web_id: WebId,
) -> Result<(), Box<dyn Error>> {
    store
        .create_property_types(
            actor_id,
            [
                (
                    CONVERSATION_ID_TYPE,
                    "Conversation ID",
                    "An identifier for a conversation, in the system that stores its messages.",
                ),
                (
                    AGENT_ID_TYPE,
                    "Agent ID",
                    "An identifier for an AI agent and the service that keeps its conversations, \
                     such as `brunch/hash`. It is not the name of a model.",
                ),
            ]
            .into_iter()
            .map(|(property_type_id, title, description)| {
                Ok::<_, serde_json::Error>(CreatePropertyTypeParams {
                    schema: serde_json::from_value::<PropertyType>(json!({
                        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
                        "kind": "propertyType",
                        "$id": property_type_id,
                        "title": title,
                        "description": description,
                        "oneOf": [
                            { "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1" }
                        ]
                    }))?,
                    ownership: OntologyOwnership::Local { web_id },
                    conflict_behavior: ConflictBehavior::Skip,
                    provenance: ontology_provenance(),
                })
            })
            .collect::<Result<Vec<_>, _>>()?,
        )
        .await?;

    Ok(())
}

/// Creates the types an agent conversation needs, with the system types owned by `web_id`.
///
/// Creation skips any that already exist, so the fixture works on an empty database and on one
/// that already holds the system types.
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

    create_property_types(store, actor_id, web_id).await?;

    store
        .create_entity_types(
            actor_id,
            [
                CreateEntityTypeParams {
                    schema: serde_json::from_str::<EntityType>(entity_type::LINK_V1)?,
                    ownership: OntologyOwnership::Remote {
                        fetched_at: OffsetDateTime::now_utc(),
                    },
                    conflict_behavior: ConflictBehavior::Skip,
                    provenance: ontology_provenance(),
                    fetched_from_origin: false,
                },
                CreateEntityTypeParams {
                    schema: serde_json::from_value::<EntityType>(json!({
                        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
                        "kind": "entityType",
                        "$id": HAS_AGENT_CONVERSATION_FOCUS_TYPE,
                        "type": "object",
                        "title": "Has Agent Conversation Focus",
                        "description": "A link for agent conversation tests.",
                        "allOf": [{ "$ref": LINK_TYPE }],
                        "properties": {}
                    }))?,
                    ownership: OntologyOwnership::Local { web_id },
                    conflict_behavior: ConflictBehavior::Skip,
                    provenance: ontology_provenance(),
                    fetched_from_origin: false,
                },
            ],
        )
        .await?;

    store
        .create_entity_types(
            actor_id,
            [
                CreateEntityTypeParams {
                    schema: serde_json::from_value::<EntityType>(json!({
                        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
                        "kind": "entityType",
                        "$id": AGENT_CONVERSATION_TYPE,
                        "type": "object",
                        "title": "Agent Conversation",
                        "description": "A conversation between a user and an AI agent, which may focus on entities, such as a process.",
                        "properties": {
                            CONVERSATION_ID: { "$ref": CONVERSATION_ID_TYPE },
                            AGENT_ID: { "$ref": AGENT_ID_TYPE }
                        },
                        "required": [CONVERSATION_ID, AGENT_ID],
                        "links": {
                            HAS_AGENT_CONVERSATION_FOCUS_TYPE: { "type": "array", "items": {} }
                        }
                    }))?,
                    ownership: OntologyOwnership::Local { web_id },
                    conflict_behavior: ConflictBehavior::Skip,
                    provenance: ontology_provenance(),
                    fetched_from_origin: false,
                },
                CreateEntityTypeParams {
                    schema: serde_json::from_value::<EntityType>(json!({
                        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
                        "kind": "entityType",
                        "$id": NOTE_TYPE,
                        "type": "object",
                        "title": "Conversation Test Note",
                        "description": "A shared entity in the web.",
                        "properties": {}
                    }))?,
                    ownership: OntologyOwnership::Local { web_id },
                    conflict_behavior: ConflictBehavior::Skip,
                    provenance: ontology_provenance(),
                    fetched_from_origin: false,
                },
            ],
        )
        .await?;

    Ok(())
}

/// Creates the conversation, its shared subject, and the creator's focus link between them.
async fn create_conversation_fixture_entities(
    store: &mut PostgresStore<Transaction<'_>, InTransaction>,
    web_id: WebId,
    creator: UserId,
    administrator: UserId,
) -> Result<(EntityId, EntityId, EntityId), Box<dyn Error>> {
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
                        CONVERSATION_ID: "conversation-1",
                        AGENT_ID: "brunch/hash"
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

    let subject = store
        .create_entity(
            ActorId::User(administrator),
            CreateEntityParams {
                web_id,
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([VersionedUrl::from_str(NOTE_TYPE)?]),
                properties: PropertyObjectWithMetadata::from_parts(PropertyObject::empty(), None)?,
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

    let focus = store
        .create_entity(
            ActorId::User(creator),
            CreateEntityParams {
                web_id,
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([VersionedUrl::from_str(
                    HAS_AGENT_CONVERSATION_FOCUS_TYPE,
                )?]),
                properties: PropertyObjectWithMetadata::from_parts(PropertyObject::empty(), None)?,
                confidence: None,
                link_data: Some(Link::Directed {
                    source: LinkEndpoint {
                        entity_id: conversation,
                        confidence: None,
                        provenance: PropertyProvenance::default(),
                    },
                    target: LinkEndpoint {
                        entity_id: subject,
                        confidence: None,
                        provenance: PropertyProvenance::default(),
                    },
                }),
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

    Ok((conversation, subject, focus))
}

/// Sets up the [`Fixture`], with the conversation's creator a member of the web.
async fn setup(database: &mut DatabaseTestWrapper) -> Result<Fixture<'_>, Box<dyn Error>> {
    setup_with_creator_role(database, RoleName::Member).await
}

/// Sets up the [`Fixture`], with the conversation's creator holding `creator_role` in the web.
async fn setup_with_creator_role(
    database: &mut DatabaseTestWrapper,
    creator_role: RoleName,
) -> Result<Fixture<'_>, Box<dyn Error>> {
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
    let creator_role = store
        .get_role(ActorGroupId::Web(web_id), creator_role)
        .await?
        .expect("web should have the creator's role")
        .id();
    store
        .assign_role_by_id(ActorId::User(creator), creator_role)
        .await?;
    store
        .assign_role_by_id(ActorId::User(member), member_role)
        .await?;

    create_agent_conversation_types(&mut store, ActorId::User(administrator), web_id).await?;
    let (conversation, subject, focus) =
        create_conversation_fixture_entities(&mut store, web_id, creator, administrator).await?;

    Ok(Fixture {
        store,
        web_id,
        creator,
        member,
        administrator,
        conversation,
        subject,
        focus,
    })
}

impl Fixture<'_> {
    /// Whether `user` can view `entity`.
    async fn can_view_entity(
        &mut self,
        user: UserId,
        entity: EntityId,
    ) -> Result<bool, Box<dyn Error>> {
        Ok(self
            .store
            .get_entity_by_id(Some(ActorId::User(user)), entity, None, None)
            .await?
            .is_some())
    }

    /// Requests an edit to `entity`, opening a draft of it, as `user`.
    async fn update_entity(
        &mut self,
        user: UserId,
        entity: EntityId,
    ) -> Result<Entity, Report<UpdateError>> {
        self.store
            .patch_entity(
                ActorId::User(user),
                PatchEntityParams {
                    entity_id: entity,
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

    /// Requests archival of `entity`, as `user`.
    async fn archive_entity(
        &mut self,
        user: UserId,
        entity: EntityId,
    ) -> Result<Entity, Report<UpdateError>> {
        self.store
            .patch_entity(
                ActorId::User(user),
                PatchEntityParams {
                    entity_id: entity,
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

/// The status code `report` carries, if any.
fn status(report: &Report<UpdateError>) -> Option<StatusCode> {
    report.downcast_ref::<StatusCode>().copied()
}

/// Asserts that `user` can't view, update or archive `entity`.
async fn assert_private(
    fixture: &mut Fixture<'_>,
    user: UserId,
    entity: EntityId,
) -> Result<(), Box<dyn Error>> {
    assert!(
        !fixture.can_view_entity(user, entity).await?,
        "entity should be hidden from users other than its creator"
    );
    let report = fixture
        .update_entity(user, entity)
        .await
        .expect_err("users other than the creator should not update the entity");
    assert_eq!(
        status(&report),
        Some(StatusCode::PermissionDenied),
        "update should be refused for lack of permission: {report:?}"
    );
    let report = fixture
        .archive_entity(user, entity)
        .await
        .expect_err("users other than the creator should not archive the entity");
    assert_eq!(
        status(&report),
        Some(StatusCode::PermissionDenied),
        "archive should be refused for lack of permission: {report:?}"
    );
    Ok(())
}

#[tokio::test]
async fn access_creator() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;
    let (creator, conversation, focus) = (fixture.creator, fixture.conversation, fixture.focus);

    for entity in [conversation, focus] {
        assert!(
            fixture.can_view_entity(creator, entity).await?,
            "creator should view their own conversation and focus link"
        );
        fixture.update_entity(creator, entity).await?;
        fixture.archive_entity(creator, entity).await?;
    }

    Ok(())
}

#[tokio::test]
async fn access_administrator_creator() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup_with_creator_role(&mut database, RoleName::Administrator).await?;
    let (creator, conversation, focus) = (fixture.creator, fixture.conversation, fixture.focus);

    for entity in [conversation, focus] {
        assert!(
            fixture.can_view_entity(creator, entity).await?,
            "web administrator should view their own conversation and focus link"
        );
        fixture.update_entity(creator, entity).await?;
        fixture.archive_entity(creator, entity).await?;
    }

    Ok(())
}

#[tokio::test]
async fn private_from_other_member() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;
    let (member, conversation, focus) = (fixture.member, fixture.conversation, fixture.focus);

    assert_private(&mut fixture, member, conversation).await?;
    assert_private(&mut fixture, member, focus).await?;

    Ok(())
}

#[tokio::test]
async fn private_from_administrator() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;
    let (administrator, conversation, focus) =
        (fixture.administrator, fixture.conversation, fixture.focus);

    assert_private(&mut fixture, administrator, conversation).await?;
    assert_private(&mut fixture, administrator, focus).await?;

    Ok(())
}

/// Hiding conversations from members leaves them the web's other entities.
#[tokio::test]
async fn view_other_entity_as_member() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;
    let (member, subject) = (fixture.member, fixture.subject);

    assert!(
        fixture.can_view_entity(member, subject).await?,
        "a member should view an entity another user created in the web"
    );

    Ok(())
}

/// Leaving the web revokes the creator's access to conversations created there.
#[tokio::test]
async fn access_ends_after_leaving_web() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;
    let (creator, web_id, conversation, focus) = (
        fixture.creator,
        fixture.web_id,
        fixture.conversation,
        fixture.focus,
    );

    let member_role = fixture
        .store
        .get_role(ActorGroupId::Web(web_id), RoleName::Member)
        .await?
        .expect("web should have a member role")
        .id();
    fixture
        .store
        .unassign_role_by_id(ActorId::User(creator), member_role)
        .await?;

    assert_private(&mut fixture, creator, conversation).await?;
    assert_private(&mut fixture, creator, focus).await?;

    Ok(())
}

#[tokio::test]
async fn publish_private_draft() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;
    let (creator, conversation) = (fixture.creator, fixture.conversation);
    let draft = fixture.update_entity(creator, conversation).await?;

    let published = fixture
        .store
        .patch_entity(
            ActorId::User(creator),
            PatchEntityParams {
                entity_id: draft.metadata.record_id.entity_id,
                decision_time: None,
                entity_type_ids: HashSet::new(),
                properties: Vec::new(),
                draft: Some(false),
                archived: None,
                confidence: None,
                provenance: entity_provenance(),
            },
        )
        .await?;

    assert_eq!(
        published.metadata.record_id.entity_id, conversation,
        "publication should replace the live edition"
    );
    let live = fixture
        .store
        .get_entity_by_id(Some(ActorId::User(creator)), conversation, None, None)
        .await?
        .expect("the creator should still see the published conversation");
    assert_eq!(
        live.metadata.record_id, published.metadata.record_id,
        "the live conversation should be the newly published edition"
    );

    Ok(())
}

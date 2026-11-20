//! The seeded web policies let members and web administrators view, update and archive only the
//! agent conversations, and the links to their focus, that they created.

use core::{error::Error, str::FromStr as _};
use std::collections::{HashMap, HashSet};

use error_stack::Report;
use hash_graph_authorization::policies::{
    Effect,
    action::ActionName,
    principal::PrincipalConstraint,
    store::{CreateWebParameter, PrincipalStore as _},
};
use hash_graph_postgres_store::store::{InTransaction, PostgresStore};
use hash_graph_store::{
    data_type::{CreateDataTypeParams, DataTypeStore as _},
    entity::{
        CreateEntityParams, CreateEntityPolicyParams, EntityQuerySorting, EntityStore as _,
        PatchEntityParams, QueryEntitiesParams,
    },
    entity_type::{CreateEntityTypeParams, EntityTypeStore as _},
    error::UpdateError,
    filter::Filter,
    property_type::{CreatePropertyTypeParams, PropertyTypeStore as _},
    query::ConflictBehavior,
    subgraph::temporal_axes::QueryTemporalAxesUnresolved,
};
use hash_graph_test_data::{data_type, entity_type};
use hash_status::StatusCode;
use pretty_assertions::assert_eq;
use serde::Deserialize as _;
use serde_json::json;
use time::OffsetDateTime;
use tokio_postgres::Transaction;
use type_system::{
    knowledge::{
        Entity, Property,
        entity::{
            EntityId, Link, LinkEndpoint, id::EntityUuid,
            provenance::ProvidedEntityEditionProvenance,
        },
        property::{
            PropertyObject, PropertyObjectWithMetadata, PropertyPatchOperation, PropertyPath,
            PropertyWithMetadata, metadata::PropertyProvenance,
        },
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
/// A type sharing the conversation's property, so an entity can move between the two.
const NOTE_TYPE: &str = "https://hash.ai/@h/types/entity-type/conversation-test-note/v/1";
/// A link type other than the focus link, so a link can move between the two.
const TEST_LINK_TYPE: &str = "https://hash.ai/@h/types/entity-type/conversation-test-link/v/1";
/// The type that web members may view only when they created the entity.
const USER_SECRET_TYPE: &str = "https://hash.ai/@h/types/entity-type/user-secret/v/1";

/// An organization web holding one agent conversation, and the users whose access to it differs.
struct Fixture<'pool> {
    store: PostgresStore<Transaction<'pool>, InTransaction>,
    system_machine: ActorId,
    web_id: WebId,
    /// Member of the web who created the conversation.
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

/// Creates the link types the conversation tests use: the focus link, and another to tell it
/// apart from.
async fn create_link_types(
    store: &mut PostgresStore<Transaction<'_>, InTransaction>,
    actor_id: ActorId,
    web_id: WebId,
) -> Result<(), Box<dyn Error>> {
    store
        .create_entity_types(
            actor_id,
            [CreateEntityTypeParams {
                schema: serde_json::from_str::<EntityType>(entity_type::LINK_V1)?,
                ownership: OntologyOwnership::Remote {
                    fetched_at: OffsetDateTime::now_utc(),
                },
                conflict_behavior: ConflictBehavior::Skip,
                provenance: ontology_provenance(),
                fetched_from_origin: false,
            }],
        )
        .await?;

    store
        .create_entity_types(
            actor_id,
            [HAS_AGENT_CONVERSATION_FOCUS_TYPE, TEST_LINK_TYPE]
                .into_iter()
                .map(|entity_type_id| {
                    Ok::<_, serde_json::Error>(CreateEntityTypeParams {
                        schema: serde_json::from_value::<EntityType>(json!({
                            "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
                            "kind": "entityType",
                            "$id": entity_type_id,
                            "type": "object",
                            "title": if entity_type_id == HAS_AGENT_CONVERSATION_FOCUS_TYPE {
                                "Has Agent Conversation Focus"
                            } else {
                                "Conversation Test Link"
                            },
                            "description": "A link for agent conversation tests.",
                            "allOf": [{ "$ref": LINK_TYPE }],
                            "properties": {}
                        }))?,
                        ownership: OntologyOwnership::Local { web_id },
                        conflict_behavior: ConflictBehavior::Skip,
                        provenance: ontology_provenance(),
                        fetched_from_origin: false,
                    })
                })
                .collect::<Result<Vec<_>, _>>()?,
        )
        .await?;

    Ok(())
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

    create_property_types(store, actor_id, web_id).await?;
    create_link_types(store, actor_id, web_id).await?;

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
            }, CreateEntityTypeParams {
                schema: serde_json::from_value::<EntityType>(json!({
                    "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
                    "kind": "entityType",
                    "$id": NOTE_TYPE,
                    "type": "object",
                    "title": "Conversation Test Note",
                    "description": "A note that records a conversation id.",
                    "properties": {
                        CONVERSATION_ID: { "$ref": CONVERSATION_ID_TYPE }
                    },
                    "links": {
                        TEST_LINK_TYPE: { "type": "array", "items": {} }
                    }
                }))?,
                ownership: OntologyOwnership::Local { web_id },
                conflict_behavior: ConflictBehavior::Skip,
                provenance: ontology_provenance(),
                fetched_from_origin: false,
            }, CreateEntityTypeParams {
                schema: serde_json::from_value::<EntityType>(json!({
                    "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
                    "kind": "entityType",
                    "$id": USER_SECRET_TYPE,
                    "type": "object",
                    "title": "User Secret",
                    "description": "A secret of a user, for agent conversation tests.",
                    "properties": {}
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

/// Creates an agent conversation in `web_id` as `user`.
async fn create_conversation(
    store: &mut PostgresStore<Transaction<'_>, InTransaction>,
    user: UserId,
    web_id: WebId,
) -> Result<EntityId, Box<dyn Error>> {
    Ok(store
        .create_entity(
            ActorId::User(user),
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
        .entity_id)
}

/// Creates a note in `web_id` as `user`, recording a conversation id, with the entity's own
/// `policies`.
async fn create_note(
    store: &mut PostgresStore<Transaction<'_>, InTransaction>,
    user: UserId,
    web_id: WebId,
    policies: Vec<CreateEntityPolicyParams>,
) -> Result<EntityId, Box<dyn Error>> {
    Ok(store
        .create_entity(
            ActorId::User(user),
            CreateEntityParams {
                web_id,
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([VersionedUrl::from_str(NOTE_TYPE)?]),
                properties: PropertyObjectWithMetadata::from_parts(
                    serde_json::from_value::<PropertyObject>(json!({
                        CONVERSATION_ID: "note-conversation"
                    }))?,
                    None,
                )?,
                confidence: None,
                link_data: None,
                draft: false,
                policies,
                provenance: entity_provenance(),
                read_only: false,
            },
        )
        .await?
        .metadata
        .record_id
        .entity_id)
}

/// Creates a link of `link_type` in `web_id` as `user`, from `source` to `target`.
async fn create_link(
    store: &mut PostgresStore<Transaction<'_>, InTransaction>,
    user: UserId,
    web_id: WebId,
    link_type: &str,
    source: EntityId,
    target: EntityId,
) -> Result<EntityId, Box<dyn Error>> {
    Ok(store
        .create_entity(
            ActorId::User(user),
            CreateEntityParams {
                web_id,
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([VersionedUrl::from_str(link_type)?]),
                properties: PropertyObjectWithMetadata::from_parts(PropertyObject::empty(), None)?,
                confidence: None,
                link_data: Some(Link::Directed {
                    source: LinkEndpoint {
                        entity_id: source,
                        confidence: None,
                        provenance: PropertyProvenance::default(),
                    },
                    target: LinkEndpoint {
                        entity_id: target,
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
        .entity_id)
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

    let conversation = create_conversation(&mut store, creator, web_id).await?;
    let subject = create_note(&mut store, administrator, web_id, Vec::new()).await?;
    let focus = create_link(
        &mut store,
        creator,
        web_id,
        HAS_AGENT_CONVERSATION_FOCUS_TYPE,
        conversation,
        subject,
    )
    .await?;

    Ok(Fixture {
        store,
        system_machine,
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
    /// Whether `user` can view the conversation.
    async fn can_view(&mut self, user: UserId) -> Result<bool, Box<dyn Error>> {
        self.can_view_entity(user, self.conversation).await
    }

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

    /// Requests an edit to the conversation, opening a draft of it, as `user`.
    async fn update(&mut self, user: UserId) -> Result<Entity, Report<UpdateError>> {
        self.update_entity(user, self.conversation).await
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

    /// Requests archival of the conversation, as `user`.
    async fn archive(&mut self, user: UserId) -> Result<Entity, Report<UpdateError>> {
        self.archive_entity(user, self.conversation).await
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

    /// Creates a note in the web as `user`, recording a conversation id.
    async fn create_note(&mut self, user: UserId) -> Result<EntityId, Box<dyn Error>> {
        create_note(&mut self.store, user, self.web_id, Vec::new()).await
    }

    /// The conversations of `user` that focus on `subject`, read as the process editor reads them.
    async fn read_conversations(
        &mut self,
        user: UserId,
        subject: EntityId,
    ) -> Result<Vec<EntityUuid>, Box<dyn Error>> {
        let filter = json!({
            "all": [
                { "equal": [{ "path": ["type", "versionedUrl"] }, { "parameter": AGENT_CONVERSATION_TYPE }] },
                { "equal": [{ "path": ["createdById"] }, { "parameter": user }] },
                { "equal": [{ "path": ["archived"] }, { "parameter": false }] },
                {
                    "equal": [
                        { "path": ["outgoingLinks", "type", "versionedUrl"] },
                        { "parameter": HAS_AGENT_CONVERSATION_FOCUS_TYPE }
                    ]
                },
                { "equal": [{ "path": ["outgoingLinks", "archived"] }, { "parameter": false }] },
                {
                    "equal": [
                        { "path": ["outgoingLinks", "rightEntity", "webId"] },
                        { "parameter": subject.web_id }
                    ]
                },
                {
                    "equal": [
                        { "path": ["outgoingLinks", "rightEntity", "uuid"] },
                        { "parameter": subject.entity_uuid }
                    ]
                }
            ]
        });
        let response = self
            .store
            .query_entities(
                Some(ActorId::User(user)),
                QueryEntitiesParams {
                    filter: Filter::deserialize(&filter)?,
                    temporal_axes: QueryTemporalAxesUnresolved::live_only(),
                    sorting: EntityQuerySorting {
                        paths: Vec::new(),
                        cursor: None,
                    },
                    conversions: Vec::new(),
                    limit: 10,
                    include_drafts: false,
                    include_entity_types: None,
                    include_permissions: false,
                },
            )
            .await?;

        Ok(response
            .entities
            .iter()
            .map(|entity| entity.metadata.record_id.entity_id.entity_uuid)
            .collect())
    }

    /// Replaces the types of `entity` with `entity_types`, as `user`.
    async fn reclassify(
        &mut self,
        user: UserId,
        entity: EntityId,
        entity_types: &[&str],
    ) -> Result<Entity, Report<UpdateError>> {
        self.store
            .patch_entity(
                ActorId::User(user),
                PatchEntityParams {
                    entity_id: entity,
                    decision_time: None,
                    entity_type_ids: entity_types
                        .iter()
                        .map(|entity_type| {
                            VersionedUrl::from_str(entity_type).expect("should parse type URL")
                        })
                        .collect(),
                    properties: Vec::new(),
                    draft: None,
                    archived: None,
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

/// Asserts that `report` refuses a change for adding or removing the `title` classification,
/// rather than for an earlier permission check.
fn assert_classification_preserved(report: &Report<UpdateError>, title: &str) {
    assert_eq!(
        status(report),
        Some(StatusCode::PermissionDenied),
        "changing the classification should be refused: {report:?}"
    );
    let message = format!("must preserve the {title} classification");
    assert!(
        format!("{report:?}").contains(&message),
        "the classification guard should refuse the change, with \"{message}\": {report:?}"
    );
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
        !fixture.can_view(fixture.administrator).await?,
        "web administrator should not view another user's conversation"
    );

    Ok(())
}

/// Hiding conversations from members leaves them the web's other entities.
#[tokio::test]
async fn view_entity_other_member() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;
    let (member, subject) = (fixture.member, fixture.subject);

    assert!(
        fixture.can_view_entity(member, subject).await?,
        "a member should view an entity another user created in the web"
    );

    Ok(())
}

#[tokio::test]
async fn view_user_secret_other_member() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;
    let (creator, member, web_id) = (fixture.creator, fixture.member, fixture.web_id);
    let secret = fixture
        .store
        .create_entity(
            ActorId::User(creator),
            CreateEntityParams {
                web_id,
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([VersionedUrl::from_str(USER_SECRET_TYPE)?]),
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

    assert!(
        fixture.can_view_entity(creator, secret).await?,
        "a member should view their own user secret"
    );
    assert!(
        !fixture.can_view_entity(member, secret).await?,
        "a member should not view another member's user secret"
    );

    Ok(())
}

#[tokio::test]
async fn update_administrator() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;

    let report = fixture
        .update(fixture.administrator)
        .await
        .expect_err("web administrator should not update another user's conversation");
    assert_eq!(
        status(&report),
        Some(StatusCode::PermissionDenied),
        "update should be refused for lack of permission: {report:?}"
    );

    Ok(())
}

#[tokio::test]
async fn archive_administrator() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;

    let report = fixture
        .archive(fixture.administrator)
        .await
        .expect_err("web administrator should not archive another user's conversation");
    assert_eq!(
        status(&report),
        Some(StatusCode::PermissionDenied),
        "archive should be refused for lack of permission: {report:?}"
    );

    Ok(())
}

#[tokio::test]
async fn access_administrator_creator() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup_with_creator_role(&mut database, RoleName::Administrator).await?;

    assert!(
        fixture.can_view(fixture.creator).await?,
        "web administrator should view their own conversation"
    );
    fixture.archive(fixture.creator).await?;
    fixture.update(fixture.creator).await?;

    Ok(())
}

#[tokio::test]
async fn update_creator() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;

    fixture.update(fixture.creator).await?;

    Ok(())
}

/// A live edit that keeps the conversation's types needs no reclassification check.
#[tokio::test]
async fn update_properties_creator() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;

    let updated = fixture
        .store
        .patch_entity(
            ActorId::User(fixture.creator),
            PatchEntityParams {
                entity_id: fixture.conversation,
                decision_time: None,
                entity_type_ids: HashSet::new(),
                properties: vec![PropertyPatchOperation::Replace {
                    path: PropertyPath::default(),
                    property: PropertyWithMetadata::from_parts(
                        Property::Object(serde_json::from_value::<PropertyObject>(json!({
                            CONVERSATION_ID: "conversation-2",
                            AGENT_ID: "brunch/hash"
                        }))?),
                        None,
                    )?,
                }],
                draft: None,
                archived: None,
                confidence: None,
                provenance: entity_provenance(),
            },
        )
        .await?;

    assert_eq!(
        updated.metadata.record_id.entity_id, fixture.conversation,
        "the update should edit the live conversation, not open a draft"
    );
    assert_eq!(
        updated.properties,
        serde_json::from_value::<PropertyObject>(json!({
            CONVERSATION_ID: "conversation-2",
            AGENT_ID: "brunch/hash"
        }))?,
        "the update should replace the conversation's properties"
    );

    Ok(())
}

#[tokio::test]
async fn publish_private_draft() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;
    let draft = fixture.update(fixture.creator).await?;

    let published = fixture
        .store
        .patch_entity(
            ActorId::User(fixture.creator),
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
        published.metadata.record_id.entity_id, fixture.conversation,
        "publication should replace the live edition"
    );
    let live = fixture
        .store
        .get_entity_by_id(
            Some(ActorId::User(fixture.creator)),
            fixture.conversation,
            None,
            None,
        )
        .await?
        .expect("the creator should still see the published conversation");
    assert_eq!(
        live.metadata.record_id, published.metadata.record_id,
        "the live conversation should be the newly published edition"
    );
    assert!(
        !fixture.can_view(fixture.member).await?,
        "another member should not see the published conversation"
    );
    assert!(
        !fixture.can_view(fixture.administrator).await?,
        "the web administrator should not see the published conversation"
    );

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

#[tokio::test]
async fn declassify_creator() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;

    let report = fixture
        .reclassify(fixture.creator, fixture.conversation, &[NOTE_TYPE])
        .await
        .expect_err("creator should not remove the Agent Conversation type");
    assert_classification_preserved(&report, "Agent Conversation");

    Ok(())
}

#[tokio::test]
async fn classify_shared_entity_member() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;
    let note = fixture.create_note(fixture.member).await?;

    let report = fixture
        .reclassify(fixture.member, note, &[NOTE_TYPE, AGENT_CONVERSATION_TYPE])
        .await
        .expect_err("member should not add the Agent Conversation type to an existing entity");
    assert_classification_preserved(&report, "Agent Conversation");

    Ok(())
}

#[tokio::test]
async fn focus_access_creator() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;
    let (creator, focus) = (fixture.creator, fixture.focus);

    assert!(
        fixture.can_view_entity(creator, focus).await?,
        "creator should view their conversation's focus link"
    );
    fixture.update_entity(creator, focus).await?;
    fixture.archive_entity(creator, focus).await?;

    Ok(())
}

/// Asserts that `user` can't view, update or archive the conversation's focus link.
async fn assert_focus_private(
    fixture: &mut Fixture<'_>,
    user: UserId,
) -> Result<(), Box<dyn Error>> {
    let focus = fixture.focus;
    assert!(
        !fixture.can_view_entity(user, focus).await?,
        "the focus link should be hidden from users other than its creator"
    );
    let report = fixture
        .update_entity(user, focus)
        .await
        .expect_err("users other than the creator should not update the focus link");
    assert_eq!(
        status(&report),
        Some(StatusCode::PermissionDenied),
        "update should be refused for lack of permission: {report:?}"
    );
    let report = fixture
        .archive_entity(user, focus)
        .await
        .expect_err("users other than the creator should not archive the focus link");
    assert_eq!(
        status(&report),
        Some(StatusCode::PermissionDenied),
        "archive should be refused for lack of permission: {report:?}"
    );
    Ok(())
}

#[tokio::test]
async fn focus_access_other_member() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;
    let member = fixture.member;

    assert_focus_private(&mut fixture, member).await
}

#[tokio::test]
async fn focus_access_administrator() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;
    let administrator = fixture.administrator;

    assert_focus_private(&mut fixture, administrator).await
}

/// A user links their conversation, in their own web, to an entity in a web where they may only
/// view it.
#[tokio::test]
async fn focus_across_webs() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;
    let (creator, administrator) = (fixture.creator, fixture.administrator);

    let own_web = fixture
        .store
        .create_web(
            fixture.system_machine,
            CreateWebParameter {
                id: None,
                administrator: Some(ActorId::User(creator)),
                shortname: None,
                is_actor_web: true,
            },
        )
        .await?
        .web_id;
    let outside_web = fixture
        .store
        .create_web(
            fixture.system_machine,
            CreateWebParameter {
                id: None,
                administrator: Some(ActorId::User(administrator)),
                shortname: None,
                is_actor_web: false,
            },
        )
        .await?
        .web_id;
    let subject = create_note(
        &mut fixture.store,
        administrator,
        outside_web,
        vec![CreateEntityPolicyParams {
            name: "creator-view".to_owned(),
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::Actor {
                actor: ActorId::User(creator),
            }),
            actions: vec![ActionName::ViewEntity],
        }],
    )
    .await?;
    assert!(
        fixture.can_view_entity(creator, subject).await?,
        "the creator should view the subject"
    );
    create_note(&mut fixture.store, creator, outside_web, Vec::new())
        .await
        .expect_err("the creator should not create entities in the subject's web");

    let conversation = create_conversation(&mut fixture.store, creator, own_web).await?;
    let focus = create_link(
        &mut fixture.store,
        creator,
        own_web,
        HAS_AGENT_CONVERSATION_FOCUS_TYPE,
        conversation,
        subject,
    )
    .await?;

    assert!(
        fixture.can_view_entity(creator, focus).await?,
        "the creator should view the focus link in their own web"
    );

    Ok(())
}

/// The Graph checks a link against the links its source's types declare, so only an agent
/// conversation can have a focus link.
#[tokio::test]
async fn focus_source_not_conversation() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;
    let (creator, web_id, subject) = (fixture.creator, fixture.web_id, fixture.subject);
    let note = fixture.create_note(creator).await?;

    let error = create_link(
        &mut fixture.store,
        creator,
        web_id,
        HAS_AGENT_CONVERSATION_FOCUS_TYPE,
        note,
        subject,
    )
    .await
    .expect_err("a focus link from an entity that is not a conversation should be refused");
    assert!(
        error
            .to_string()
            .contains("do not match their entity types"),
        "the link should be refused by validation: {error:?}"
    );

    Ok(())
}

/// The read the process editor makes for a user's conversations on a subject, in any web.
#[tokio::test]
async fn focus_read_conversation() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;
    let (creator, web_id, subject) = (fixture.creator, fixture.web_id, fixture.subject);

    // The creator's conversation on another entity.
    let elsewhere_conversation = create_conversation(&mut fixture.store, creator, web_id).await?;
    let elsewhere = fixture.create_note(creator).await?;
    create_link(
        &mut fixture.store,
        creator,
        web_id,
        HAS_AGENT_CONVERSATION_FOCUS_TYPE,
        elsewhere_conversation,
        elsewhere,
    )
    .await?;
    // A conversation with no focus.
    create_conversation(&mut fixture.store, creator, web_id).await?;

    let found = fixture.read_conversations(creator, subject).await?;
    assert_eq!(
        found,
        [fixture.conversation.entity_uuid],
        "only the conversation whose focus link targets the subject should be read"
    );

    Ok(())
}

#[tokio::test]
async fn declassify_focus_creator() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;
    let (creator, focus) = (fixture.creator, fixture.focus);

    let report = fixture
        .reclassify(creator, focus, &[TEST_LINK_TYPE])
        .await
        .expect_err("creator should not remove the Has Agent Conversation Focus type");
    assert_classification_preserved(&report, "Has Agent Conversation Focus");

    Ok(())
}

#[tokio::test]
async fn classify_shared_link_member() -> Result<(), Box<dyn Error>> {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await?;
    let (member, web_id, subject) = (fixture.member, fixture.web_id, fixture.subject);
    let note = fixture.create_note(member).await?;
    let link = create_link(
        &mut fixture.store,
        member,
        web_id,
        TEST_LINK_TYPE,
        note,
        subject,
    )
    .await?;

    let report = fixture
        .reclassify(
            member,
            link,
            &[TEST_LINK_TYPE, HAS_AGENT_CONVERSATION_FOCUS_TYPE],
        )
        .await
        .expect_err("member should not add the Has Agent Conversation Focus type to a link");
    assert_classification_preserved(&report, "Has Agent Conversation Focus");

    Ok(())
}

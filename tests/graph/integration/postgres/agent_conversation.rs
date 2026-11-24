//! Default web policies keep `Agent Conversation` entities and their `Has Agent Conversation
//! Focus` links private to the user who created them, across both members and administrators,
//! while preserving access to shared web entities.

use core::str::FromStr as _;
use std::collections::HashSet;

use error_stack::Report;
use hash_graph_authorization::policies::store::{CreateWebParameter, PrincipalStore as _};
use hash_graph_store::{
    entity::{CreateEntityParams, EntityStore as _, PatchEntityParams},
    entity_type::{CreateEntityTypeParams, EntityTypeStore as _},
    error::UpdateError,
    query::ConflictBehavior,
};
use hash_graph_test_data::{data_type, entity, entity_type, property_type};
use hash_status::StatusCode;
use pretty_assertions::{assert_eq, assert_ne};
use rstest::rstest;
use serde_json::json;
use type_system::{
    knowledge::{
        Entity,
        entity::{EntityId, Link, LinkEndpoint, provenance::ProvidedEntityEditionProvenance},
        property::{PropertyObject, PropertyObjectWithMetadata, metadata::PropertyProvenance},
    },
    ontology::{
        VersionedUrl,
        entity_type::EntityType,
        provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
    },
    principal::{
        actor::{ActorId, ActorType, UserId},
        actor_group::{ActorGroupId, WebId},
        role::RoleName,
    },
    provenance::{OriginProvenance, OriginType},
};

use crate::{DatabaseApi, DatabaseTestWrapper};

const AGENT_CONVERSATION_TYPE: &str = "https://hash.ai/@h/types/entity-type/agent-conversation/v/1";
const HAS_AGENT_CONVERSATION_FOCUS_TYPE: &str =
    "https://hash.ai/@h/types/entity-type/has-agent-conversation-focus/v/1";
const LINK_TYPE: &str = "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1";
const PERSON_TYPE: &str = "https://blockprotocol.org/@alice/types/entity-type/person/v/1";

/// An organization web holding a shared entity, one agent conversation, and its focus link.
struct Fixture<'pool> {
    api: DatabaseApi<'pool>,
    web_id: WebId,
    /// User in the web who created the conversation and focus link.
    creator: UserId,
    /// Member of the web who did not create the conversation.
    member: UserId,
    /// Administrator of the web.
    administrator: UserId,
    conversation: EntityId,
    /// A shared entity in the web, created by a third member so neither `member` nor
    /// `administrator` is its creator.
    shared_entity: EntityId,
    /// The creator's focus link from the conversation to `shared_entity`.
    focus: EntityId,
}

const fn entity_provenance() -> ProvidedEntityEditionProvenance {
    ProvidedEntityEditionProvenance {
        actor_type: ActorType::User,
        origin: OriginProvenance::from_empty_type(OriginType::Api),
        sources: Vec::new(),
    }
}

const fn ontology_provenance() -> ProvidedOntologyEditionProvenance {
    ProvidedOntologyEditionProvenance {
        actor_type: ActorType::User,
        origin: OriginProvenance::from_empty_type(OriginType::Api),
        sources: Vec::new(),
    }
}

async fn create_conversation_types(api: &mut DatabaseApi<'_>, actor_id: ActorId, web_id: WebId) {
    // Minimal conversation and focus link schemas matching the base URLs in `seed_policies.rs`.
    api.create_entity_types(
        actor_id,
        [
            CreateEntityTypeParams {
                schema: serde_json::from_value::<EntityType>(json!({
                    "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
                    "kind": "entityType",
                    "$id": HAS_AGENT_CONVERSATION_FOCUS_TYPE,
                    "type": "object",
                    "title": "Has Agent Conversation Focus",
                    "description": "Links an agent conversation to a focused entity.",
                    "allOf": [{ "$ref": LINK_TYPE }],
                    "properties": {}
                }))
                .expect("could not build focus link schema"),
                ownership: OntologyOwnership::Local { web_id },
                conflict_behavior: ConflictBehavior::Skip,
                provenance: ontology_provenance(),
                fetched_from_origin: false,
            },
            CreateEntityTypeParams {
                schema: serde_json::from_value::<EntityType>(json!({
                    "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
                    "kind": "entityType",
                    "$id": AGENT_CONVERSATION_TYPE,
                    "type": "object",
                    "title": "Agent Conversation",
                    "description": "A conversation between a user and an AI agent.",
                    "properties": {},
                    "links": {
                        HAS_AGENT_CONVERSATION_FOCUS_TYPE: { "type": "array", "items": {} }
                    }
                }))
                .expect("could not build conversation schema"),
                ownership: OntologyOwnership::Local { web_id },
                conflict_behavior: ConflictBehavior::Skip,
                provenance: ontology_provenance(),
                fetched_from_origin: false,
            },
        ],
    )
    .await
    .expect("could not create conversation entity types");
}

async fn create_fixture_entities(
    api: &mut DatabaseApi<'_>,
    web_id: WebId,
    creator: UserId,
    other_author: UserId,
) -> (EntityId, EntityId, EntityId) {
    let person: PropertyObject =
        serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse person entity");
    let shared_entity = api
        .create_entity(
            ActorId::User(other_author),
            CreateEntityParams {
                web_id,
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([
                    VersionedUrl::from_str(PERSON_TYPE).expect("valid person type URL")
                ]),
                properties: PropertyObjectWithMetadata::from_parts(person, None)
                    .expect("could not build person properties"),
                confidence: None,
                link_data: None,
                draft: false,
                policies: Vec::new(),
                provenance: entity_provenance(),
                read_only: false,
            },
        )
        .await
        .expect("could not create shared entity")
        .metadata
        .record_id
        .entity_id;

    let conversation = api
        .create_entity(
            ActorId::User(creator),
            CreateEntityParams {
                web_id,
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([VersionedUrl::from_str(AGENT_CONVERSATION_TYPE)
                    .expect("valid conversation type URL")]),
                properties: PropertyObjectWithMetadata::from_parts(PropertyObject::empty(), None)
                    .expect("could not build conversation properties"),
                confidence: None,
                link_data: None,
                draft: false,
                policies: Vec::new(),
                provenance: entity_provenance(),
                read_only: false,
            },
        )
        .await
        .expect("could not create conversation")
        .metadata
        .record_id
        .entity_id;

    let focus = api
        .create_entity(
            ActorId::User(creator),
            CreateEntityParams {
                web_id,
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([VersionedUrl::from_str(
                    HAS_AGENT_CONVERSATION_FOCUS_TYPE,
                )
                .expect("valid focus link type URL")]),
                properties: PropertyObjectWithMetadata::from_parts(PropertyObject::empty(), None)
                    .expect("could not build focus link properties"),
                confidence: None,
                link_data: Some(Link::Directed {
                    source: LinkEndpoint {
                        entity_id: conversation,
                        confidence: None,
                        provenance: PropertyProvenance::default(),
                    },
                    target: LinkEndpoint {
                        entity_id: shared_entity,
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
        .await
        .expect("could not create focus link")
        .metadata
        .record_id
        .entity_id;

    (shared_entity, conversation, focus)
}

async fn setup_with_creator_role(
    database: &mut DatabaseTestWrapper,
    creator_role: RoleName,
) -> Fixture<'_> {
    let mut api = database
        .seed(
            [
                data_type::VALUE_V1,
                data_type::TEXT_V1,
                data_type::NUMBER_V1,
            ],
            [
                property_type::NAME_V1,
                property_type::AGE_V1,
                property_type::FAVORITE_SONG_V1,
                property_type::FAVORITE_FILM_V1,
                property_type::HOBBY_V1,
                property_type::INTERESTS_V1,
            ],
            [
                entity_type::LINK_V1,
                entity_type::link::FRIEND_OF_V1,
                entity_type::link::ACQUAINTANCE_OF_V1,
                entity_type::PERSON_V1,
            ],
        )
        .await
        .expect("could not seed database");

    let system_machine = ActorId::Machine(
        api.store
            .get_or_create_system_machine("h")
            .await
            .expect("could not get system machine"),
    );
    let creator = api.store.create_user(None).await.expect("create creator");
    let member = api.store.create_user(None).await.expect("create member");
    let other_author = api.store.create_user(None).await.expect("create author");
    let administrator = api.store.create_user(None).await.expect("create admin");

    let web_id = api
        .store
        .create_web(
            system_machine,
            CreateWebParameter {
                id: None,
                administrator: Some(ActorId::User(administrator)),
                shortname: None,
                is_actor_web: false,
            },
        )
        .await
        .expect("could not create web")
        .web_id;

    let member_role = api
        .store
        .get_role(ActorGroupId::Web(web_id), RoleName::Member)
        .await
        .expect("could not query member role")
        .expect("web should have a member role")
        .id();
    api.store
        .assign_role_by_id(ActorId::User(member), member_role)
        .await
        .expect("could not assign member role");
    api.store
        .assign_role_by_id(ActorId::User(other_author), member_role)
        .await
        .expect("could not assign other author role");
    let creator_role_id = api
        .store
        .get_role(ActorGroupId::Web(web_id), creator_role)
        .await
        .expect("could not query creator role")
        .expect("web should have the creator's role")
        .id();
    api.store
        .assign_role_by_id(ActorId::User(creator), creator_role_id)
        .await
        .expect("could not assign creator role");

    create_conversation_types(&mut api, ActorId::User(administrator), web_id).await;
    let (shared_entity, conversation, focus) =
        create_fixture_entities(&mut api, web_id, creator, other_author).await;

    Fixture {
        api,
        web_id,
        creator,
        member,
        administrator,
        conversation,
        shared_entity,
        focus,
    }
}

async fn setup(database: &mut DatabaseTestWrapper) -> Fixture<'_> {
    setup_with_creator_role(database, RoleName::Member).await
}

impl Fixture<'_> {
    async fn can_view_entity(&mut self, user: UserId, entity: EntityId) -> bool {
        self.api
            .get_entity_by_id(Some(ActorId::User(user)), entity, None, None)
            .await
            .expect("get_entity_by_id failed")
            .is_some()
    }

    async fn update_entity(
        &mut self,
        user: UserId,
        entity: EntityId,
    ) -> Result<Entity, Report<UpdateError>> {
        self.api
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

    async fn archive_entity(
        &mut self,
        user: UserId,
        entity: EntityId,
    ) -> Result<Entity, Report<UpdateError>> {
        self.api
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

fn status(report: &Report<UpdateError>) -> Option<&StatusCode> {
    report.request_ref::<StatusCode>().next()
}

/// Asserts that `user` can view, update, and archive `entity`.
async fn assert_accessible(fixture: &mut Fixture<'_>, user: UserId, entity: EntityId) {
    assert!(
        fixture.can_view_entity(user, entity).await,
        "user should be able to view the entity"
    );
    fixture
        .update_entity(user, entity)
        .await
        .expect("user should be able to update the entity");
    fixture
        .archive_entity(user, entity)
        .await
        .expect("user should be able to archive the entity");
}

/// Asserts that `user` cannot view, update, or archive `entity`.
async fn assert_private(fixture: &mut Fixture<'_>, user: UserId, entity: EntityId) {
    assert!(
        !fixture.can_view_entity(user, entity).await,
        "user should not be able to view the entity"
    );
    let report = fixture
        .update_entity(user, entity)
        .await
        .expect_err("user should not be able to update the entity");
    assert_eq!(
        status(&report),
        Some(&StatusCode::PermissionDenied),
        "update should be refused for lack of permission: {report:?}"
    );
    let report = fixture
        .archive_entity(user, entity)
        .await
        .expect_err("user should not be able to archive the entity");
    assert_eq!(
        status(&report),
        Some(&StatusCode::PermissionDenied),
        "archive should be refused for lack of permission: {report:?}"
    );
}

#[rstest]
#[case::member(RoleName::Member)]
#[case::administrator(RoleName::Administrator)]
#[tokio::test]
async fn creator_can_access_conversation_and_focus(#[case] creator_role: RoleName) {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup_with_creator_role(&mut database, creator_role).await;
    let (creator, conversation, focus) = (fixture.creator, fixture.conversation, fixture.focus);

    assert_accessible(&mut fixture, creator, conversation).await;
    assert_accessible(&mut fixture, creator, focus).await;
}

#[tokio::test]
async fn other_member_cannot_access_conversation_and_focus() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await;
    let (member, conversation, focus) = (fixture.member, fixture.conversation, fixture.focus);

    assert_private(&mut fixture, member, conversation).await;
    assert_private(&mut fixture, member, focus).await;
}

#[tokio::test]
async fn administrator_cannot_access_other_users_conversation_and_focus() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await;
    let (administrator, conversation, focus) =
        (fixture.administrator, fixture.conversation, fixture.focus);

    assert_private(&mut fixture, administrator, conversation).await;
    assert_private(&mut fixture, administrator, focus).await;
}

/// Hiding conversations leaves members and administrators full access to shared entities they did
/// not create.
#[rstest]
#[case::member(RoleName::Member)]
#[case::administrator(RoleName::Administrator)]
#[tokio::test]
async fn non_creator_retains_access_to_shared_entity(#[case] role: RoleName) {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await;
    let user = match role {
        RoleName::Member => fixture.member,
        RoleName::Administrator => fixture.administrator,
    };
    let shared_entity = fixture.shared_entity;

    assert_accessible(&mut fixture, user, shared_entity).await;
}

/// Leaving the web revokes the creator's access to conversations created there.
#[tokio::test]
async fn creator_loses_access_after_leaving_web() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await;
    let (creator, web_id, conversation, focus) = (
        fixture.creator,
        fixture.web_id,
        fixture.conversation,
        fixture.focus,
    );

    let member_role = fixture
        .api
        .store
        .get_role(ActorGroupId::Web(web_id), RoleName::Member)
        .await
        .expect("could not query member role")
        .expect("web should have a member role")
        .id();
    fixture
        .api
        .store
        .unassign_role_by_id(ActorId::User(creator), member_role)
        .await
        .expect("could not unassign member role");

    assert_private(&mut fixture, creator, conversation).await;
    assert_private(&mut fixture, creator, focus).await;
}

#[tokio::test]
async fn creator_can_publish_private_conversation_draft() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await;
    let (creator, conversation) = (fixture.creator, fixture.conversation);
    let initial = fixture
        .api
        .get_entity_by_id(Some(ActorId::User(creator)), conversation, None, None)
        .await
        .expect("could not get initial conversation")
        .expect("creator should see the initial conversation");
    let draft = fixture
        .update_entity(creator, conversation)
        .await
        .expect("creator should open a draft of the conversation");

    let published = fixture
        .api
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
        .await
        .expect("creator should publish the conversation draft");

    assert_ne!(
        published.metadata.record_id.edition_id, initial.metadata.record_id.edition_id,
        "publication should create a new live edition"
    );
    let live = fixture
        .api
        .get_entity_by_id(Some(ActorId::User(creator)), conversation, None, None)
        .await
        .expect("could not get live conversation")
        .expect("creator should still see the published conversation");
    assert_eq!(
        live.metadata.record_id, published.metadata.record_id,
        "the live conversation should be the newly published edition"
    );
}

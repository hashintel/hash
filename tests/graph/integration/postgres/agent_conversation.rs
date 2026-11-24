//! Default web policies keep `Agent Conversation` entities and their `Has Agent Conversation
//! Focus` links private to the user who created them, across both members and administrators,
//! while preserving access to shared web entities.

use core::str::FromStr as _;
use std::collections::HashSet;

use error_stack::Report;
use hash_graph_authorization::policies::store::{CreateWebParameter, PrincipalStore as _};
use hash_graph_store::{
    entity::{CreateEntityParams, EntityStore as _, PatchEntityParams},
    error::UpdateError,
};
use hash_graph_test_data::{data_type, entity_type, property_type};
use hash_status::StatusCode;
use pretty_assertions::{assert_eq, assert_ne};
use rstest::rstest;
use type_system::{
    knowledge::{
        Entity,
        entity::{EntityId, Link, LinkEndpoint, provenance::ProvidedEntityEditionProvenance},
        property::{PropertyObject, PropertyObjectWithMetadata, metadata::PropertyProvenance},
    },
    ontology::VersionedUrl,
    principal::{
        actor::{ActorId, ActorType, UserId},
        actor_group::{ActorGroupId, WebId},
        role::{RoleId, RoleName},
    },
    provenance::{OriginProvenance, OriginType},
};

use crate::{DatabaseApi, DatabaseTestWrapper};

const AGENT_CONVERSATION_TYPE: &str = "https://hash.ai/@h/types/entity-type/agent-conversation/v/1";
const HAS_AGENT_CONVERSATION_FOCUS_TYPE: &str =
    "https://hash.ai/@h/types/entity-type/has-agent-conversation-focus/v/1";
const USAGE_RECORD_TYPE: &str = "https://hash.ai/@h/types/entity-type/usage-record/v/1";
const ORGANIZATION_TYPE: &str =
    "https://blockprotocol.org/@alice/types/entity-type/organization/v/1";

/// An organization web holding a shared entity, one agent conversation, and its focus link.
struct Fixture<'pool> {
    api: DatabaseApi<'pool>,
    web_id: WebId,
    /// User in the web who created the conversation and focus link.
    creator: UserId,
    /// Member of the web who did not create the conversation.
    member: UserId,
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

/// Creates an entity of `entity_types` without properties in `web_id`.
async fn create_entity(
    api: &mut DatabaseApi<'_>,
    creator: UserId,
    web_id: WebId,
    entity_types: &[&str],
) -> EntityId {
    api.create_entity(
        ActorId::User(creator),
        CreateEntityParams {
            web_id,
            entity_uuid: None,
            decision_time: None,
            entity_type_ids: entity_types
                .iter()
                .map(|entity_type| {
                    VersionedUrl::from_str(entity_type).expect("could not parse entity type URL")
                })
                .collect(),
            properties: PropertyObjectWithMetadata::from_parts(PropertyObject::empty(), None)
                .expect("could not build properties"),
            confidence: None,
            link_data: None,
            draft: false,
            policies: Vec::new(),
            provenance: entity_provenance(),
            read_only: false,
        },
    )
    .await
    .expect("could not create entity")
    .metadata
    .record_id
    .entity_id
}

async fn web_role_id(api: &DatabaseApi<'_>, web_id: WebId, role: RoleName) -> RoleId {
    api.store
        .get_role(ActorGroupId::Web(web_id), role)
        .await
        .expect("could not query role")
        .expect("web should have the role")
        .id()
}

async fn setup_with_creator_role(
    database: &mut DatabaseTestWrapper,
    creator_role: RoleName,
) -> Fixture<'_> {
    let mut api = database
        .seed(
            [data_type::VALUE_V1, data_type::TEXT_V1],
            [property_type::NAME_V1],
            [
                entity_type::LINK_V1,
                entity_type::link::HAS_AGENT_CONVERSATION_FOCUS_V1,
                entity_type::ORGANIZATION_V1,
                entity_type::AGENT_CONVERSATION_V1,
                entity_type::USAGE_RECORD_V1,
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

    for (user, role) in [
        (member, RoleName::Member),
        (other_author, RoleName::Member),
        (creator, creator_role),
    ] {
        let role_id = web_role_id(&api, web_id, role).await;
        api.store
            .assign_role_by_id(ActorId::User(user), role_id)
            .await
            .expect("could not assign role");
    }

    let shared_entity = create_entity(&mut api, other_author, web_id, &[ORGANIZATION_TYPE]).await;
    let conversation = create_entity(&mut api, creator, web_id, &[AGENT_CONVERSATION_TYPE]).await;
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
                .expect("could not parse entity type URL")]),
                properties: PropertyObjectWithMetadata::from_parts(PropertyObject::empty(), None)
                    .expect("could not build properties"),
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

    /// Requests an edit to `entity` as `user`, opening a draft of it.
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
#[track_caller]
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

/// Asserts that `user` can neither update nor archive `entity`.
#[track_caller]
async fn assert_unmodifiable(fixture: &mut Fixture<'_>, user: UserId, entity: EntityId) {
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

/// Asserts that `user` cannot view, update, or archive `entity`.
#[track_caller]
async fn assert_private(fixture: &mut Fixture<'_>, user: UserId, entity: EntityId) {
    assert!(
        !fixture.can_view_entity(user, entity).await,
        "user should not be able to view the entity"
    );
    assert_unmodifiable(fixture, user, entity).await;
}

#[rstest]
#[case::member(RoleName::Member)]
#[case::administrator(RoleName::Administrator)]
#[tokio::test]
async fn access_creator(#[case] creator_role: RoleName) {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup_with_creator_role(&mut database, creator_role).await;
    let (creator, conversation, focus) = (fixture.creator, fixture.conversation, fixture.focus);

    assert_accessible(&mut fixture, creator, conversation).await;
    assert_accessible(&mut fixture, creator, focus).await;
}

#[tokio::test]
async fn access_other_member() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await;
    let (member, conversation, focus) = (fixture.member, fixture.conversation, fixture.focus);

    assert_private(&mut fixture, member, conversation).await;
    assert_private(&mut fixture, member, focus).await;
}

#[tokio::test]
async fn access_administrator() {
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
async fn access_shared_entity(#[case] role: RoleName) {
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
async fn access_after_leaving_web() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup(&mut database).await;
    let (creator, web_id, conversation, focus) = (
        fixture.creator,
        fixture.web_id,
        fixture.conversation,
        fixture.focus,
    );

    let member_role = web_role_id(&fixture.api, web_id, RoleName::Member).await;
    fixture
        .api
        .store
        .unassign_role_by_id(ActorId::User(creator), member_role)
        .await
        .expect("could not unassign member role");

    assert_private(&mut fixture, creator, conversation).await;
    assert_private(&mut fixture, creator, focus).await;
}

/// A creator-private type does not let its creator update or archive an entity whose other type
/// the web's policies exclude.
#[rstest]
#[case::member(RoleName::Member)]
#[case::administrator(RoleName::Administrator)]
#[tokio::test]
async fn access_excluded_type_creator(#[case] creator_role: RoleName) {
    let mut database = DatabaseTestWrapper::new().await;
    let mut fixture = setup_with_creator_role(&mut database, creator_role).await;
    let (creator, web_id) = (fixture.creator, fixture.web_id);
    let entity = create_entity(
        &mut fixture.api,
        creator,
        web_id,
        &[AGENT_CONVERSATION_TYPE, USAGE_RECORD_TYPE],
    )
    .await;

    assert_unmodifiable(&mut fixture, creator, entity).await;
}

#[tokio::test]
async fn publish_draft_creator() {
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

use core::iter::once;
use std::collections::{HashMap, HashSet};

use error_stack::Report;
use hash_graph_store::{
    entity::{CreateEntityParams, EntityStore as _, PatchEntityParams},
    error::UpdateError,
};
use hash_graph_test_data::{data_type, entity, entity_type, property_type};
use hash_status::StatusCode;
use type_system::{
    knowledge::{
        Entity, PropertyValue,
        entity::{EntityId, provenance::ProvidedEntityEditionProvenance},
        property::{
            PropertyObject, PropertyObjectWithMetadata, PropertyPatchOperation,
            PropertyPathElement, PropertyValueWithMetadata, PropertyWithMetadata,
        },
        value::{ValueMetadata, metadata::ValueProvenance},
    },
    ontology::id::{BaseUrl, OntologyTypeVersion, VersionedUrl},
    principal::{
        actor::{ActorEntityUuid, ActorType},
        actor_group::WebId,
    },
    provenance::{OriginProvenance, OriginType},
};

use crate::{DatabaseApi, DatabaseTestWrapper};

/// Replaces the `name` property of `entity_id`, acting as `actor`.
async fn update_name(
    api: &mut DatabaseApi<'_>,
    entity_id: EntityId,
    actor: ActorEntityUuid,
    actor_type: ActorType,
    name: &BaseUrl,
    value: &str,
) -> Result<Entity, Report<UpdateError>> {
    api.patch_entity(
        actor,
        PatchEntityParams {
            entity_id,
            decision_time: None,
            entity_type_ids: HashSet::new(),
            properties: vec![PropertyPatchOperation::Replace {
                path: once(PropertyPathElement::from(name.clone())).collect(),
                property: PropertyWithMetadata::Value(PropertyValueWithMetadata {
                    value: PropertyValue::String(value.to_owned()),
                    metadata: ValueMetadata {
                        confidence: None,
                        data_type_id: None,
                        original_data_type_id: None,
                        provenance: ValueProvenance::default(),
                        canonical: HashMap::default(),
                    },
                }),
            }],
            draft: None,
            archived: None,
            confidence: None,
            provenance: ProvidedEntityEditionProvenance {
                actor_type,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
        },
    )
    .await
}

/// Read-only entities (e.g. seeded by a one-way integration) may only be modified by machine
/// actors.
///
/// User and AI actors are forbidden, while writable entities stay editable by all three.
#[expect(clippy::too_many_lines)]
#[tokio::test]
async fn read_only_modification_matrix() {
    let person: PropertyObject =
        serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity");

    let mut database = DatabaseTestWrapper::new().await;
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

    let user = api.account_id;
    let web_id = WebId::new(user);
    let person_type = VersionedUrl {
        base_url: BaseUrl::new(
            "https://blockprotocol.org/@alice/types/entity-type/person/".to_owned(),
        )
        .expect("couldn't construct Base URL"),
        version: OntologyTypeVersion {
            major: 1,
            pre_release: None,
        },
    };
    let name =
        BaseUrl::new("https://blockprotocol.org/@alice/types/property-type/name/".to_owned())
            .expect("couldn't construct Base URL");

    // All three actors administer the web, so each holds `UpdateEntity`. The read-only forbid is
    // then the only thing that differs between them.
    let machine = ActorEntityUuid::from(api.create_machine("test-machine").await);
    let ai = ActorEntityUuid::from(api.create_ai("test-ai").await);
    api.assign_web_administrator(machine, web_id).await;
    api.assign_web_administrator(ai, web_id).await;

    let read_only_entity = api
        .create_entity(
            user,
            CreateEntityParams {
                web_id,
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_type.clone()]),
                properties: PropertyObjectWithMetadata::from_parts(person.clone(), None)
                    .expect("could not create property with metadata object"),
                confidence: None,
                link_data: None,
                draft: false,
                policies: Vec::new(),
                provenance: ProvidedEntityEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
                read_only: true,
            },
        )
        .await
        .expect("could not create read-only entity")
        .metadata
        .record_id
        .entity_id;

    let writable_entity = api
        .create_entity(
            user,
            CreateEntityParams {
                web_id,
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_type]),
                properties: PropertyObjectWithMetadata::from_parts(person, None)
                    .expect("could not create property with metadata object"),
                confidence: None,
                link_data: None,
                draft: false,
                policies: Vec::new(),
                provenance: ProvidedEntityEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
                read_only: false,
            },
        )
        .await
        .expect("could not create writable entity")
        .metadata
        .record_id
        .entity_id;

    // Writable entities are editable by every actor type.
    for (label, actor, actor_type) in [
        ("user", user, ActorType::User),
        ("machine", machine, ActorType::Machine),
        ("ai", ai, ActorType::Ai),
    ] {
        update_name(&mut api, writable_entity, actor, actor_type, &name, label)
            .await
            .unwrap_or_else(|error| {
                panic!("{label} actor should modify a writable entity: {error}")
            });
    }

    // Read-only entities may only be modified by machine actors. The user and AI actors updated
    // the writable entity above, so they hold `UpdateEntity`; the only difference here is the
    // `read_only` flag, so a failure can only come from the read-only forbid.
    update_name(
        &mut api,
        read_only_entity,
        machine,
        ActorType::Machine,
        &name,
        "machine",
    )
    .await
    .expect("machine actors should modify read-only entities");
    for (label, actor, actor_type) in [("user", user, ActorType::User), ("ai", ai, ActorType::Ai)] {
        let error = update_name(&mut api, read_only_entity, actor, actor_type, &name, label)
            .await
            .expect_err(&format!("{label} actor must not modify a read-only entity"));
        assert_eq!(
            error.request_ref::<StatusCode>().next(),
            Some(&StatusCode::PermissionDenied)
        );
    }
}

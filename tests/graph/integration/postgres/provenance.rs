use core::{iter::once, str::FromStr as _};
use std::collections::{HashMap, HashSet};

use error_stack::Report;
use hash_codec::numeric::Real;
use hash_graph_store::{
    entity::{CreateEntityParams, EntityStore as _, EntityValidationReport, PatchEntityParams},
    error::EntityCreationError,
};
use hash_graph_test_data::{data_type, entity, entity_type, property_type};
use pretty_assertions::assert_eq;
use type_system::{
    knowledge::{
        PropertyValue,
        entity::{
            EntityId, Link, LinkEndpoint,
            id::{DraftId, EntityUuid},
            provenance::ProvidedEntityEditionProvenance,
        },
        property::{
            PropertyObject, PropertyObjectWithMetadata, PropertyPatchOperation, PropertyPath,
            PropertyPathElement, PropertyValueWithMetadata, PropertyWithMetadata,
            metadata::PropertyProvenance,
        },
        value::{ValueMetadata, metadata::ValueProvenance},
    },
    ontology::{BaseUrl, VersionedUrl},
    principal::{actor::ActorType, actor_group::WebId},
    provenance::{
        OriginProvenance, OriginType, SourceProvenance, SourceType,
        validation::{
            MAX_SOURCES, ProvenanceField, ProvenanceOwner, ProvenanceRule, ProvenanceViolation,
            SourceField,
        },
    },
};
use uuid::Uuid;

use crate::{DatabaseApi, DatabaseTestWrapper};

async fn seed(database: &mut DatabaseTestWrapper) -> DatabaseApi<'_> {
    database
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
                entity_type::PERSON_V1,
                entity_type::ORGANIZATION_V1,
                entity_type::LINK_V1,
                entity_type::link::FRIEND_OF_V1,
                entity_type::link::ACQUAINTANCE_OF_V1,
            ],
        )
        .await
        .expect("should seed the database")
}

fn person_entity_type_id() -> VersionedUrl {
    VersionedUrl::from_str("https://blockprotocol.org/@alice/types/entity-type/person/v/1")
        .expect("should be an entity type ID")
}

fn friend_of_entity_type_id() -> VersionedUrl {
    VersionedUrl::from_str("https://blockprotocol.org/@alice/types/entity-type/friend-of/v/1")
        .expect("should be an entity type ID")
}

fn age_property_type_id() -> BaseUrl {
    BaseUrl::new("https://blockprotocol.org/@alice/types/property-type/age/".to_owned())
        .expect("should be a base URL")
}

fn provenance(sources: Vec<SourceProvenance>) -> ProvidedEntityEditionProvenance {
    ProvidedEntityEditionProvenance {
        actor_type: ActorType::User,
        origin: OriginProvenance::from_empty_type(OriginType::Api),
        sources,
    }
}

fn webpage() -> SourceProvenance {
    SourceProvenance {
        ty: SourceType::Webpage,
        entity_id: None,
        authors: Vec::new(),
        location: None,
        first_published: None,
        last_updated: None,
        loaded_at: None,
    }
}

/// A source that names a draft of an entity in the web of `api`.
fn draft_source(api: &DatabaseApi<'_>) -> SourceProvenance {
    SourceProvenance {
        entity_id: Some(EntityId {
            web_id: WebId::new(api.account_id),
            entity_uuid: EntityUuid::new(Uuid::new_v4()),
            draft_id: Some(DraftId::new(Uuid::new_v4())),
        }),
        ..webpage()
    }
}

fn person_params(api: &DatabaseApi<'_>, sources: Vec<SourceProvenance>) -> CreateEntityParams {
    let alice: PropertyObject = serde_json::from_str(entity::PERSON_ALICE_V1)
        .expect("should be the properties of a person");
    CreateEntityParams {
        web_id: WebId::new(api.account_id),
        entity_uuid: None,
        decision_time: None,
        entity_type_ids: HashSet::from([person_entity_type_id()]),
        properties: PropertyObjectWithMetadata::from_parts(alice, None)
            .expect("should construct person properties"),
        confidence: None,
        link_data: None,
        draft: false,
        policies: Vec::new(),
        provenance: provenance(sources),
        read_only: false,
    }
}

/// The provenance violations of a failed creation, by the index of the entity.
fn creation_violations(error: &Report<EntityCreationError>) -> &[(usize, ProvenanceViolation)] {
    let EntityCreationError::InvalidProvenance { violations } = error.current_context() else {
        panic!("the creation should fail on the provenance, but failed with: {error:?}");
    };
    violations
}

/// The provenance violations attached to a failed write, by the index of the entity.
fn violations(
    reports: &HashMap<usize, EntityValidationReport>,
) -> Vec<(usize, &ProvenanceViolation)> {
    let mut violations = reports
        .iter()
        .flat_map(|(index, report)| {
            report
                .metadata
                .provenance
                .iter()
                .map(move |violation| (*index, violation))
        })
        .collect::<Vec<_>>();
    violations.sort_by_key(|(index, _)| *index);
    violations
}

#[tokio::test]
async fn create_too_many_sources() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let valid = person_params(&api, vec![webpage(); MAX_SOURCES]);
    let too_many = person_params(&api, vec![webpage(); MAX_SOURCES + 1]);
    let error = api
        .create_entities(api.account_id, vec![valid, too_many])
        .await
        .expect_err("should reject an edition with too many sources");

    let violation = ProvenanceViolation {
        owner: ProvenanceOwner::Edition,
        field: ProvenanceField::Sources,
        rule: ProvenanceRule::TooManyEntries {
            count: MAX_SOURCES + 1,
            max: MAX_SOURCES,
        },
    };
    assert_eq!(
        creation_violations(&error),
        [(1, violation.clone())],
        "only the second entity should break a rule"
    );
    let reports = error
        .downcast_ref::<HashMap<usize, EntityValidationReport>>()
        .expect("should attach indexed validation reports");
    assert_eq!(
        violations(reports),
        [(1, &violation)],
        "the reports should list the same rule"
    );
}

#[tokio::test]
async fn create_year_out_of_range() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let source = serde_json::from_value::<SourceProvenance>(serde_json::json!({
        "type": "webpage",
        "loadedAt": "-000001-12-31T00:00:00Z",
    }))
    .expect("should be a source");
    let error = api
        .create_entities(api.account_id, vec![person_params(&api, vec![source])])
        .await
        .expect_err("should reject a point in time before the year 0");

    assert_eq!(
        creation_violations(&error),
        [(
            0,
            ProvenanceViolation {
                owner: ProvenanceOwner::Edition,
                field: ProvenanceField::Source {
                    index: 0,
                    field: SourceField::LoadedAt,
                },
                rule: ProvenanceRule::YearOutOfRange { year: -1 },
            },
        )],
        "the source's point in time should break the rule"
    );
}

#[tokio::test]
async fn create_property_draft_source() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let mut params = person_params(&api, Vec::new());
    params.properties.metadata.provenance.sources = vec![draft_source(&api)];
    let error = api
        .create_entities(api.account_id, vec![params])
        .await
        .expect_err("should reject properties whose source names a draft");

    assert_eq!(
        creation_violations(&error),
        [(
            0,
            ProvenanceViolation {
                owner: ProvenanceOwner::Property {
                    path: PropertyPath::default(),
                },
                field: ProvenanceField::Source {
                    index: 0,
                    field: SourceField::EntityId,
                },
                rule: ProvenanceRule::DraftEntity,
            },
        )],
        "the violation should name the properties as a whole"
    );
}

/// Provenance with one webpage source by `author`.
fn authored(author: &str) -> PropertyProvenance {
    PropertyProvenance {
        sources: vec![SourceProvenance {
            authors: vec![author.to_owned()],
            ..webpage()
        }],
    }
}

#[tokio::test]
async fn create_link_endpoint_provenance() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;
    let alice = api
        .create_entity(api.account_id, person_params(&api, Vec::new()))
        .await
        .expect("should create a person");
    let bob = api
        .create_entity(api.account_id, person_params(&api, Vec::new()))
        .await
        .expect("should create a person");

    let link = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                entity_type_ids: HashSet::from([friend_of_entity_type_id()]),
                properties: PropertyObjectWithMetadata::from_parts(PropertyObject::empty(), None)
                    .expect("should construct link properties"),
                link_data: Some(Link::Directed {
                    source: LinkEndpoint {
                        entity_id: alice.metadata.record_id.entity_id,
                        confidence: None,
                        provenance: authored("left"),
                    },
                    target: LinkEndpoint {
                        entity_id: bob.metadata.record_id.entity_id,
                        confidence: None,
                        provenance: authored("right"),
                    },
                }),
                ..person_params(&api, Vec::new())
            },
        )
        .await
        .expect("should create a link");

    let stored = api
        .get_entity_by_id(
            Some(api.account_id),
            link.metadata.record_id.entity_id,
            None,
            None,
        )
        .await
        .expect("should read the link")
        .expect("should find the link");
    let Some(Link::Directed { source, target }) = stored.link_data else {
        panic!("should read back link data");
    };
    assert_eq!(
        (source.provenance, target.provenance),
        (authored("left"), authored("right")),
        "each end of the link should keep its own provenance"
    );
}

/// A patch that adds the age 30 to `entity_id`, with `edition_sources` as the provenance of the
/// edition and `sources` as that of the value.
fn add_age(
    entity_id: EntityId,
    edition_sources: Vec<SourceProvenance>,
    sources: Vec<SourceProvenance>,
) -> PatchEntityParams {
    PatchEntityParams {
        entity_id,
        decision_time: None,
        entity_type_ids: HashSet::new(),
        properties: vec![PropertyPatchOperation::Add {
            path: once(PropertyPathElement::from(age_property_type_id())).collect(),
            property: PropertyWithMetadata::Value(PropertyValueWithMetadata {
                value: PropertyValue::Number(Real::from(30)),
                metadata: ValueMetadata {
                    provenance: ValueProvenance { sources },
                    ..ValueMetadata::default()
                },
            }),
        }],
        draft: None,
        archived: None,
        confidence: None,
        provenance: provenance(edition_sources),
    }
}

#[tokio::test]
async fn patch_edition_and_property() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;
    let first = api
        .create_entity(api.account_id, person_params(&api, Vec::new()))
        .await
        .expect("should create a person");
    let second = api
        .create_entity(api.account_id, person_params(&api, Vec::new()))
        .await
        .expect("should create a person");

    let error = api
        .patch_entities(
            api.account_id,
            vec![
                add_age(first.metadata.record_id.entity_id, Vec::new(), Vec::new()),
                add_age(
                    second.metadata.record_id.entity_id,
                    vec![webpage(); MAX_SOURCES + 1],
                    vec![draft_source(&api)],
                ),
            ],
        )
        .await
        .expect_err("should reject the provenance of the second patch");

    let reports = error
        .downcast_ref::<HashMap<usize, EntityValidationReport>>()
        .expect("should attach indexed validation reports");
    assert_eq!(
        violations(reports),
        [
            (
                1,
                &ProvenanceViolation {
                    owner: ProvenanceOwner::Edition,
                    field: ProvenanceField::Sources,
                    rule: ProvenanceRule::TooManyEntries {
                        count: MAX_SOURCES + 1,
                        max: MAX_SOURCES,
                    },
                },
            ),
            (
                1,
                &ProvenanceViolation {
                    owner: ProvenanceOwner::Property {
                        path: once(PropertyPathElement::from(age_property_type_id()))
                            .collect::<PropertyPath<'static>>(),
                    },
                    field: ProvenanceField::Source {
                        index: 0,
                        field: SourceField::EntityId,
                    },
                    rule: ProvenanceRule::DraftEntity,
                },
            ),
        ],
        "the violations should name the second patch, its edition and the property it adds"
    );
}

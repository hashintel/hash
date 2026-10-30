//! `POST /`: create entities.

use alloc::{borrow::Cow, collections::BTreeSet};
use core::{error::Error, fmt};

use aide::transform::TransformOperation;
use axum::extract::State;
use error_stack::{Report, ResultExt as _};
use hash_codec::serde::non_null;
use hash_graph_store::{
    entity::{CreateEntityParams, EntityStore as _},
    error::EntityCreationError,
    pool::StorePool,
};
use hash_middleware::problem::{InternalServerError, ServiceUnavailable};
use http::{HeaderMap, StatusCode};
use problematic::{Answer, Expose, Problem, ProblemType, ProblemVariant, Rejection, Variant};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use type_system::{
    knowledge::{
        self,
        property::{PropertyObject, PropertyObjectWithMetadata},
    },
    ontology::VersionedUrl,
    principal::{
        actor::{ActorId, ActorType},
        actor_group::WebId,
    },
    provenance::validation::{
        MAX_SOURCES, ProvenanceField, ProvenanceOwner, ProvenanceRule, ProvenanceViolation,
    },
};

use super::{
    entity::{Entity, LiveEntityId},
    link::Link,
    property_metadata::{PropertyMetadataMismatch, PropertyObjectMetadata},
    provenance::{self, NewProvenance},
};
use crate::rest::{
    ApiState,
    credentials::Actor,
    extract::Json,
    public::Credentials,
    routing::{self, Route},
};

/// The entities to create.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateEntitiesRequest {
    /// The entities to create, in one transaction, at least one.
    entities: NewEntities,
}

/// The entities to create, at least one.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(try_from = "Vec<NewEntity>")]
#[schemars(inline, extend("minItems" = 1))]
struct NewEntities(Vec<NewEntity>);

/// The request names no entity.
#[derive(Debug, derive_more::Display)]
#[display("a request has to name at least one entity")]
struct NoEntity;

impl TryFrom<Vec<NewEntity>> for NewEntities {
    type Error = NoEntity;

    fn try_from(entities: Vec<NewEntity>) -> Result<Self, Self::Error> {
        if entities.is_empty() {
            return Err(NoEntity);
        }
        Ok(Self(entities))
    }
}

/// An entity to create.
#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(example = new_entity_example())]
struct NewEntityFields {
    /// The web to create the entity in.
    web_id: WebId,
    /// The entity types the entity is an instance of, at least one.
    entity_type_ids: EntityTypeIds,
    /// The entity's properties, keyed by the base URL of their property type.
    properties: PropertyObject,
    /// The data type of every value in `properties`, and where the value comes from.
    property_metadata: PropertyObjectMetadata,
    /// The entities it connects, for an entity of a link type.
    #[serde(
        default,
        deserialize_with = "non_null",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Link")]
    link: Option<Link>,
    /// Where the entity's data comes from, and which application sends it.
    #[serde(
        default,
        deserialize_with = "non_null",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "NewProvenance")]
    provenance: Option<NewProvenance>,
}

/// An example of an entity to create, with the fields every entity needs and nothing else.
fn new_entity_example() -> serde_json::Value {
    serde_json::json!({
        "webId": "8d86c8c3-d66d-43d1-859b-676c3bcaeadc",
        "entityTypeIds": ["https://hash.ai/@h/types/entity-type/user/v/1"],
        "properties": {
            "https://hash.ai/@h/types/property-type/preferred-name/": "Alice",
            "https://hash.ai/@h/types/property-type/shortname/": "alice",
        },
        "propertyMetadata": {
            "https://hash.ai/@h/types/property-type/preferred-name/": {
                "dataTypeId": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
            "https://hash.ai/@h/types/property-type/shortname/": {
                "dataTypeId": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
        },
    })
}

/// An entity to create.
///
/// Deserializing it checks that the property metadata fits the properties.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(try_from = "NewEntityFields")]
#[schemars(with = "NewEntityFields", description = "An entity to create.")]
struct NewEntity {
    web_id: WebId,
    entity_type_ids: EntityTypeIds,
    properties_with_metadata: PropertyObjectWithMetadata,
    link: Option<Link>,
    provenance: NewProvenance,
}

impl NewEntity {
    /// The parameters the store creates the entity from.
    fn into_params(self, actor_type: ActorType, user_agent: Option<String>) -> CreateEntityParams {
        CreateEntityParams {
            web_id: self.web_id,
            entity_uuid: None,
            decision_time: None,
            entity_type_ids: self.entity_type_ids.0.into_iter().collect(),
            properties: self.properties_with_metadata,
            confidence: None,
            link_data: self.link.map(knowledge::entity::Link::from),
            draft: false,
            policies: Vec::new(),
            provenance: self.provenance.into_stored(actor_type, user_agent),
            read_only: false,
        }
    }
}

impl TryFrom<NewEntityFields> for NewEntity {
    type Error = PropertyMetadataMismatch;

    fn try_from(fields: NewEntityFields) -> Result<Self, Self::Error> {
        Ok(Self {
            web_id: fields.web_id,
            entity_type_ids: fields.entity_type_ids,
            properties_with_metadata: fields.property_metadata.join(fields.properties)?,
            link: fields.link,
            provenance: fields.provenance.unwrap_or_default(),
        })
    }
}

/// The entity types of an entity to create, at least one.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(try_from = "BTreeSet<VersionedUrl>")]
#[schemars(inline, extend("minItems" = 1))]
struct EntityTypeIds(BTreeSet<VersionedUrl>);

/// The entity names no entity type.
#[derive(Debug, derive_more::Display)]
#[display("an entity has to name at least one entity type")]
struct NoEntityType;

impl TryFrom<BTreeSet<VersionedUrl>> for EntityTypeIds {
    type Error = NoEntityType;

    fn try_from(entity_type_ids: BTreeSet<VersionedUrl>) -> Result<Self, Self::Error> {
        if entity_type_ids.is_empty() {
            return Err(NoEntityType);
        }
        Ok(Self(entity_type_ids))
    }
}

/// The created entities.
#[derive(Serialize, JsonSchema)]
struct CreateEntitiesResponse {
    /// The created entities, in the order of the request.
    entities: Vec<Entity>,
}

/// The caller may not create an entity or instantiate an entity type or a type it inherits from.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("The caller may not create the entities.")]
struct EntityCreationForbidden;

impl ProblemVariant for EntityCreationForbidden {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Forbidden"),
        status: StatusCode::FORBIDDEN,
    };

    fn example() -> Option<Self> {
        Some(Self)
    }
}

/// One or more entity types do not exist.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("One or more entity types do not exist.")]
struct UnknownEntityTypes;

impl ProblemVariant for UnknownEntityTypes {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Unprocessable Content"),
        status: StatusCode::UNPROCESSABLE_ENTITY,
    };

    fn example() -> Option<Self> {
        Some(Self)
    }
}

/// One or more entity types are archived.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("One or more entity types are archived.")]
struct ArchivedEntityTypes;

impl ProblemVariant for ArchivedEntityTypes {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Unprocessable Content"),
        status: StatusCode::UNPROCESSABLE_ENTITY,
    };

    fn example() -> Option<Self> {
        Some(Self)
    }
}

/// The entity types of an entity define a property differently.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("The entity types of an entity define a property differently.")]
struct IncompatibleEntityTypes;

impl ProblemVariant for IncompatibleEntityTypes {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Unprocessable Content"),
        status: StatusCode::UNPROCESSABLE_ENTITY,
    };

    fn example() -> Option<Self> {
        Some(Self)
    }
}

/// One or more entities do not match their entity types, or link to an entity that does not exist.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display(
    "One or more entities do not match their entity types, or link to an entity that does not \
     exist."
)]
struct InvalidEntities;

impl ProblemVariant for InvalidEntities {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Unprocessable Content"),
        status: StatusCode::UNPROCESSABLE_ENTITY,
    };

    fn example() -> Option<Self> {
        Some(Self)
    }
}

/// The most broken rules the detail of [`InvalidProvenance`] lists.
const LISTED_VIOLATIONS: usize = 10;

/// The provenance of one or more entities breaks a rule.
#[derive(Serialize, JsonSchema)]
struct InvalidProvenance {
    #[serde(skip)]
    violations: Vec<(usize, ProvenanceViolation)>,
}

impl fmt::Display for InvalidProvenance {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("The provenance breaks a rule:")?;
        for (position, (index, violation)) in
            self.violations.iter().take(LISTED_VIOLATIONS).enumerate()
        {
            let separator = if position == 0 { " " } else { "; " };
            write!(fmt, "{separator}entities[{index}]: {violation}")?;
        }
        if let Some(unlisted) = self.violations.len().checked_sub(LISTED_VIOLATIONS)
            && unlisted > 0
        {
            write!(fmt, "; and {unlisted} more")?;
        }
        fmt.write_str(".")
    }
}

impl ProblemVariant for InvalidProvenance {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Unprocessable Content"),
        status: StatusCode::UNPROCESSABLE_ENTITY,
    };

    fn example() -> Option<Self> {
        Some(Self {
            violations: vec![(
                0,
                ProvenanceViolation {
                    owner: ProvenanceOwner::Edition,
                    field: ProvenanceField::Sources,
                    rule: ProvenanceRule::TooManyEntries {
                        count: MAX_SOURCES + 1,
                        max: MAX_SOURCES,
                    },
                },
            )],
        })
    }
}

/// The ways [`create_entities`] refuses a request its extractors accept.
struct CreateEntitiesProblem;

impl Problem for CreateEntitiesProblem {
    const VARIANTS: &'static [Variant] = &[
        Variant::of::<EntityCreationForbidden>(),
        Variant::of::<UnknownEntityTypes>(),
        Variant::of::<ArchivedEntityTypes>(),
        Variant::of::<IncompatibleEntityTypes>(),
        Variant::of::<InvalidProvenance>(),
        Variant::of::<InvalidEntities>(),
        Variant::of::<ServiceUnavailable>(),
        Variant::of::<InternalServerError>(),
    ];
}

impl Expose<CreateEntitiesProblem> for Report<EntityCreationError> {
    fn expose(&self) -> Answer<'_, CreateEntitiesProblem> {
        match self.current_context() {
            EntityCreationError::InstantiationForbidden { .. }
            | EntityCreationError::CreationForbidden { .. } => Answer::new(EntityCreationForbidden),
            EntityCreationError::UnknownEntityTypes { .. } => Answer::new(UnknownEntityTypes),
            EntityCreationError::ArchivedEntityTypes { .. } => Answer::new(ArchivedEntityTypes),
            EntityCreationError::IncompatibleEntityTypes { .. } => {
                Answer::new(IncompatibleEntityTypes)
            }
            EntityCreationError::InvalidProvenance { violations } => {
                Answer::new(InvalidProvenance {
                    violations: violations.clone(),
                })
            }
            EntityCreationError::InvalidEntities => Answer::new(InvalidEntities),
            EntityCreationError::Store => Answer::new(InternalServerError),
        }
    }
}

#[derive(Debug, derive_more::Display)]
enum CreateEntitiesError {
    #[display("no store could be acquired")]
    Unavailable,
    #[display("the store returned a draft")]
    Draft,
}

impl Error for CreateEntitiesError {}

impl Expose<CreateEntitiesProblem> for Report<CreateEntitiesError> {
    fn expose(&self) -> Answer<'_, CreateEntitiesProblem> {
        match self.current_context() {
            CreateEntitiesError::Unavailable => Answer::new(ServiceUnavailable),
            CreateEntitiesError::Draft => Answer::new(InternalServerError),
        }
    }
}

async fn create_entities<S>(
    State(state): State<ApiState<S>>,
    actor: Actor<Credentials>,
    headers: HeaderMap,
    Json(CreateEntitiesRequest {
        entities: NewEntities(entities),
    }): Json<CreateEntitiesRequest>,
) -> Result<Json<CreateEntitiesResponse, 201>, Rejection<CreateEntitiesProblem>>
where
    S: StorePool + Send + Sync + 'static,
{
    let actor_id = ActorId::from(actor);
    let user_agent = provenance::user_agent(&headers);
    let params = entities
        .into_iter()
        .map(|entity| entity.into_params(actor_id.actor_type(), user_agent.clone()))
        .collect::<Vec<_>>();

    let mut store = state
        .acquire()
        .await
        .change_context(CreateEntitiesError::Unavailable)?;
    let created = store.create_entities(actor_id, params).await?;

    let entities = created
        .into_iter()
        .map(|entity| {
            let entity_id = LiveEntityId::try_from(entity.metadata.record_id.entity_id)
                .map_err(|error| Report::new(error).change_context(CreateEntitiesError::Draft))?;
            Ok(Entity::new(entity_id, entity))
        })
        .collect::<Result<Vec<_>, Report<CreateEntitiesError>>>()?;

    Ok(Json(CreateEntitiesResponse { entities }))
}

fn document_create_entities(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .id("createEntities")
        .summary("Create entities")
        .description(
            "Creates the entities in one transaction: either all of them are created or none. \
             Returns them in the order of the request.",
        )
}

pub(super) fn route<S>() -> Route<ApiState<S>>
where
    S: StorePool + Send + Sync + 'static,
{
    routing::post(create_entities::<S>, document_create_entities)
}

#[cfg(test)]
mod tests {
    use core::assert_matches;

    use error_stack::Report;
    use hash_graph_store::error::EntityCreationError;
    use problematic::Expose as _;
    use serde_json::json;
    use type_system::provenance::validation::{
        MAX_SHORT_TEXT_LENGTH, ProvenanceField, ProvenanceOwner, ProvenanceRule,
        ProvenanceViolation, SourceField,
    };

    use super::{
        CreateEntitiesRequest, InvalidProvenance, NewEntities, NewEntity, new_entity_example,
    };

    const WEB: &str = "8d86c8c3-d66d-43d1-859b-676c3bcaeadc";
    const PERSON: &str = "https://example.com/@alice/types/entity-type/person/v/1";
    const NAME: &str = "https://example.com/@alice/types/property-type/name/";
    const FRIEND: &str = "https://example.com/@alice/types/entity-type/friend-of/v/1";
    const ALICE: &str = "8d86c8c3-d66d-43d1-859b-676c3bcaeadc~be2c5b2f-e3e1-4f26-a0c4-0f8b5e9c4a1d";
    const BOB: &str = "8d86c8c3-d66d-43d1-859b-676c3bcaeadc~1f3b8a4e-6c2d-4e5f-9a7b-3c1d2e4f5a6b";

    fn parse(request: serde_json::Value) -> Result<CreateEntitiesRequest, serde_json::Error> {
        serde_json::from_value(request)
    }

    #[test]
    fn provenance_detail() {
        let error = Report::new(EntityCreationError::InvalidProvenance {
            violations: vec![(
                1,
                ProvenanceViolation {
                    owner: ProvenanceOwner::Edition,
                    field: ProvenanceField::Source {
                        index: 0,
                        field: SourceField::LocationUri,
                    },
                    rule: ProvenanceRule::UriScheme {
                        scheme: "ftp".to_owned(),
                    },
                },
            )],
        });

        let details = serde_json::to_value(error.expose().details())
            .expect("the problem details should serialize");
        assert_eq!(details["status"], 422, "the answer should be 422");
        assert_eq!(
            details["detail"],
            "The provenance breaks a rule: entities[1]: `sources[0].location.uri` in the \
             provenance of the edition has the scheme `ftp`, but only `http` and `https` are \
             allowed.",
            "the detail should name the entity, the field and the rule"
        );
    }

    #[test]
    fn provenance_detail_cut() {
        let violations = (0..12)
            .map(|author| {
                (
                    0,
                    ProvenanceViolation {
                        owner: ProvenanceOwner::Edition,
                        field: ProvenanceField::Source {
                            index: 0,
                            field: SourceField::Author(author),
                        },
                        rule: ProvenanceRule::TooLong {
                            length: 256,
                            max: MAX_SHORT_TEXT_LENGTH,
                        },
                    },
                )
            })
            .collect();
        let detail = InvalidProvenance { violations }.to_string();
        assert_eq!(
            detail.matches("entities[0]: ").count(),
            10,
            "the detail should list the first ten violations"
        );
        assert!(
            detail.ends_with("are allowed; and 2 more."),
            "the detail should count the violations it leaves out, but was: {detail}"
        );
    }

    #[test]
    fn request_no_entities() {
        assert_matches!(
            parse(json!({ "entities": [] })),
            Err(error) if error.to_string().contains("at least one entity")
        );
    }

    #[test]
    fn request_no_entity_type() {
        assert_matches!(
            parse(json!({ "entities": [{
                "webId": WEB,
                "entityTypeIds": [],
                "properties": {},
                "propertyMetadata": {},
            }] })),
            Err(error) if error.to_string().contains("at least one entity type")
        );
    }

    #[test]
    fn request_metadata_mismatch() {
        assert_matches!(
            parse(json!({ "entities": [{
                "webId": WEB,
                "entityTypeIds": [PERSON],
                "properties": { NAME: "Alice" },
                "propertyMetadata": {},
            }] })),
            Err(error) if error.to_string().contains(&format!("has no entry for `[\"{NAME}\"]`"))
        );
    }

    #[test]
    fn request_link() {
        let request = parse(json!({ "entities": [{
            "webId": WEB,
            "entityTypeIds": [FRIEND],
            "properties": {},
            "propertyMetadata": {},
            "link": {
                "kind": "directed",
                "source": { "entityId": ALICE },
                "target": { "entityId": BOB },
            },
        }] }))
        .expect("the request should parse");

        let CreateEntitiesRequest {
            entities: NewEntities(entities),
        } = request;
        assert_matches!(
            entities.as_slice(),
            [entity] if entity.link.is_some(),
            "the entity should keep its link"
        );
    }

    #[test]
    fn new_entity_example_valid() {
        serde_json::from_value::<NewEntity>(new_entity_example())
            .expect("the documented example should be a valid entity to create");
    }

    #[test]
    fn request_provenance_null() {
        assert_matches!(
            parse(json!({ "entities": [{
                "webId": WEB,
                "entityTypeIds": [PERSON],
                "properties": {},
                "propertyMetadata": {},
                "provenance": null,
            }] })),
            Err(error) if error.to_string().contains("invalid type: null")
        );
    }

    #[test]
    fn request_link_null() {
        assert_matches!(
            parse(json!({ "entities": [{
                "webId": WEB,
                "entityTypeIds": [PERSON],
                "properties": {},
                "propertyMetadata": {},
                "link": null,
            }] })),
            Err(error) if error.to_string().contains("expected internally tagged enum Link")
        );
    }
}

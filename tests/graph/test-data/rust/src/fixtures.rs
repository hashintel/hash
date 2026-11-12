//! Fixture setup on the caller's store or transaction.

use std::collections::HashMap;

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::store::{PolicyStore, PrincipalStore};
use hash_graph_store::{
    account::{AccountStore, CreateUserActorParams, CreateUserActorResponse},
    data_type::{CreateDataTypeParams, DataTypeStore},
    entity_type::{CreateEntityTypeParams, EntityTypeStore},
    error::InsertionError,
    property_type::{CreatePropertyTypeParams, PropertyTypeStore},
    query::ConflictBehavior,
};
use serde::Deserialize;
use type_system::{
    ontology::{
        data_type::DataType,
        entity_type::EntityType,
        property_type::PropertyType,
        provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
    },
    principal::{actor::ActorId, actor_group::WebId},
    provenance::{OriginProvenance, OriginType},
};

/// Schemas inserted in dependency order by [`seed_ontology`].
#[derive(Debug, Deserialize)]
pub struct OntologyFixture {
    #[serde(rename = "dataTypes")]
    pub data: Vec<DataType>,
    #[serde(rename = "propertyTypes")]
    pub properties: Vec<PropertyType>,
    #[serde(rename = "entityTypes")]
    pub entities: Vec<EntityType>,
}

/// Seeds policies and creates a registered user with its web and machine.
///
/// # Errors
///
/// Returns [`InsertionError`] if policy setup or account creation fails.
pub async fn seed_account(
    store: &mut (impl PolicyStore + PrincipalStore + AccountStore),
    shortname: Option<String>,
) -> Result<CreateUserActorResponse, Report<InsertionError>> {
    store
        .seed_system_policies()
        .await
        .change_context(InsertionError)?;
    let system = store
        .get_or_create_system_machine("h")
        .await
        .change_context(InsertionError)?;
    store
        .create_user_actor(
            system.into(),
            CreateUserActorParams {
                user_id: None,
                shortname,
                registration_complete: true,
            },
        )
        .await
        .change_context(InsertionError)
}

/// Inserts locally owned schemas, skipping types that already exist.
///
/// # Errors
///
/// Returns [`InsertionError`] if any schema cannot be inserted.
pub async fn seed_ontology(
    store: &mut (impl DataTypeStore + PropertyTypeStore + EntityTypeStore),
    actor: ActorId,
    web_id: WebId,
    ontology: OntologyFixture,
) -> Result<(), Report<InsertionError>> {
    let provenance = ProvidedOntologyEditionProvenance {
        actor_type: actor.actor_type(),
        origin: OriginProvenance::from_empty_type(OriginType::Api),
        sources: Vec::new(),
    };
    store
        .create_data_types(
            actor,
            ontology
                .data
                .into_iter()
                .map(|schema| CreateDataTypeParams {
                    schema,
                    ownership: OntologyOwnership::Local { web_id },
                    conflict_behavior: ConflictBehavior::Skip,
                    provenance: provenance.clone(),
                    conversions: HashMap::new(),
                }),
        )
        .await?;
    store
        .create_property_types(
            actor,
            ontology
                .properties
                .into_iter()
                .map(|schema| CreatePropertyTypeParams {
                    schema,
                    ownership: OntologyOwnership::Local { web_id },
                    conflict_behavior: ConflictBehavior::Skip,
                    provenance: provenance.clone(),
                }),
        )
        .await?;
    store
        .create_entity_types(
            actor,
            ontology
                .entities
                .into_iter()
                .map(|schema| CreateEntityTypeParams {
                    schema,
                    ownership: OntologyOwnership::Local { web_id },
                    conflict_behavior: ConflictBehavior::Skip,
                    provenance: provenance.clone(),
                    fetched_from_origin: false,
                }),
        )
        .await?;
    Ok(())
}

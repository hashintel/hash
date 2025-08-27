use core::error::Error;
use std::collections::HashSet;

use error_stack::{Report, ResultExt as _, TryReportTupleExt as _};
use hash_graph_store::entity::CreateEntityParams;
use rand::distr::Distribution as _;
use type_system::{
    self,
    knowledge::{
        entity::{id::EntityUuid, provenance::ProvidedEntityEditionProvenance},
        property::PropertyObjectWithMetadata,
    },
};

use super::{
    Producer,
    entity_type::EntityTypeCatalog,
    ontology::{
        WebCatalog,
        domain::{LocalChoiceSampler, LocalSourceConfig},
    },
};
use crate::seeding::{
    context::{LocalId, ProduceContext, ProducerId, Scope, SubScope},
    distributions::{
        DistributionConfig as _,
        adaptors::{ConstDistribution, ConstDistributionConfig},
        property::EntityObjectDistributionRegistry,
    },
};

#[derive(Debug, derive_more::Display)]
#[display("Invalid {_variant} distribution")]
pub enum EntityProducerConfigError {
    #[display("web")]
    Web,

    #[display("provenance")]
    Provenance,
}

impl Error for EntityProducerConfigError {}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EntityProducerConfig {
    pub metadata: MetadataSection,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MetadataSection {
    pub web: LocalSourceConfig,
    pub provenance: ConstDistributionConfig<ProvidedEntityEditionProvenance>,
}

impl EntityProducerConfig {
    /// Create an entity type producer from the configuration.
    ///
    /// # Errors
    ///
    /// Returns an error if the producer cannot be created.
    pub fn create_producer<
        U: WebCatalog,
        O: WebCatalog,
        E: EntityTypeCatalog,
        D: EntityObjectDistributionRegistry,
    >(
        &self,
        deps: EntityProducerDeps<U, O, E, D>,
    ) -> Result<EntityProducer<U, O, E, D>, Report<[EntityProducerConfigError]>> {
        let web = self
            .metadata
            .web
            .bind(deps.user_catalog, deps.org_catalog)
            .change_context(EntityProducerConfigError::Web);
        let provenance = self
            .metadata
            .provenance
            .create_distribution()
            .change_context(EntityProducerConfigError::Provenance);

        let (web, provenance) = (web, provenance).try_collect()?;

        Ok(EntityProducer {
            local_id: LocalId::default(),
            web,
            entity_type: deps.entity_type_catalog,
            object: deps.entity_object_registry,
            provenance,
        })
    }
}

/// Dependencies required to create an [`EntityProducer`].
#[derive(Debug, Copy, Clone)]
pub struct EntityProducerDeps<
    U: WebCatalog,
    O: WebCatalog,
    E: EntityTypeCatalog,
    D: EntityObjectDistributionRegistry,
> {
    pub user_catalog: Option<U>,
    pub org_catalog: Option<O>,
    pub entity_type_catalog: E,
    pub entity_object_registry: D,
}

#[derive(Debug)]
pub struct EntityProducer<
    U: WebCatalog,
    O: WebCatalog,
    E: EntityTypeCatalog,
    D: EntityObjectDistributionRegistry,
> {
    local_id: LocalId,
    web: LocalChoiceSampler<U, O>,
    entity_type: E,
    object: D,
    provenance: ConstDistribution<ProvidedEntityEditionProvenance>,
}

#[derive(Debug, derive_more::Display)]
pub enum EntityProducerError {
    #[display("Missing object distribution")]
    MissingObjectDistribution,
    #[display("Could not sample entity object distribution")]
    Object,
}

impl Error for EntityProducerError {}

impl<U: WebCatalog, O: WebCatalog, E: EntityTypeCatalog, D: EntityObjectDistributionRegistry>
    Producer<CreateEntityParams> for EntityProducer<U, O, E, D>
{
    type Error = Report<EntityProducerError>;

    const ID: ProducerId = ProducerId::Entity;

    fn generate(&mut self, context: ProduceContext) -> Result<CreateEntityParams, Self::Error> {
        let local_id = self.local_id.take_and_advance();

        let entity_gid = context.global_id(local_id, Scope::Id, SubScope::Unknown);
        let object_gid = context.global_id(local_id, Scope::Object, SubScope::Property);
        let web_gid = context.global_id(local_id, Scope::Metadata, SubScope::Web);
        let type_gid = context.global_id(local_id, Scope::Metadata, SubScope::Type);
        let provenance_gid = context.global_id(local_id, Scope::Metadata, SubScope::Provenance);

        let (_, _, web) = self.web.sample(&mut web_gid.rng());
        let entity_type_url = self.entity_type.sample_entity_type(&mut type_gid.rng());
        let entity_object_distribution = self
            .object
            .get_distribution(entity_type_url)
            .ok_or(EntityProducerError::MissingObjectDistribution)?;

        let properties = entity_object_distribution
            .sample(&mut object_gid.rng())
            .change_context(EntityProducerError::Object)?;

        Ok(CreateEntityParams {
            web_id: web,
            entity_uuid: Some(EntityUuid::new(entity_gid.encode())),
            decision_time: None,
            entity_type_ids: HashSet::from([entity_type_url.url.clone()]),
            properties: PropertyObjectWithMetadata::from_parts(properties, None)
                .change_context(EntityProducerError::Object)?,
            confidence: None,
            link_data: None,
            draft: false,
            policies: Vec::new(),
            provenance: self.provenance.sample(&mut provenance_gid.rng()),
        })
    }
}

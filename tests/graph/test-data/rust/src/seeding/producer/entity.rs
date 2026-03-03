use core::error::Error;
use std::collections::HashSet;

use error_stack::{Report, ResultExt as _, TryReportTupleExt as _};
use hash_graph_store::entity::CreateEntityParams;
use rand::{distr::Distribution as _, seq::IndexedRandom as _};
use type_system::{
    self,
    knowledge::{
        entity::{EntityId, LinkData, id::EntityUuid, provenance::ProvidedEntityEditionProvenance},
        property::metadata::PropertyProvenance,
    },
    ontology::VersionedUrl,
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
    #[expect(
        clippy::type_complexity,
        reason = "False positive. The type is not complex, there are just some generics"
    )]
    pub fn create_producer<
        U: WebCatalog,
        O: WebCatalog,
        ET: EntityTypeCatalog,
        D: EntityObjectDistributionRegistry,
        E: EntityCatalog,
    >(
        &self,
        deps: EntityProducerDeps<U, O, ET, D, E>,
    ) -> Result<EntityProducer<U, O, ET, D, E>, Report<[EntityProducerConfigError]>> {
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
            entity_object_registry: deps.entity_object_registry,
            source_link_type_catalog: deps.source_link_type_catalog,
            entity_catalog: deps.entity_catalog,
            provenance,
        })
    }
}

/// Dependencies required to create an [`EntityProducer`].
#[derive(Debug, Copy, Clone)]
pub struct EntityProducerDeps<
    U: WebCatalog,
    O: WebCatalog,
    ET: EntityTypeCatalog,
    D: EntityObjectDistributionRegistry,
    E: EntityCatalog,
> {
    pub user_catalog: Option<U>,
    pub org_catalog: Option<O>,
    pub entity_type_catalog: ET,
    pub source_link_type_catalog: Option<ET>,
    pub entity_object_registry: D,
    pub entity_catalog: Option<E>,
}

#[derive(Debug)]
pub struct EntityProducer<
    U: WebCatalog,
    O: WebCatalog,
    ET: EntityTypeCatalog,
    D: EntityObjectDistributionRegistry,
    E: EntityCatalog,
> {
    local_id: LocalId,
    web: LocalChoiceSampler<U, O>,
    entity_type: ET,
    entity_object_registry: D,
    source_link_type_catalog: Option<ET>,
    entity_catalog: Option<E>,
    provenance: ConstDistribution<ProvidedEntityEditionProvenance>,
}

#[derive(Debug, derive_more::Display)]
pub enum EntityProducerError {
    #[display("Missing object distribution")]
    MissingObjectDistribution,
    #[display("Could not sample entity object distribution")]
    Object,
    #[display("Tried to create a link but no entity catalog was bound")]
    MissingEntityCatalog,
}

impl Error for EntityProducerError {}

impl<
    U: WebCatalog,
    O: WebCatalog,
    ET: EntityTypeCatalog,
    D: EntityObjectDistributionRegistry,
    E: EntityCatalog,
> Producer<CreateEntityParams> for EntityProducer<U, O, ET, D, E>
{
    type Error = Report<EntityProducerError>;

    const ID: ProducerId = ProducerId::Entity;

    fn generate(&mut self, context: ProduceContext) -> Result<CreateEntityParams, Self::Error> {
        let local_id = self.local_id.take_and_advance();

        let entity_gid = context.global_id(local_id, Scope::Id, SubScope::Unknown);
        let object_gid = context.global_id(local_id, Scope::Object, SubScope::Property);
        let link_gid = context.global_id(local_id, Scope::Object, SubScope::Link);
        let web_gid = context.global_id(local_id, Scope::Metadata, SubScope::Web);
        let type_gid = context.global_id(local_id, Scope::Metadata, SubScope::Type);
        let provenance_gid = context.global_id(local_id, Scope::Metadata, SubScope::Provenance);

        let (_, _, web) = self.web.sample(&mut web_gid.rng());
        let entity_type_url = self.entity_type.sample_entity_type(&mut type_gid.rng());
        let entity_object_distribution = self
            .entity_object_registry
            .get_distribution(entity_type_url)
            .ok_or(EntityProducerError::MissingObjectDistribution)?;

        let properties = entity_object_distribution
            .sample(&mut object_gid.rng())
            .change_context(EntityProducerError::Object)?;

        let mut link_rng = link_gid.rng();

        #[expect(clippy::todo, reason = "Incomplete implementation")]
        let link_data = if let Some(source_entity_types) = &self.source_link_type_catalog
            && let Some((source_type, target_type)) =
                source_entity_types.sample_link(&entity_type_url.url, &mut link_rng)
        {
            let entity_catalog = self
                .entity_catalog
                .as_ref()
                .ok_or(EntityProducerError::MissingEntityCatalog)?;

            let target_type =
                target_type.unwrap_or_else(|| todo!("https://linear.app/hash/issue/BE-101"));

            let source_entity_id = entity_catalog
                .sample_entity_id(source_type, &mut link_rng)
                .unwrap_or_else(|| todo!("https://linear.app/hash/issue/BE-102"));
            let target_entity_id = entity_catalog
                .sample_entity_id(target_type, &mut link_rng)
                .unwrap_or_else(|| todo!("https://linear.app/hash/issue/BE-102"));
            Some(LinkData {
                left_entity_id: source_entity_id,
                left_entity_confidence: None,
                left_entity_provenance: PropertyProvenance::default(),
                right_entity_id: target_entity_id,
                right_entity_confidence: None,
                right_entity_provenance: PropertyProvenance::default(),
            })
        } else {
            None
        };

        Ok(CreateEntityParams {
            web_id: web,
            entity_uuid: Some(EntityUuid::new(entity_gid.encode())),
            decision_time: None,
            entity_type_ids: HashSet::from([entity_type_url.url.clone()]),
            properties,
            confidence: None,
            link_data,
            draft: false,
            policies: Vec::new(),
            provenance: self.provenance.sample(&mut provenance_gid.rng()),
        })
    }
}

pub trait EntityCatalog {
    /// Returns all available [`EntityId`]s in this catalog.
    fn entity_ids(&self, entity_type: &VersionedUrl) -> Option<&[EntityId]>;

    /// Sample a random [`EntityId`] from this catalog.
    ///
    /// # Panics
    ///
    /// Panics if the catalog is empty.
    fn sample_entity_id<R: rand::Rng + ?Sized>(
        &self,
        entity_type: &VersionedUrl,
        rng: &mut R,
    ) -> Option<EntityId> {
        self.entity_ids(entity_type)?.choose(rng).copied()
    }
}

impl<C> EntityCatalog for &C
where
    C: EntityCatalog,
{
    fn entity_ids(&self, entity_type: &VersionedUrl) -> Option<&[EntityId]> {
        (*self).entity_ids(entity_type)
    }
}

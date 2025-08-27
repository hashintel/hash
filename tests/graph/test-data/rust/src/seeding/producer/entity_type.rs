use core::error::Error;
use std::collections::{HashMap, HashSet};

use error_stack::{Report, ResultExt as _, TryReportTupleExt as _};
use hash_graph_store::{entity_type::CreateEntityTypeParams, query::ConflictBehavior};
use rand::{distr::Distribution as _, seq::IndexedRandom as _};
use type_system::ontology::{
    BaseUrl, VersionedUrl,
    entity_type::{
        EntityType,
        schema::{
            EntityConstraints, EntityTypeKindTag, EntityTypeReference, EntityTypeSchemaTag,
            InverseEntityTypeMetadata,
        },
    },
    id::{OntologyTypeVersion, ParseBaseUrlError},
    json_schema::ObjectTypeTag,
    provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
};

use super::{
    Producer,
    ontology::{BoundDomainSampler, DomainPolicy, SampledDomain, WebCatalog},
    property_type::PropertyTypeCatalog,
};
use crate::seeding::{
    context::{LocalId, ProduceContext, ProducerId, Scope, SubScope},
    distributions::{
        DistributionConfig,
        adaptors::{ConstDistribution, ConstDistributionConfig, WordDistributionConfig},
        ontology::entity_type::properties::{
            BoundEntityTypePropertiesDistribution, EntityTypePropertiesDistributionConfig,
        },
    },
    producer::slug_from_title,
};

#[derive(Debug, derive_more::Display)]
#[display("Invalid {_variant} distribution")]
pub enum EntityTypeProducerConfigError {
    #[display("domain")]
    Domain,

    #[display("title")]
    Title,

    #[display("description")]
    Description,

    #[display("properties")]
    Properties,

    #[display("conflict behavior")]
    ConflictBehavior,

    #[display("provenance")]
    Provenance,

    #[display("fetched at")]
    FetchedAt,
}

impl Error for EntityTypeProducerConfigError {}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EntityTypeProducerConfig {
    pub schema: SchemaSection,
    pub metadata: MetadataSection,
    pub config: ConfigSection,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SchemaSection {
    pub domain: DomainPolicy,
    pub title: WordDistributionConfig,
    pub description: WordDistributionConfig,
    pub properties: EntityTypePropertiesDistributionConfig,
    // TODO: Add links support (recursive EntityType references - complex implementation)
    //   see https://linear.app/hash/issue/H-5224/support-link-creation-in-entity-types-in-generated-entity-types
    // pub links: EntityTypeLinksDistributionConfig,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MetadataSection {
    pub provenance: ConstDistributionConfig<ProvidedOntologyEditionProvenance>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ConfigSection {
    pub conflict_behavior: ConstDistributionConfig<ConflictBehavior>,
}

impl EntityTypeProducerConfig {
    /// Create an entity type producer from the configuration.
    ///
    /// # Errors
    ///
    /// Returns an error if the producer cannot be created.
    pub fn create_producer<U: WebCatalog, O: WebCatalog, P: PropertyTypeCatalog>(
        &self,
        deps: EntityTypeProducerDeps<U, O, P>,
    ) -> Result<EntityTypeProducer<U, O, P>, Report<[EntityTypeProducerConfigError]>> {
        let domain = self
            .schema
            .domain
            .bind(deps.user_catalog, deps.org_catalog)
            .change_context(EntityTypeProducerConfigError::Domain);
        let title = self
            .schema
            .title
            .create_distribution()
            .change_context(EntityTypeProducerConfigError::Title);
        let description = self
            .schema
            .description
            .create_distribution()
            .change_context(EntityTypeProducerConfigError::Description);
        let properties = self
            .schema
            .properties
            .bind(deps.property_type_catalog)
            .change_context(EntityTypeProducerConfigError::Properties);
        let conflict_behavior = self
            .config
            .conflict_behavior
            .create_distribution()
            .change_context(EntityTypeProducerConfigError::ConflictBehavior);
        let provenance = self
            .metadata
            .provenance
            .create_distribution()
            .change_context(EntityTypeProducerConfigError::Provenance);

        let (domain, title, description, properties, conflict_behavior, provenance) = (
            domain,
            title,
            description,
            properties,
            conflict_behavior,
            provenance,
        )
            .try_collect()?;

        Ok(EntityTypeProducer {
            local_id: LocalId::default(),
            domain,
            title,
            description,
            properties,
            conflict_behavior,
            provenance,
        })
    }
}

/// Dependencies required to create an [`EntityType`] producer.
#[derive(Debug, Copy, Clone)]
#[expect(clippy::struct_field_names)]
pub struct EntityTypeProducerDeps<U: WebCatalog, O: WebCatalog, P: PropertyTypeCatalog> {
    pub user_catalog: Option<U>,
    pub org_catalog: Option<O>,
    pub property_type_catalog: P,
}

/// Producer for generating [`EntityType`]s with configurable properties.
#[derive(Debug)]
pub struct EntityTypeProducer<U: WebCatalog, O: WebCatalog, P: PropertyTypeCatalog> {
    local_id: LocalId,
    domain: BoundDomainSampler<U, O>,
    title: <WordDistributionConfig as DistributionConfig>::Distribution,
    description: <WordDistributionConfig as DistributionConfig>::Distribution,
    properties: BoundEntityTypePropertiesDistribution<P>,
    conflict_behavior: ConstDistribution<ConflictBehavior>,
    provenance: ConstDistribution<ProvidedOntologyEditionProvenance>,
}

impl<U: WebCatalog, O: WebCatalog, P: PropertyTypeCatalog> Producer<CreateEntityTypeParams>
    for EntityTypeProducer<U, O, P>
{
    type Error = Report<ParseBaseUrlError>;

    const ID: ProducerId = ProducerId::EntityType;

    fn generate(&mut self, context: ProduceContext) -> Result<CreateEntityTypeParams, Self::Error> {
        let local_id = self.local_id.take_and_advance();

        let domain_gid = context.global_id(local_id, Scope::Schema, SubScope::Domain);
        let title_gid = context.global_id(local_id, Scope::Schema, SubScope::Title);
        let description_gid = context.global_id(local_id, Scope::Schema, SubScope::Description);
        let properties_gid = context.global_id(local_id, Scope::Schema, SubScope::Property);

        let (properties, required) = self.properties.sample(&mut properties_gid.rng());
        let title = self.title.sample(&mut title_gid.rng());
        let description = self.description.sample(&mut description_gid.rng());

        let (domain, web_shortname, ownership) = match self.domain.sample(&mut domain_gid.rng()) {
            SampledDomain::Remote {
                domain,
                shortname,
                fetched_at,
            } => (domain, shortname, OntologyOwnership::Remote { fetched_at }),
            SampledDomain::Local {
                domain,
                shortname,
                web_id,
            } => (domain, shortname, OntologyOwnership::Local { web_id }),
        };

        let entity_type = EntityType {
            schema: EntityTypeSchemaTag::V3,
            kind: EntityTypeKindTag::EntityType,
            r#type: ObjectTypeTag::Object,
            id: VersionedUrl {
                base_url: BaseUrl::new(format!(
                    "{}/@{}/types/entity-type/{:x}-{:x}-{}/",
                    &*domain,
                    &*web_shortname,
                    title_gid.shard_id,
                    title_gid.local_id,
                    slug_from_title(&title)
                ))?,
                version: OntologyTypeVersion::new(1),
            },
            title,
            title_plural: None,
            description,
            inverse: InverseEntityTypeMetadata::default(),
            constraints: EntityConstraints {
                properties,
                required,
                links: HashMap::new(), // TODO: Add links support later
            },
            all_of: HashSet::new(),
            label_property: None,
            icon: None,
        };

        Ok(CreateEntityTypeParams {
            schema: entity_type,
            ownership,
            conflict_behavior: self.conflict_behavior.sample(
                &mut context
                    .global_id(local_id, Scope::Config, SubScope::Conflict)
                    .rng(),
            ),
            provenance: self.provenance.sample(
                &mut context
                    .global_id(local_id, Scope::Provenance, SubScope::Provenance)
                    .rng(),
            ),
        })
    }
}

/// Catalogs that provide [`EntityTypeReference`]s.
///
/// This trait enables [`EntityType`]s to reference existing [`EntityType`]s
/// when defining their structures. Implementations should provide efficient access to
/// [`EntityTypeReference`]s for random sampling during generation.
pub trait EntityTypeCatalog {
    /// Returns all available [`EntityType`] references in this catalog.
    ///
    /// The returned slice should contain all [`EntityType`]s that can be referenced when
    /// generating [`EntityType`]s.
    fn entity_type_references(&self) -> &[EntityTypeReference];

    /// Sample a random [`EntityType`] reference from this catalog.
    ///
    /// # Panics
    ///
    /// Panics if the catalog is empty.
    fn sample_entity_type<R: rand::Rng + ?Sized>(&self, rng: &mut R) -> &EntityTypeReference {
        self.entity_type_references()
            .choose(rng)
            .expect("catalog should not be empty")
    }
}

impl<C> EntityTypeCatalog for &C
where
    C: EntityTypeCatalog,
{
    fn entity_type_references(&self) -> &[EntityTypeReference] {
        (*self).entity_type_references()
    }
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;

    use hash_graph_store::query::ConflictBehavior;
    use type_system::provenance::{OriginProvenance, OriginType};

    use super::*;
    use crate::seeding::{
        context::{Provenance, RunId, ShardId, StageId},
        distributions::{
            adaptors::ConstDistributionConfig,
            ontology::{
                ShortnameDistributionConfig, WeightedDomainListDistributionConfig,
                entity_type::properties::EntityTypePropertiesDistributionConfig,
            },
        },
        producer::{
            ontology::{
                IndexSamplerConfig, WeightedLocalSourceConfig, WeightedRemoteSourceConfig,
                domain::LocalSourceConfig, tests::EmptyTestCatalog,
            },
            property_type::tests::create_test_property_type_catalog,
            user::tests::create_test_user_web_catalog,
        },
    };

    pub(crate) fn sample_entity_type_producer_config() -> EntityTypeProducerConfig {
        EntityTypeProducerConfig {
            schema: SchemaSection {
                domain: DomainPolicy {
                    remote: Some(WeightedRemoteSourceConfig {
                        domain: crate::seeding::distributions::ontology::DomainDistributionConfig::Weighted {
                            distribution: vec![
                                WeightedDomainListDistributionConfig {
                                    name: Arc::from("https://hash.ai"),
                                    weight: 40,
                                    shortnames: ShortnameDistributionConfig::Const(
                                        ConstDistributionConfig {
                                            value: Arc::from("hash"),
                                        },
                                    ),
                                },
                            ],
                        },
                        weight: Some(1),
                        fetched_at: time::OffsetDateTime::now_utc(),
                    }),
                    local: Some(WeightedLocalSourceConfig {
                        source: LocalSourceConfig {
                            index: IndexSamplerConfig::Uniform,
                            web_type_weights: None,
                        },
                        weight: Some(1),
                    }),
                },
                title: WordDistributionConfig { length: (4, 8) },
                description: WordDistributionConfig { length: (40, 50) },
                properties: EntityTypePropertiesDistributionConfig::Fixed {
                    count: 2,
                    required: true,
                },
            },
            metadata: MetadataSection {
                provenance: ConstDistributionConfig {
                    value: ProvidedOntologyEditionProvenance {
                        sources: Vec::new(),
                        actor_type: type_system::principal::actor::ActorType::Machine,
                        origin: OriginProvenance::from_empty_type(OriginType::Api),
                    },
                },
            },
            config: ConfigSection {
                conflict_behavior: ConstDistributionConfig {
                    value: ConflictBehavior::Fail,
                },
            },
        }
    }

    #[test]
    fn basic_entity_type_producer_creation() {
        let mut producer = sample_entity_type_producer_config()
            .create_producer(EntityTypeProducerDeps {
                user_catalog: Some(create_test_user_web_catalog()),
                org_catalog: None::<EmptyTestCatalog>,
                property_type_catalog: create_test_property_type_catalog(),
            })
            .expect("should be able to create entity type producer");

        // Test basic generation functionality
        let context = ProduceContext {
            run_id: RunId::new(1),
            stage_id: StageId::new(0),
            shard_id: ShardId::new(0),
            provenance: Provenance::Integration,
            producer: ProducerId::EntityType,
        };

        let entity_type = producer
            .generate(context)
            .expect("should generate entity type");

        // Verify generated entity type structure
        assert!(!entity_type.schema.title.is_empty());
        assert!(!entity_type.schema.description.is_empty());
        assert_eq!(entity_type.schema.constraints.properties.len(), 2);
        assert_eq!(entity_type.schema.constraints.required.len(), 2);
        assert!(entity_type.schema.constraints.links.is_empty());
    }
}

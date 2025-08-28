use core::error::Error;

use error_stack::{Report, ResultExt as _, TryReportTupleExt as _};
use hash_graph_store::{property_type::CreatePropertyTypeParams, query::ConflictBehavior};
use rand::distr::Distribution as _;
use type_system::ontology::{
    BaseUrl, VersionedUrl,
    id::{OntologyTypeVersion, ParseBaseUrlError},
    property_type::PropertyType,
    provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
};

use super::{
    Producer,
    ontology::{BoundDomainSampler, DomainPolicy, SampledDomain, WebCatalog},
};
use crate::seeding::{
    context::{LocalId, ProduceContext, ProducerId, Scope, SubScope},
    distributions::{
        DistributionConfig,
        adaptors::{ConstDistribution, ConstDistributionConfig, WordDistributionConfig},
        ontology::property_type::values::PropertyValuesDistributionConfig,
    },
    producer::slug_from_title,
};

#[derive(Debug, derive_more::Display)]
#[display("Invalid {_variant} distribution")]
pub enum PropertyTypeProducerConfigError {
    #[display("domain")]
    Domain,

    #[display("title")]
    Title,

    #[display("description")]
    Description,

    #[display("values")]
    Values,

    #[display("conflict behavior")]
    ConflictBehavior,

    #[display("provenance")]
    Provenance,

    #[display("fetched at")]
    FetchedAt,
}

impl Error for PropertyTypeProducerConfigError {}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PropertyTypeProducerConfig {
    pub schema: SchemaSection,
    pub metadata: MetadataSection,
    pub config: ConfigSection,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SchemaSection {
    pub domain: DomainPolicy,
    pub title: WordDistributionConfig,
    pub description: WordDistributionConfig,
    pub values: PropertyValuesDistributionConfig,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MetadataSection {
    pub provenance: ConstDistributionConfig<ProvidedOntologyEditionProvenance>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ConfigSection {
    pub conflict_behavior: ConstDistributionConfig<ConflictBehavior>,
}

impl PropertyTypeProducerConfig {
    /// Create a property type producer from the configuration.
    ///
    /// # Errors
    ///
    /// Returns an error if the producer cannot be created.
    pub fn create_producer<U: WebCatalog, O: WebCatalog, D: DataTypeCatalog>(
        &self,
        deps: PropertyTypeProducerDeps<U, O, D>,
    ) -> Result<PropertyTypeProducer<U, O, D>, Report<[PropertyTypeProducerConfigError]>> {
        let domain = self
            .schema
            .domain
            .bind(deps.user_catalog, deps.org_catalog)
            .change_context(PropertyTypeProducerConfigError::Domain);
        let title = self
            .schema
            .title
            .create_distribution()
            .change_context(PropertyTypeProducerConfigError::Title);
        let description = self
            .schema
            .description
            .create_distribution()
            .change_context(PropertyTypeProducerConfigError::Description);
        let values = match deps.data_type_catalog {
            Some(catalog) => self
                .schema
                .values
                .bind(catalog)
                .change_context(PropertyTypeProducerConfigError::Values)?,
            None => {
                // For property types that only use Array/Object values, no data type catalog needed
                // This would need special handling based on the values config, but for now we
                // require it
                return Err(Report::new(PropertyTypeProducerConfigError::Values)
                    .attach("Property types require a data type catalog")
                    .expand());
            }
        };
        let conflict_behavior = self
            .config
            .conflict_behavior
            .create_distribution()
            .change_context(PropertyTypeProducerConfigError::ConflictBehavior);
        let provenance = self
            .metadata
            .provenance
            .create_distribution()
            .change_context(PropertyTypeProducerConfigError::Provenance);
        let (domain, title, description, conflict_behavior, provenance) =
            (domain, title, description, conflict_behavior, provenance).try_collect()?;

        Ok(PropertyTypeProducer {
            local_id: LocalId::default(),
            domain,
            title,
            description,
            values,
            conflict_behavior,
            provenance,
        })
    }
}

use crate::seeding::distributions::ontology::property_type::values::{
    BoundPropertyValuesDistribution, DataTypeCatalog,
};

/// Dependencies for property type producers that need web catalogs and data type catalogs.
#[expect(clippy::struct_field_names)]
#[derive(Debug, Copy, Clone)]
pub struct PropertyTypeProducerDeps<U: WebCatalog, O: WebCatalog, D: DataTypeCatalog> {
    pub user_catalog: Option<U>,
    pub org_catalog: Option<O>,
    pub data_type_catalog: Option<D>,
}

#[derive(Debug)]
pub struct PropertyTypeProducer<U: WebCatalog, O: WebCatalog, D: DataTypeCatalog> {
    local_id: LocalId,
    domain: BoundDomainSampler<U, O>,
    title: <WordDistributionConfig as DistributionConfig>::Distribution,
    description: <WordDistributionConfig as DistributionConfig>::Distribution,
    values: BoundPropertyValuesDistribution<D>,
    conflict_behavior: ConstDistribution<ConflictBehavior>,
    provenance: ConstDistribution<ProvidedOntologyEditionProvenance>,
}

impl<U: WebCatalog, O: WebCatalog, D: DataTypeCatalog> Producer<CreatePropertyTypeParams>
    for PropertyTypeProducer<U, O, D>
{
    type Error = Report<ParseBaseUrlError>;

    const ID: ProducerId = ProducerId::PropertyType;

    fn generate(
        &mut self,
        context: ProduceContext,
    ) -> Result<CreatePropertyTypeParams, Self::Error> {
        let local_id = self.local_id.take_and_advance();

        let domain_gid = context.global_id(local_id, Scope::Schema, SubScope::Domain);
        let title_gid = context.global_id(local_id, Scope::Schema, SubScope::Title);
        let description_gid = context.global_id(local_id, Scope::Schema, SubScope::Description);
        let values_gid = context.global_id(local_id, Scope::Schema, SubScope::PropertyValue);

        let values = self.values.sample(&mut values_gid.rng());
        let title = self.title.sample(&mut title_gid.rng());

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

        let schema = PropertyType {
            id: VersionedUrl {
                base_url: {
                    let slug = slug_from_title(&title);
                    let url_string = format!(
                        "{}/@{}/types/property-type/{:x}-{:x}-{}/",
                        &*domain, &*web_shortname, title_gid.shard_id, title_gid.local_id, slug
                    );
                    BaseUrl::new(url_string).attach_lazy(|| {
                        format!("Failed to create URL for property type: {title}")
                    })?
                },
                version: OntologyTypeVersion::new(1),
            },
            title,
            title_plural: None,
            description: self.description.sample(&mut description_gid.rng()),
            one_of: vec![values],
        };

        let conflict_behavior_gid = context.global_id(local_id, Scope::Config, SubScope::Conflict);
        let provenance_gid = context.global_id(local_id, Scope::Metadata, SubScope::Provenance);
        let conflict_behavior = self
            .conflict_behavior
            .sample(&mut conflict_behavior_gid.rng());
        let provenance = self.provenance.sample(&mut provenance_gid.rng());

        Ok(CreatePropertyTypeParams {
            schema,
            ownership,
            conflict_behavior,
            provenance,
        })
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use alloc::sync::Arc;

    use type_system::{
        ontology::data_type::schema::DataTypeReference,
        provenance::{OriginProvenance, OriginType},
    };

    use super::*;
    use crate::seeding::{
        context::{Provenance, RunId, ShardId, StageId},
        distributions::{
            adaptors::ConstDistributionConfig,
            ontology::{
                ShortnameDistributionConfig, WeightedDomainListDistributionConfig,
                property_type::values::{
                    InMemoryDataTypeCatalog, PropertyValueTypeConfig,
                    PropertyValuesDistributionConfig,
                },
            },
        },
        producer::ontology::{
            InMemoryWebCatalog, IndexSamplerConfig, LocalSourceConfig, RemoteSourceConfig,
        },
    };

    fn create_test_web_catalog() -> InMemoryWebCatalog {
        InMemoryWebCatalog::from_tuples(vec![
            (
                Arc::<str>::from("https://hash.ai"),
                Arc::<str>::from("hash"),
                type_system::principal::actor_group::WebId::new(uuid::Uuid::new_v4()),
            ),
            (
                Arc::<str>::from("https://hash.ai"),
                Arc::<str>::from("alice"),
                type_system::principal::actor_group::WebId::new(uuid::Uuid::new_v4()),
            ),
        ])
    }

    pub(crate) fn sample_property_type_producer_config() -> PropertyTypeProducerConfig {
        PropertyTypeProducerConfig {
            schema: SchemaSection {
                domain: DomainPolicy {
                    remote: Some(RemoteSourceConfig {
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
                    local: Some(LocalSourceConfig {
                        index: IndexSamplerConfig::Uniform,
                        weight: Some(1),
                        web_type_weights: None,
                    }),
                },
                title: WordDistributionConfig { length: (4, 8) },
                description: WordDistributionConfig { length: (40, 50) },
                values: PropertyValuesDistributionConfig::Uniform {
                    types: vec![PropertyValueTypeConfig::Value],
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
    fn basic_property_type_producer_creation() {
        let config = sample_property_type_producer_config();
        let catalog = create_test_web_catalog();

        let data_type_catalog = InMemoryDataTypeCatalog::new(vec![
            DataTypeReference {
                url: VersionedUrl {
                    base_url: BaseUrl::new(
                        "https://blockprotocol.org/@blockprotocol/types/data-type/text/".to_owned(),
                    )
                    .expect("valid URL"),
                    version: OntologyTypeVersion::new(1),
                },
            },
            DataTypeReference {
                url: VersionedUrl {
                    base_url: BaseUrl::new(
                        "https://blockprotocol.org/@blockprotocol/types/data-type/number/"
                            .to_owned(),
                    )
                    .expect("valid URL"),
                    version: OntologyTypeVersion::new(1),
                },
            },
        ])
        .expect("should be able to create valid data type catalog");

        let deps = PropertyTypeProducerDeps {
            user_catalog: Some(catalog),
            org_catalog: None::<InMemoryWebCatalog>,
            data_type_catalog: Some(data_type_catalog),
        };

        let mut producer = config
            .create_producer(deps)
            .expect("should be able to create property type generator");

        // Test basic generation functionality
        let context = ProduceContext {
            run_id: RunId::new(1),
            stage_id: StageId::new(0),
            shard_id: ShardId::new(0),
            provenance: Provenance::Integration,
            producer: ProducerId::PropertyType,
        };

        let property_type = producer
            .generate(context)
            .expect("should generate property type");
        assert!(!property_type.schema.title.is_empty());
        assert!(!property_type.schema.description.is_empty());
        assert!(!property_type.schema.one_of.is_empty());
    }
}

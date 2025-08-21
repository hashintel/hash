use alloc::{collections::BTreeSet, sync::Arc};
use core::error::Error;
use std::collections::HashMap;

use error_stack::{Report, ResultExt as _, TryReportTupleExt as _};
use hash_graph_store::{data_type::CreateDataTypeParams, query::ConflictBehavior};
use rand::distr::{Distribution as _, weighted::WeightedIndex};
use time::OffsetDateTime;
use type_system::{
    ontology::{
        BaseUrl, VersionedUrl,
        data_type::{
            DataType,
            schema::{DataTypeReference, DataTypeSchemaTag, DataTypeTag, ValueLabel},
        },
        id::{OntologyTypeVersion, ParseBaseUrlError},
        json_schema::{SingleValueConstraints, ValueConstraints},
        provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
    },
    principal::actor_group::WebId,
};

use super::{Producer, user::UserCreation};
use crate::{
    data_type::{
        BOOLEAN_V1_TYPE, NULL_V1_TYPE, NUMBER_V1_TYPE, OBJECT_V1_TYPE, TEXT_V1_TYPE, VALUE_V1_TYPE,
    },
    seeding::{
        context::{LocalId, ProduceContext, ProducerId, Scope, SubScope},
        distributions::{
            DistributionConfig,
            adaptors::{ConstDistribution, ConstDistributionConfig, WordDistributionConfig},
            ontology::{
                DomainDistribution, DomainDistributionConfig,
                data_type::constraints::ValueConstraintsDistributionConfig,
            },
        },
        producer::slug_from_title,
    },
};

#[derive(Debug, derive_more::Display)]
#[display("Invalid {_variant} distribution")]
pub enum DataTypeProducerConfigError {
    #[display("domain")]
    Domain,

    #[display("title")]
    Title,

    #[display("description")]
    Description,

    #[display("constraints")]
    Constraints,
    ConflictBehavior,
    Provenance,
    FetchedAt,
}

impl Error for DataTypeProducerConfigError {}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DataTypeProducerConfig {
    pub schema: SchemaSection,
    pub metadata: MetadataSection,
    pub config: ConfigSection,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SchemaSection {
    pub domain: DomainPolicy,
    pub title: WordDistributionConfig,
    pub description: WordDistributionConfig,
    pub constraints: ValueConstraintsDistributionConfig,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MetadataSection {
    pub provenance: ConstDistributionConfig<ProvidedOntologyEditionProvenance>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ConfigSection {
    pub conflict_behavior: ConstDistributionConfig<ConflictBehavior>,
}

/// Domain policy allowing remote and/or local (web-catalog) sources with optional mixing.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DomainPolicy {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remote: Option<RemoteSourceConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub local: Option<LocalSourceConfig>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteSourceConfig {
    pub domain: DomainDistributionConfig,
    #[serde(with = "hash_codec::serde::time")]
    pub fetched_at: OffsetDateTime,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub weight: Option<u32>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocalSourceConfig {
    pub index: IndexSamplerConfig,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub web_type_weights: Option<LocalWebTypeWeights>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub weight: Option<u32>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "sampling", rename_all = "camelCase")]
pub enum IndexSamplerConfig {
    Uniform,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocalWebTypeWeights {
    pub user: u32,
    pub org: u32,
}

#[derive(Debug, derive_more::Display)]
pub enum DomainBindingError {
    #[display("No source configured")]
    NoSource,
    #[display("Missing web catalog for local source")]
    MissingCatalog,
    #[display("Local web catalog is empty")]
    EmptyCatalog,
    #[display("Invalid weights")]
    InvalidWeights,
    #[display("Remote config creation failed")]
    Remote,
    #[display("Local web type weights are not supported by this catalog type")]
    WebTypeWeightsUnsupported,
}

impl Error for DomainBindingError {}

pub struct ProducerDeps<'c, U: WebCatalog, O: WebCatalog> {
    pub user_catalog: Option<&'c U>,
    pub org_catalog: Option<&'c O>,
}

pub trait WebCatalog: Sync + Send {
    fn len(&self) -> usize;

    fn is_empty(&self) -> bool {
        self.len() == 0
    }

    fn get_entry(&self, index: usize) -> Option<(Arc<str>, Arc<str>, WebId)>;
}

#[derive(Debug, Clone)]
pub struct InMemoryWebCatalog {
    items: Vec<(Arc<str>, Arc<str>, WebId)>,
}

impl InMemoryWebCatalog {
    #[must_use]
    pub const fn from_tuples(items: Vec<(Arc<str>, Arc<str>, WebId)>) -> Self {
        Self { items }
    }

    #[must_use]
    pub fn from_users(users: &[UserCreation], domain: &Arc<str>) -> Self {
        let mut items = Vec::with_capacity(users.len());
        for user in users {
            items.push((
                Arc::clone(domain),
                Arc::<str>::from(user.shortname.as_str()),
                WebId::from(user.id),
            ));
        }
        Self { items }
    }
}

impl WebCatalog for InMemoryWebCatalog {
    fn len(&self) -> usize {
        self.items.len()
    }

    fn get_entry(&self, index: usize) -> Option<(Arc<str>, Arc<str>, WebId)> {
        self.items.get(index).cloned()
    }
}

#[derive(Debug)]
enum BoundDomainSampler<'a, U: WebCatalog, O: WebCatalog> {
    Remote {
        domain: DomainDistribution,
        fetched_at: OffsetDateTime,
    },
    Local(LocalChoiceSampler<'a, U, O>),
    Mixed {
        chooser: WeightedIndex<u32>,
        remote: DomainDistribution,
        fetched_at: OffsetDateTime,
        local: LocalChoiceSampler<'a, U, O>,
    },
}

#[derive(Debug)]
enum SampledDomain {
    Remote {
        domain: Arc<str>,
        shortname: Arc<str>,
        fetched_at: OffsetDateTime,
    },
    Local {
        domain: Arc<str>,
        shortname: Arc<str>,
        web_id: WebId,
    },
}

impl<U: WebCatalog, O: WebCatalog> BoundDomainSampler<'_, U, O> {
    fn sample<R: rand::Rng + ?Sized>(&self, rng: &mut R) -> SampledDomain {
        match self {
            BoundDomainSampler::Remote { domain, fetched_at } => {
                let (domain, shortname) = domain.sample(rng);
                SampledDomain::Remote {
                    domain,
                    shortname,
                    fetched_at: *fetched_at,
                }
            }
            BoundDomainSampler::Local(local) => {
                let (domain, shortname, web_id) = local.sample(rng);
                SampledDomain::Local {
                    domain,
                    shortname,
                    web_id,
                }
            }
            BoundDomainSampler::Mixed {
                chooser,
                remote,
                fetched_at,
                local,
            } => {
                if chooser.sample(rng) == 0 {
                    let (domain, shortname) = remote.sample(rng);
                    SampledDomain::Remote {
                        domain,
                        shortname,
                        fetched_at: *fetched_at,
                    }
                } else {
                    let (domain, shortname, web_id) = local.sample(rng);
                    SampledDomain::Local {
                        domain,
                        shortname,
                        web_id,
                    }
                }
            }
        }
    }
}

#[derive(Clone, derive_more::Debug)]
struct LocalUniform<'a, C: WebCatalog> {
    #[debug(skip)]
    catalog: &'a C,
}

impl<C: WebCatalog> LocalUniform<'_, C> {
    fn sample<R: rand::Rng + ?Sized>(&self, rng: &mut R) -> (Arc<str>, Arc<str>, WebId) {
        let count = self.catalog.len();
        let index = rand::Rng::random_range(rng, 0..count);
        let (domain, shortname, web_id) = self
            .catalog
            .get_entry(index)
            .expect("should return Some for existing index");
        (domain, shortname, web_id)
    }
}

#[derive(Clone)]
struct LocalChoiceSampler<'a, U: WebCatalog, O: WebCatalog> {
    inner: LocalChoiceSamplerInner<'a, U, O>,
}

#[derive(Clone)]
enum LocalChoiceSamplerInner<'a, U: WebCatalog, O: WebCatalog> {
    User(LocalUniform<'a, U>),
    Org(LocalUniform<'a, O>),
    Mixed {
        chooser: WeightedIndex<u32>,
        user: LocalUniform<'a, U>,
        org: LocalUniform<'a, O>,
    },
}

impl<U: WebCatalog, O: WebCatalog> core::fmt::Debug for LocalChoiceSampler<'_, U, O> {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        fmt.debug_struct("LocalChoiceSampler").finish()
    }
}

impl<U: WebCatalog, O: WebCatalog> LocalChoiceSampler<'_, U, O> {
    fn sample<R: rand::Rng + ?Sized>(&self, rng: &mut R) -> (Arc<str>, Arc<str>, WebId) {
        match &self.inner {
            LocalChoiceSamplerInner::User(user_sampler) => user_sampler.sample(rng),
            LocalChoiceSamplerInner::Org(org_sampler) => org_sampler.sample(rng),
            LocalChoiceSamplerInner::Mixed { chooser, user, org } => match chooser.sample(rng) {
                0 => user.sample(rng),
                _ => org.sample(rng),
            },
        }
    }
}

impl DomainPolicy {
    fn bind<'deps, U: WebCatalog, O: WebCatalog>(
        &self,
        deps: &ProducerDeps<'deps, U, O>,
    ) -> Result<BoundDomainSampler<'deps, U, O>, Report<DomainBindingError>> {
        match (&self.remote, &self.local) {
            (None, None) => Err(Report::new(DomainBindingError::NoSource)),
            (Some(remote), None) => {
                let (domain, fetched_at) = bind_remote(remote)?;
                Ok(BoundDomainSampler::Remote { domain, fetched_at })
            }
            (None, Some(local)) => {
                let local_sampler = bind_local(deps, local)?;
                Ok(BoundDomainSampler::Local(local_sampler))
            }
            (Some(remote), Some(local)) => {
                let (remote_weight, local_weight) = match (remote.weight, local.weight) {
                    (Some(remote_weight), Some(local_weight)) => (remote_weight, local_weight),
                    (None, None) => (1, 1),
                    _ => return Err(Report::new(DomainBindingError::InvalidWeights)),
                };

                if remote_weight == 0 && local_weight == 0 {
                    return Err(Report::new(DomainBindingError::InvalidWeights));
                }
                if local_weight == 0 {
                    let (domain, fetched_at) = bind_remote(remote)?;
                    return Ok(BoundDomainSampler::Remote { domain, fetched_at });
                }
                if remote_weight == 0 {
                    let local_sampler = bind_local(deps, local)?;
                    return Ok(BoundDomainSampler::Local(local_sampler));
                }

                let (remote_domain, fetched_at) = bind_remote(remote)?;
                let local_sampler = bind_local(deps, local)?;

                #[expect(
                    clippy::tuple_array_conversions,
                    reason = "constructing WeightedIndex from a fixed-size array is concise and \
                              intentional here"
                )]
                let chooser = WeightedIndex::new([remote_weight, local_weight])
                    .change_context(DomainBindingError::InvalidWeights)?;
                Ok(BoundDomainSampler::Mixed {
                    chooser,
                    remote: remote_domain,
                    fetched_at,
                    local: local_sampler,
                })
            }
        }
    }
}

fn bind_remote(
    remote: &RemoteSourceConfig,
) -> Result<(DomainDistribution, OffsetDateTime), Report<DomainBindingError>> {
    let domain =
        DomainDistribution::new(&remote.domain).change_context(DomainBindingError::Remote)?;
    Ok((domain, remote.fetched_at))
}

fn bind_local<'deps, U: WebCatalog, O: WebCatalog>(
    deps: &ProducerDeps<'deps, U, O>,
    local: &LocalSourceConfig,
) -> Result<LocalChoiceSampler<'deps, U, O>, Report<DomainBindingError>> {
    let (user_sampler, org_sampler) = match local.index {
        IndexSamplerConfig::Uniform => (
            deps.user_catalog.map(|catalog| LocalUniform { catalog }),
            deps.org_catalog.map(|catalog| LocalUniform { catalog }),
        ),
    };

    match (user_sampler, org_sampler) {
        (Some(user), None) => {
            if user.catalog.is_empty() {
                return Err(Report::new(DomainBindingError::EmptyCatalog));
            }
            Ok(LocalChoiceSampler {
                inner: LocalChoiceSamplerInner::User(user),
            })
        }
        (None, Some(org)) => {
            if org.catalog.is_empty() {
                return Err(Report::new(DomainBindingError::EmptyCatalog));
            }
            Ok(LocalChoiceSampler {
                inner: LocalChoiceSamplerInner::Org(org),
            })
        }
        (Some(user), Some(org)) => {
            if user.catalog.is_empty() && org.catalog.is_empty() {
                return Err(Report::new(DomainBindingError::EmptyCatalog));
            }
            if user.catalog.is_empty() {
                return Ok(LocalChoiceSampler {
                    inner: LocalChoiceSamplerInner::Org(org),
                });
            }
            if org.catalog.is_empty() {
                return Ok(LocalChoiceSampler {
                    inner: LocalChoiceSamplerInner::User(user),
                });
            }
            let weights = local
                .web_type_weights
                .as_ref()
                .map_or([1, 1], |weights| [weights.user, weights.org]);

            let chooser =
                WeightedIndex::new(weights).change_context(DomainBindingError::InvalidWeights)?;
            Ok(LocalChoiceSampler {
                inner: LocalChoiceSamplerInner::Mixed { chooser, user, org },
            })
        }
        _ => Err(Report::new(DomainBindingError::MissingCatalog)),
    }
}

impl DataTypeProducerConfig {
    /// Create a data type producer from the configuration.
    ///
    /// # Errors
    ///
    /// Returns an error if the producer cannot be created.
    pub fn create_producer<'deps, U: WebCatalog, O: WebCatalog>(
        &self,
        deps: &ProducerDeps<'deps, U, O>,
    ) -> Result<DataTypeProducer<'deps, U, O>, Report<[DataTypeProducerConfigError]>> {
        let domain = self
            .schema
            .domain
            .bind(deps)
            .change_context(DataTypeProducerConfigError::Domain);
        let title = self
            .schema
            .title
            .create_distribution()
            .change_context(DataTypeProducerConfigError::Title);
        let description = self
            .schema
            .description
            .create_distribution()
            .change_context(DataTypeProducerConfigError::Description);
        let constraints = self
            .schema
            .constraints
            .create_distribution()
            .change_context(DataTypeProducerConfigError::Constraints);
        let conflict_behavior = self
            .config
            .conflict_behavior
            .create_distribution()
            .change_context(DataTypeProducerConfigError::ConflictBehavior);
        let provenance = self
            .metadata
            .provenance
            .create_distribution()
            .change_context(DataTypeProducerConfigError::Provenance);
        let (domain, title, description, constraints, conflict_behavior, provenance) = (
            domain,
            title,
            description,
            constraints,
            conflict_behavior,
            provenance,
        )
            .try_collect()?;

        Ok(DataTypeProducer {
            local_id: LocalId::default(),
            domain,
            title,
            description,
            constraints,
            conflict_behavior,
            provenance,
        })
    }
}

#[derive(Debug)]
pub struct DataTypeProducer<'c, U: WebCatalog, O: WebCatalog> {
    local_id: LocalId,
    domain: BoundDomainSampler<'c, U, O>,
    title: <WordDistributionConfig as DistributionConfig>::Distribution,
    description: <WordDistributionConfig as DistributionConfig>::Distribution,
    constraints: <ValueConstraintsDistributionConfig as DistributionConfig>::Distribution,
    conflict_behavior: ConstDistribution<ConflictBehavior>,
    provenance: ConstDistribution<ProvidedOntologyEditionProvenance>,
}

impl<U: WebCatalog, O: WebCatalog> Producer<CreateDataTypeParams> for DataTypeProducer<'_, U, O> {
    type Error = Report<ParseBaseUrlError>;

    const ID: ProducerId = ProducerId::DataType;

    fn generate(&mut self, context: &ProduceContext) -> Result<CreateDataTypeParams, Self::Error> {
        let local_id = self.local_id.take_and_advance();

        let domain_gid = context.global_id(local_id, Scope::Schema, SubScope::Domain);
        let title_gid = context.global_id(local_id, Scope::Schema, SubScope::Title);
        let description_gid = context.global_id(local_id, Scope::Schema, SubScope::Description);
        let constraints_gid = context.global_id(local_id, Scope::Schema, SubScope::Constraint);

        let constraints = self.constraints.sample(&mut constraints_gid.rng());

        let parent = match &constraints {
            ValueConstraints::Typed(typed) => match &**typed {
                SingleValueConstraints::String(_) => TEXT_V1_TYPE.id.clone(),
                SingleValueConstraints::Number(_) => NUMBER_V1_TYPE.id.clone(),
                SingleValueConstraints::Boolean => BOOLEAN_V1_TYPE.id.clone(),
                SingleValueConstraints::Null => NULL_V1_TYPE.id.clone(),
                SingleValueConstraints::Object => OBJECT_V1_TYPE.id.clone(),
                SingleValueConstraints::Array(_) => VALUE_V1_TYPE.id.clone(),
            },
            ValueConstraints::AnyOf(_) => VALUE_V1_TYPE.id.clone(),
        };

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

        let schema = DataType {
            schema: DataTypeSchemaTag::V3,
            kind: DataTypeTag::DataType,
            id: VersionedUrl {
                base_url: BaseUrl::new(format!(
                    "{}/@{}/types/data-type/{:x}-{:x}-{}/",
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
            icon: None,
            description: self.description.sample(&mut description_gid.rng()),
            label: ValueLabel::default(),
            all_of: BTreeSet::from([DataTypeReference { url: parent }]),
            r#abstract: false,
            constraints,
        };

        let conflict_behavior_gid = context.global_id(local_id, Scope::Config, SubScope::Conflict);
        let provenance_gid = context.global_id(local_id, Scope::Metadata, SubScope::Provenance);
        let conflict_behavior = self
            .conflict_behavior
            .sample(&mut conflict_behavior_gid.rng());
        let provenance = self.provenance.sample(&mut provenance_gid.rng());

        Ok(CreateDataTypeParams {
            schema,
            ownership,
            conflict_behavior,
            provenance,
            conversions: HashMap::default(),
        })
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use alloc::sync::Arc;
    use core::iter;

    use type_system::{
        ontology::json_schema::StringFormat,
        provenance::{OriginProvenance, OriginType},
    };

    use super::*;
    use crate::seeding::{
        distributions::{
            adaptors::{
                ConstDistributionConfig, ConstInlineDistributionConfig, DistributionWeight,
                OptionalDistributionConfig, UniformDistributionConfig, WeightedDistributionConfig,
            },
            ontology::{
                ShortnameDistributionConfig, WeightedDomainListDistributionConfig,
                data_type::constraints::{
                    FormatDistributionConfig, MaxLengthDistributionConfig,
                    MinLengthDistributionConfig, PatternDistributionConfig,
                    RegexDistributionConfig, SimpleValueConstraintsDistributionConfig,
                    StringConstraintsDistributionConfig,
                },
            },
        },
        producer::{
            tests::assert_producer_is_deterministic,
            user::{UserProducer, tests::sample_user_producer_config},
        },
    };

    fn create_test_web_catalog() -> InMemoryWebCatalog {
        InMemoryWebCatalog::from_tuples(vec![
            (
                Arc::<str>::from("https://hash.ai"),
                Arc::<str>::from("hash"),
                WebId::new(uuid::Uuid::new_v4()),
            ),
            (
                Arc::<str>::from("https://hash.ai"),
                Arc::<str>::from("alice"),
                WebId::new(uuid::Uuid::new_v4()),
            ),
            (
                Arc::<str>::from("https://blockprotocol.org"),
                Arc::<str>::from("blockprotocol"),
                WebId::new(uuid::Uuid::new_v4()),
            ),
            (
                Arc::<str>::from("https://blockprotocol.org"),
                Arc::<str>::from("hash"),
                WebId::new(uuid::Uuid::new_v4()),
            ),
            (
                Arc::<str>::from("https://blockprotocol.org"),
                Arc::<str>::from("alice"),
                WebId::new(uuid::Uuid::new_v4()),
            ),
        ])
    }

    #[expect(
        clippy::too_many_lines,
        reason = "intentionally verbose sample configuration for broad test coverage"
    )]
    pub(crate) fn sample_data_type_producer_config() -> DataTypeProducerConfig {
        DataTypeProducerConfig {
            schema: SchemaSection {
                domain: DomainPolicy {
                    remote: Some(RemoteSourceConfig {
                        domain: DomainDistributionConfig::Weighted {
                            distribution: vec![
                                WeightedDomainListDistributionConfig {
                                    name: Arc::from("https://hash.ai"),
                                    weight: 40,
                                    shortnames: ShortnameDistributionConfig::Weighted(
                                        WeightedDistributionConfig {
                                            weights: vec![
                                                DistributionWeight {
                                                    weight: 60,
                                                    distribution: ConstDistributionConfig {
                                                        value: Arc::from("hash"),
                                                    },
                                                },
                                                DistributionWeight {
                                                    weight: 30,
                                                    distribution: ConstDistributionConfig {
                                                        value: Arc::from("h"),
                                                    },
                                                },
                                                DistributionWeight {
                                                    weight: 10,
                                                    distribution: ConstDistributionConfig {
                                                        value: Arc::from("alice"),
                                                    },
                                                },
                                            ],
                                        },
                                    ),
                                },
                                WeightedDomainListDistributionConfig {
                                    name: Arc::from("https://blockprotocol.org"),
                                    weight: 40,
                                    shortnames: ShortnameDistributionConfig::Uniform(
                                        UniformDistributionConfig {
                                            distributions: vec![
                                                ConstInlineDistributionConfig {
                                                    value: Arc::from("blockprotocol"),
                                                },
                                                ConstInlineDistributionConfig {
                                                    value: Arc::from("hash"),
                                                },
                                            ],
                                        },
                                    ),
                                },
                                WeightedDomainListDistributionConfig {
                                    name: Arc::from("https://blockprotocol.org"),
                                    weight: 40,
                                    shortnames: ShortnameDistributionConfig::Const(
                                        ConstDistributionConfig {
                                            value: Arc::from("alice"),
                                        },
                                    ),
                                },
                            ],
                        },
                        weight: Some(1),
                        fetched_at: OffsetDateTime::now_utc(),
                    }),
                    local: Some(LocalSourceConfig {
                        index: IndexSamplerConfig::Uniform,
                        weight: Some(1),
                        web_type_weights: None,
                    }),
                },
                title: WordDistributionConfig { length: (4, 8) },
                description: WordDistributionConfig { length: (40, 50) },
                constraints: ValueConstraintsDistributionConfig::Weighted(
                    WeightedDistributionConfig {
                        weights: vec![
                            DistributionWeight {
                                weight: 10,
                                distribution: SimpleValueConstraintsDistributionConfig::Null,
                            },
                            DistributionWeight {
                                weight: 10,
                                distribution: SimpleValueConstraintsDistributionConfig::Boolean,
                            },
                            DistributionWeight {
                                weight: 30,
                                distribution: SimpleValueConstraintsDistributionConfig::Number,
                            },
                            DistributionWeight {
                                weight: 10,
                                distribution: SimpleValueConstraintsDistributionConfig::String(
                                    StringConstraintsDistributionConfig {
                                        min_length: Some(MinLengthDistributionConfig {
                                            probability: 0.8,
                                            range: (4, 8),
                                        }),
                                        max_length: Some(MaxLengthDistributionConfig {
                                            probability: 0.8,
                                            offset: Some((2, 4)),
                                            range: Some((10, 12)),
                                        }),
                                        pattern: Some(PatternDistributionConfig::Weighted(
                                            OptionalDistributionConfig {
                                                probability: Some(0.3),
                                                distribution: WeightedDistributionConfig {
                                                    weights: vec![
                                                        DistributionWeight {
                                                            weight: 90,
                                                            distribution: RegexDistributionConfig {
                                                                value: Arc::from(".+"),
                                                            },
                                                        },
                                                        DistributionWeight {
                                                            weight: 10,
                                                            distribution: RegexDistributionConfig {
                                                                value: Arc::from("^[a-z]+$"),
                                                            },
                                                        },
                                                    ],
                                                },
                                            },
                                        )),
                                        format: Some(FormatDistributionConfig::Uniform(
                                            OptionalDistributionConfig {
                                                probability: Some(0.2),
                                                distribution: UniformDistributionConfig {
                                                    distributions: vec![
                                                        ConstInlineDistributionConfig {
                                                            value: StringFormat::Email,
                                                        },
                                                        ConstInlineDistributionConfig {
                                                            value: StringFormat::Uri,
                                                        },
                                                    ],
                                                },
                                            },
                                        )),
                                    },
                                ),
                            },
                            DistributionWeight {
                                weight: 10,
                                distribution: SimpleValueConstraintsDistributionConfig::Array,
                            },
                            DistributionWeight {
                                weight: 10,
                                distribution: SimpleValueConstraintsDistributionConfig::Object,
                            },
                        ],
                    },
                ),
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
    fn deterministic_constraints_producer() {
        let config = sample_data_type_producer_config();
        let catalog = create_test_web_catalog();
        let deps: ProducerDeps<InMemoryWebCatalog, InMemoryWebCatalog> = ProducerDeps {
            user_catalog: Some(&catalog),
            org_catalog: None,
        };
        let make_producer = || {
            config
                .create_producer(&deps)
                .expect("should be able to sample data type generator")
        };
        assert_producer_is_deterministic(make_producer);
    }

    use serde::Deserialize as _;
    use serde_json::json;

    #[test]
    fn remote_only_domain_policy_builds_and_runs() {
        let cfg = DataTypeProducerConfig::deserialize(json!({
            "schema": {"domain": {
                "remote": {
                    "domain": {
                        "type": "weighted",
                        "distribution": [
                            {
                                "name": "https://remote.example",
                                "weight": 1,
                                "shortnames": { "type": "const", "value": "web" }
                            }
                        ]
                    },
                    "weight": 1,
                    "fetchedAt": "1970-01-01T00:00:00Z"
                }
            },
            "title": { "length": [4, 4] },
            "description": { "length": [4, 4] },
            "constraints": { "type": "const", "value": { "type": "number" } }},
            "config": {"conflict_behavior": { "value": "Fail" }},
            "metadata": {"provenance": { "value": { "sources": [], "actorType": "machine", "origin": { "type": "api" } } }}
        }))
        .expect("should parse remote-only domain policy");

        let deps = ProducerDeps::<InMemoryWebCatalog, InMemoryWebCatalog> {
            user_catalog: None,
            org_catalog: None,
        };

        let make_producer = || {
            cfg.create_producer(&deps)
                .expect("should build with remote-only domain policy")
        };

        assert_producer_is_deterministic(make_producer);
    }

    #[test]
    fn local_only_domain_policy_builds_and_runs() {
        let cfg = DataTypeProducerConfig::deserialize(json!({
            "schema": {"domain": {
                "local": { "index": { "sampling": "uniform" }, "weight": 1 }
            },
            "title": { "length": [4, 4] },
            "description": { "length": [4, 4] },
            "constraints": { "type": "const", "value": { "type": "number" } }},
            "config": {"conflict_behavior": { "value": "Fail" }},
            "metadata": {"provenance": { "value": { "sources": [], "actorType": "machine", "origin": { "type": "api" } } }}
        }))
        .expect("should parse local-only domain policy");

        let catalog = create_test_web_catalog();
        let deps = ProducerDeps::<InMemoryWebCatalog, InMemoryWebCatalog> {
            user_catalog: Some(&catalog),
            org_catalog: None,
        };

        let make_producer = || {
            cfg.create_producer(&deps)
                .expect("should build with local-only domain policy")
        };

        assert_producer_is_deterministic(make_producer);
    }

    #[test]
    fn mixed_domain_policy_builds_and_runs() {
        let cfg = DataTypeProducerConfig::deserialize(json!({
            "schema": {"domain": {
                "remote": {
                    "domain": {
                        "type": "weighted",
                        "distribution": [
                            {
                                "name": "https://remote.example",
                                "weight": 1,
                                "shortnames": { "type": "const", "value": "web" }
                            }
                        ]
                    },
                    "weight": 2,
                    "fetchedAt": "1970-01-01T00:00:00Z"
                },
                "local": { "index": { "sampling": "uniform" }, "weight": 3 },
            },
            "title": { "length": [4, 4] },
            "description": { "length": [4, 4] },
            "constraints": { "type": "const", "value": { "type": "number" } }},
            "config": {"conflict_behavior": { "value": "Fail" }},
            "metadata": {"provenance": { "value": { "sources": [], "actorType": "machine", "origin": { "type": "api" } } }}
        }))
        .expect("should parse mixed domain policy");

        let catalog = create_test_web_catalog();
        let deps = ProducerDeps::<InMemoryWebCatalog, InMemoryWebCatalog> {
            user_catalog: Some(&catalog),
            org_catalog: Some(&catalog),
        };

        let make_producer = || {
            cfg.create_producer(&deps)
                .expect("should build with mixed domain policy")
        };

        assert_producer_is_deterministic(make_producer);
    }

    #[test]
    fn mixed_weights_default_and_error_cases() {
        use serde_json::json;

        // Defaults when both omitted (1:1)
        let cfg_ok = DataTypeProducerConfig::deserialize(json!({
            "schema": {"domain": {
                "remote": {
                    "domain": {"type": "weighted", "distribution": [{"name":"https://remote.example","weight":1,"shortnames": {"type":"const","value":"web"}}]},
                    "fetchedAt": "1970-01-01T00:00:00Z"
                },
                "local": { "index": { "sampling": "uniform" } },
            },
            "title": { "length": [4, 4] },
            "description": { "length": [4, 4] },
            "constraints": { "type": "const", "value": { "type": "number" } }},
            "config": {"conflict_behavior": { "value": "Fail" }},
            "metadata": {"provenance": { "value": { "sources": [], "actorType": "machine", "origin": { "type": "api" } } }}
        }))
        .expect("should parse config");

        let catalog = create_test_web_catalog();
        let deps = ProducerDeps::<InMemoryWebCatalog, InMemoryWebCatalog> {
            user_catalog: Some(&catalog),
            org_catalog: None,
        };
        cfg_ok
            .create_producer(&deps)
            .expect("should bind defaults 1:1");

        // Error when only one side specifies weight
        let cfg_err = DataTypeProducerConfig::deserialize(json!({
            "schema": {"domain": {
                "remote": {
                    "domain": {"type": "weighted", "distribution": [{"name":"https://remote.example","weight":1,"shortnames": {"type":"const","value":"web"}}]},
                    "fetchedAt": "1970-01-01T00:00:00Z",
                    "weight": 2
                },
                "local": { "index": { "sampling": "uniform" } },
            },
            "title": { "length": [4, 4] },
            "description": { "length": [4, 4] },
            "constraints": { "type": "const", "value": { "type": "number" } }},
            "config": {"conflict_behavior": { "value": "Fail" }},
            "metadata": {"provenance": { "value": { "sources": [], "actorType": "machine", "origin": { "type": "api" } } }}
        }))
        .expect("should parse config");

        let _: Report<_> = cfg_err
            .create_producer(&deps)
            .expect_err("should error on one-sided weight");
    }

    #[test]
    fn local_only_fails_when_catalog_missing() {
        let cfg = DataTypeProducerConfig::deserialize(serde_json::json!({
            "schema": {"domain": {
                "local": { "index": { "sampling": "uniform" }, "weight": 1 }
            },
            "title": { "length": [4, 4] },
            "description": { "length": [4, 4] },
            "constraints": { "type": "const", "value": { "type": "number" } }},
            "config": {"conflict_behavior": { "value": "Fail" }},
            "metadata": {"provenance": { "value": { "sources": [], "actorType": "machine", "origin": { "type": "api" } } }}
        }))
        .expect("should parse config");

        let deps: ProducerDeps<InMemoryWebCatalog, InMemoryWebCatalog> = ProducerDeps {
            user_catalog: None,
            org_catalog: None,
        };

        let result = cfg.create_producer(&deps);
        assert!(
            result.is_err(),
            "should error without catalog for local config"
        );
    }

    #[test]
    fn local_only_fails_when_catalog_empty() {
        let cfg = DataTypeProducerConfig::deserialize(serde_json::json!({
            "schema": {"domain": {
                "local": { "index": { "sampling": "uniform" }, "weight": 1 }
            },
            "title": { "length": [4, 4] },
            "description": { "length": [4, 4] },
            "constraints": { "type": "const", "value": { "type": "number" } }},
            "config": {"conflict_behavior": { "value": "Fail" }},
            "metadata": {"provenance": { "value": { "sources": [], "actorType": "machine", "origin": { "type": "api" } } }}
        }))
        .expect("should parse config");

        let empty_catalog = InMemoryWebCatalog::from_tuples(Vec::new());
        let deps: ProducerDeps<InMemoryWebCatalog, InMemoryWebCatalog> = ProducerDeps {
            user_catalog: Some(&empty_catalog),
            org_catalog: None,
        };

        let result = cfg.create_producer(&deps);
        assert!(result.is_err(), "should error with empty local catalog");
    }

    #[test]
    fn datatype_from_user_catalog() {
        // Prepare a small user catalog via UserProducer
        let user_cfg = sample_user_producer_config();
        let mut user_prod = user_cfg
            .create_producer()
            .expect("should build user producer");
        let ctx = crate::seeding::context::ProduceContext {
            run_id: crate::seeding::context::RunId::new(1),
            shard_id: crate::seeding::context::ShardId::new(0),
            provenance: crate::seeding::context::Provenance::Integration,
            producer: UserProducer::ID,
        };
        let users: Vec<UserCreation> =
            iter::repeat_with(|| user_prod.generate(&ctx).expect("should generate user"))
                .take(10)
                .collect();

        let domain = Arc::<str>::from("https://example.org");
        let user_catalog = InMemoryWebCatalog::from_users(&users, &domain);

        // Build datatype producer using local-only with this catalog
        let cfg = DataTypeProducerConfig::deserialize(serde_json::json!({
            "schema": {"domain": { "local": { "index": { "sampling": "uniform" }, "weight": 1 } },
            "title": { "length": [4, 4] },
            "description": { "length": [4, 4] },
            "constraints": { "type": "const", "value": { "type": "number" } }},
            "config": {"conflict_behavior": { "value": "Fail" }},
            "metadata": {"provenance": { "value": { "sources": [], "actorType": "machine", "origin": { "type": "api" } } }}
        }))
        .expect("should parse config");

        let deps: ProducerDeps<InMemoryWebCatalog, InMemoryWebCatalog> = ProducerDeps {
            user_catalog: Some(&user_catalog),
            org_catalog: None,
        };
        let make_producer = || cfg.create_producer(&deps).expect("should build data type");

        assert_producer_is_deterministic(make_producer);
    }
}

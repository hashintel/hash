use alloc::collections::BTreeSet;
use core::error::Error;
use std::collections::HashMap;

use error_stack::{Report, ResultExt as _, TryReportTupleExt as _};
use hash_graph_store::{data_type::CreateDataTypeParams, query::ConflictBehavior};
use rand::distr::Distribution as _;
use type_system::ontology::{
    BaseUrl, VersionedUrl,
    data_type::{
        DataType,
        schema::{DataTypeReference, DataTypeSchemaTag, DataTypeTag, ValueLabel},
    },
    id::{OntologyTypeVersion, ParseBaseUrlError},
    json_schema::{SingleValueConstraints, ValueConstraints},
    provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
};

use super::{
    Producer,
    ontology::{BoundDomainSampler, DomainPolicy, SampledDomain, WebCatalog},
};
use crate::{
    data_type::{
        BOOLEAN_V1_TYPE, NULL_V1_TYPE, NUMBER_V1_TYPE, OBJECT_V1_TYPE, TEXT_V1_TYPE, VALUE_V1_TYPE,
    },
    seeding::{
        context::{LocalId, ProduceContext, ProducerId, Scope, SubScope},
        distributions::{
            DistributionConfig,
            adaptors::{ConstDistribution, ConstDistributionConfig, WordDistributionConfig},
            ontology::data_type::constraints::ValueConstraintsDistributionConfig,
        },
        producer::slug_from_title,
    },
};

/// Dependencies for data type producers that need web catalogs for domain resolution.
pub struct DataTypeProducerDeps<'c, U: WebCatalog, O: WebCatalog> {
    pub user_catalog: Option<&'c U>,
    pub org_catalog: Option<&'c O>,
}

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

impl DataTypeProducerConfig {
    /// Create a data type producer from the configuration.
    ///
    /// # Errors
    ///
    /// Returns an error if the producer cannot be created.
    pub fn create_producer<'deps, U: WebCatalog, O: WebCatalog>(
        &self,
        deps: &DataTypeProducerDeps<'deps, U, O>,
    ) -> Result<DataTypeProducer<'deps, U, O>, Report<[DataTypeProducerConfigError]>> {
        let domain = self
            .schema
            .domain
            .bind(deps.user_catalog, deps.org_catalog)
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

    fn generate(&mut self, context: ProduceContext) -> Result<CreateDataTypeParams, Self::Error> {
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

    use time::OffsetDateTime;
    use type_system::{
        ontology::json_schema::StringFormat,
        principal::actor_group::WebId,
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
                DomainDistributionConfig, ShortnameDistributionConfig,
                WeightedDomainListDistributionConfig,
                data_type::constraints::{
                    FormatDistributionConfig, MaxLengthDistributionConfig,
                    MinLengthDistributionConfig, PatternDistributionConfig,
                    RegexDistributionConfig, SimpleValueConstraintsDistributionConfig,
                    StringConstraintsDistributionConfig,
                },
            },
        },
        producer::{
            ontology::{
                InMemoryWebCatalog, IndexSamplerConfig, LocalSourceConfig, RemoteSourceConfig,
            },
            tests::assert_producer_is_deterministic,
            user::{UserCreation, UserProducer, tests::sample_user_producer_config},
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
        let deps: DataTypeProducerDeps<InMemoryWebCatalog, InMemoryWebCatalog> =
            DataTypeProducerDeps {
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

        let deps = DataTypeProducerDeps::<InMemoryWebCatalog, InMemoryWebCatalog> {
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
        let deps = DataTypeProducerDeps::<InMemoryWebCatalog, InMemoryWebCatalog> {
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
        let deps = DataTypeProducerDeps::<InMemoryWebCatalog, InMemoryWebCatalog> {
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
        let deps = DataTypeProducerDeps::<InMemoryWebCatalog, InMemoryWebCatalog> {
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

        let deps: DataTypeProducerDeps<InMemoryWebCatalog, InMemoryWebCatalog> =
            DataTypeProducerDeps {
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
        let deps: DataTypeProducerDeps<InMemoryWebCatalog, InMemoryWebCatalog> =
            DataTypeProducerDeps {
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
            stage_id: crate::seeding::context::StageId::new(0),
            shard_id: crate::seeding::context::ShardId::new(0),
            provenance: crate::seeding::context::Provenance::Integration,
            producer: UserProducer::ID,
        };
        let users: Vec<UserCreation> =
            iter::repeat_with(|| user_prod.generate(ctx).expect("should generate user"))
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

        let deps: DataTypeProducerDeps<InMemoryWebCatalog, InMemoryWebCatalog> =
            DataTypeProducerDeps {
                user_catalog: Some(&user_catalog),
                org_catalog: None,
            };
        let make_producer = || cfg.create_producer(&deps).expect("should build data type");

        assert_producer_is_deterministic(make_producer);
    }
}

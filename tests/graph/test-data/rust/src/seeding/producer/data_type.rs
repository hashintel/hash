use alloc::collections::BTreeSet;
use core::error::Error;

use error_stack::{Report, ResultExt as _, TryReportTupleExt as _};
use rand::distr::Distribution as _;
use type_system::ontology::{
    BaseUrl, VersionedUrl,
    data_type::{
        DataType,
        schema::{DataTypeReference, DataTypeSchemaTag, DataTypeTag, ValueLabel},
    },
    id::{OntologyTypeVersion, ParseBaseUrlError},
    json_schema::{SingleValueConstraints, ValueConstraints},
};

use super::Producer;
use crate::{
    data_type::{
        BOOLEAN_V1_TYPE, NULL_V1_TYPE, NUMBER_V1_TYPE, OBJECT_V1_TYPE, TEXT_V1_TYPE, VALUE_V1_TYPE,
    },
    seeding::{
        context::{LocalId, ProduceContext, ProducerId, Scope, SubScope},
        distributions::{
            DistributionConfig,
            adaptors::WordDistributionConfig,
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
}

impl Error for DataTypeProducerConfigError {}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DataTypeProducerConfig<'c> {
    pub domain: DomainDistributionConfig<'c, 'c>,
    pub title: WordDistributionConfig,
    pub description: WordDistributionConfig,
    pub constraints: ValueConstraintsDistributionConfig<'c>,
}

impl<'c> DataTypeProducerConfig<'c> {
    /// Create a data type producer from the configuration.
    ///
    /// # Errors
    ///
    /// Returns an error if the producer cannot be created.
    pub fn create_producer(
        &'c self,
    ) -> Result<DataTypeProducer<'c>, Report<[DataTypeProducerConfigError]>> {
        let domain = DomainDistribution::new(&self.domain)
            .change_context(DataTypeProducerConfigError::Domain);
        let title = self
            .title
            .create_distribution()
            .change_context(DataTypeProducerConfigError::Title);
        let description = self
            .description
            .create_distribution()
            .change_context(DataTypeProducerConfigError::Description);
        let constraints = self
            .constraints
            .create_distribution()
            .change_context(DataTypeProducerConfigError::Constraints);

        let (domain, title, description, constraints) =
            (domain, title, description, constraints).try_collect()?;

        Ok(DataTypeProducer {
            local_id: LocalId::default(),
            domain,
            title,
            description,
            constraints,
        })
    }
}

#[derive(Debug)]
pub struct DataTypeProducer<'c> {
    pub local_id: LocalId,
    pub domain: DomainDistribution<'c, 'c>,
    pub title: <WordDistributionConfig as DistributionConfig>::Distribution,
    pub description: <WordDistributionConfig as DistributionConfig>::Distribution,
    pub constraints: <ValueConstraintsDistributionConfig<'c> as DistributionConfig>::Distribution,
}

impl Producer<DataType> for DataTypeProducer<'_> {
    type Error = Report<ParseBaseUrlError>;

    const ID: ProducerId = ProducerId::DataType;

    fn generate(&mut self, context: &ProduceContext) -> Result<DataType, Self::Error> {
        let local_id = self.local_id.take_and_advance();

        let domain_gid = context.global_id(local_id, Scope::Domain, SubScope::Unknown);
        let title_gid = context.global_id(local_id, Scope::Title, SubScope::Unknown);
        let description_gid = context.global_id(local_id, Scope::Description, SubScope::Unknown);
        let constraints_gid = context.global_id(local_id, Scope::Constraint, SubScope::Unknown);

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

        let (domain, web_shortname) = self.domain.sample(&mut domain_gid.rng());

        Ok(DataType {
            schema: DataTypeSchemaTag::V3,
            kind: DataTypeTag::DataType,
            id: VersionedUrl {
                base_url: BaseUrl::new(format!(
                    "{domain}/@{web_shortname}/types/data-type/{:x}-{:x}-{}/",
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
        })
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use alloc::borrow::Cow;

    use type_system::ontology::json_schema::StringFormat;

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
        producer::tests::assert_producer_is_deterministic,
    };

    #[expect(clippy::too_many_lines)]
    pub(crate) fn sample_data_type_producer_config() -> DataTypeProducerConfig<'static> {
        DataTypeProducerConfig {
            domain: DomainDistributionConfig::Weighted {
                distribution: vec![
                    WeightedDomainListDistributionConfig {
                        name: Cow::Borrowed("https://hash.ai"),
                        weight: 40,
                        shortnames: ShortnameDistributionConfig::Weighted(
                            WeightedDistributionConfig {
                                weights: vec![
                                    DistributionWeight {
                                        weight: 60,
                                        distribution: ConstDistributionConfig {
                                            value: Cow::Borrowed("hash"),
                                        },
                                    },
                                    DistributionWeight {
                                        weight: 30,
                                        distribution: ConstDistributionConfig {
                                            value: Cow::Borrowed("h"),
                                        },
                                    },
                                    DistributionWeight {
                                        weight: 10,
                                        distribution: ConstDistributionConfig {
                                            value: Cow::Borrowed("alice"),
                                        },
                                    },
                                ],
                            },
                        ),
                    },
                    WeightedDomainListDistributionConfig {
                        name: Cow::Borrowed("https://blockprotocol.org"),
                        weight: 40,
                        shortnames: ShortnameDistributionConfig::Uniform(
                            UniformDistributionConfig {
                                distributions: vec![
                                    ConstInlineDistributionConfig {
                                        value: Cow::Borrowed("blockprotocol"),
                                    },
                                    ConstInlineDistributionConfig {
                                        value: Cow::Borrowed("hash"),
                                    },
                                ],
                            },
                        ),
                    },
                    WeightedDomainListDistributionConfig {
                        name: Cow::Borrowed("https://blockprotocol.org"),
                        weight: 40,
                        shortnames: ShortnameDistributionConfig::Const(ConstDistributionConfig {
                            value: Cow::Borrowed("alice"),
                        }),
                    },
                ],
            },
            title: WordDistributionConfig { length: (4, 8) },
            description: WordDistributionConfig { length: (40, 50) },
            constraints: ValueConstraintsDistributionConfig::Weighted(WeightedDistributionConfig {
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
                                                        value: Cow::Borrowed(".+"),
                                                    },
                                                },
                                                DistributionWeight {
                                                    weight: 10,
                                                    distribution: RegexDistributionConfig {
                                                        value: Cow::Borrowed("^[a-z]+$"),
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
            }),
        }
    }

    #[test]
    fn deterministic_constraints_producer() {
        let config = sample_data_type_producer_config();
        let make_producer = || {
            config
                .create_producer()
                .expect("should be able to sample data type generator")
        };
        assert_producer_is_deterministic(make_producer);
    }
}

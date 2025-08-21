use core::error::Error;

use error_stack::{Report, ResultExt as _};
use rand::Rng;
use rand_distr::Distribution;
use type_system::ontology::json_schema::{
    ArrayConstraints, ArraySchema, NumberConstraints, NumberSchema, SingleValueConstraints,
    StringSchema, ValueConstraints,
};

use super::{StringConstraintsDistribution, StringConstraintsDistributionConfig};
use crate::seeding::distributions::{
    DistributionConfig,
    adaptors::{
        ConstDistribution, ConstDistributionConfig, UniformDistribution, UniformDistributionConfig,
        WeightedDistribution, WeightedDistributionConfig,
    },
};

#[derive(Debug, Clone)]
pub enum SimpleValueConstraintsDistribution {
    Null,
    Boolean,
    Number,
    String(Box<StringConstraintsDistribution>),
    Array,
    Object,
}

impl Distribution<ValueConstraints> for SimpleValueConstraintsDistribution {
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> ValueConstraints {
        match self {
            Self::Null => ValueConstraints::Typed(Box::new(SingleValueConstraints::Null)),
            Self::Boolean => ValueConstraints::Typed(Box::new(SingleValueConstraints::Boolean)),
            Self::Number => ValueConstraints::Typed(Box::new(SingleValueConstraints::Number(
                NumberSchema::Constrained(NumberConstraints::default()),
            ))),
            Self::String(string) => ValueConstraints::Typed(Box::new(
                SingleValueConstraints::String(StringSchema::Constrained(string.sample(rng))),
            )),
            Self::Array => ValueConstraints::Typed(Box::new(SingleValueConstraints::Array(
                ArraySchema::Constrained(Box::new(ArrayConstraints { items: None })),
            ))),
            Self::Object => ValueConstraints::Typed(Box::new(SingleValueConstraints::Object)),
        }
    }
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum SimpleValueConstraintsDistributionConfig<'c> {
    Null,
    Boolean,
    Number,
    String(StringConstraintsDistributionConfig<'c>),
    Array,
    Object,
}

#[derive(Debug, derive_more::Display)]
#[display("Invalid {_variant} distribution")]
pub enum SimpleValueConstraintsDistributionConfigError {
    #[display("string")]
    String,
}

impl Error for SimpleValueConstraintsDistributionConfigError {}

impl DistributionConfig for SimpleValueConstraintsDistributionConfig<'_> {
    type Distribution = SimpleValueConstraintsDistribution;
    type Error = Report<SimpleValueConstraintsDistributionConfigError>;

    fn create_distribution(&self) -> Result<Self::Distribution, Self::Error> {
        Ok(match &self {
            Self::Null => SimpleValueConstraintsDistribution::Null,
            Self::Boolean => SimpleValueConstraintsDistribution::Boolean,
            Self::Number => SimpleValueConstraintsDistribution::Number,
            Self::String(config) => SimpleValueConstraintsDistribution::String(Box::new(
                config
                    .create_distribution()
                    .change_context(SimpleValueConstraintsDistributionConfigError::String)?,
            )),
            Self::Array => SimpleValueConstraintsDistribution::Array,
            Self::Object => SimpleValueConstraintsDistribution::Object,
        })
    }
}

#[derive(Debug, Clone)]
pub enum ValueConstraintsDistribution {
    Const(ConstDistribution<ValueConstraints>),
    Weighted(WeightedDistribution<SimpleValueConstraintsDistribution>),
    Uniform(UniformDistribution<SimpleValueConstraintsDistribution>),
}

impl Distribution<ValueConstraints> for ValueConstraintsDistribution {
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> ValueConstraints {
        match self {
            Self::Const(config) => config.sample(rng),
            Self::Weighted(config) => config.sample(rng),
            Self::Uniform(config) => config.sample(rng),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum ValueConstraintsDistributionConfig<'c> {
    Const(ConstDistributionConfig<ValueConstraints>),
    Weighted(WeightedDistributionConfig<SimpleValueConstraintsDistributionConfig<'c>>),
    Uniform(UniformDistributionConfig<SimpleValueConstraintsDistributionConfig<'c>>),
}

#[derive(Debug, derive_more::Display)]
#[display("Invalid value constraints distribution config")]
pub struct ValueConstraintsDistributionConfigError;

impl Error for ValueConstraintsDistributionConfigError {}

impl DistributionConfig for ValueConstraintsDistributionConfig<'_> {
    type Distribution = ValueConstraintsDistribution;
    type Error = Report<ValueConstraintsDistributionConfigError>;

    fn create_distribution(&self) -> Result<Self::Distribution, Self::Error> {
        match self {
            Self::Const(config) => Ok(ValueConstraintsDistribution::Const(
                config
                    .create_distribution()
                    .change_context(ValueConstraintsDistributionConfigError)?,
            )),
            Self::Weighted(config) => Ok(ValueConstraintsDistribution::Weighted(
                config
                    .create_distribution()
                    .change_context(ValueConstraintsDistributionConfigError)?,
            )),
            Self::Uniform(config) => Ok(ValueConstraintsDistribution::Uniform(
                config
                    .create_distribution()
                    .change_context(ValueConstraintsDistributionConfigError)?,
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use serde::Deserialize as _;
    use serde_json::json;

    use super::*;

    #[test]
    fn value_constraints_distribution_config() -> Result<(), Box<dyn Error>> {
        ValueConstraintsDistributionConfig::deserialize(json!({
            "type": "const",
            "value": {
                "type": "string",
                "minLength": 1,
                "maxLength": 10,
                "pattern": "a*",
            },
        }))?;

        ValueConstraintsDistributionConfig::deserialize(json!({
            "type": "weighted",
            "weights": [
                {
                    "weight": 1,
                    "distribution": {
                        "type": "string",
                        "minLength":  {
                            "probability": 1,
                            "range": [4, 8],
                        },
                        "maxLength":  {
                            "probability": 1,
                            "offset": [2, 4],
                            "range": [10, 12],
                        },
                        "pattern": {
                            "type": "const",
                            "probability": 0.2,
                            "value": "a*",
                        },
                    },
                },
                {
                    "weight": 5,
                    "distribution": {
                        "type": "number"
                    },
                },
            ],
        }))?;

        Ok(())
    }
}

use core::error::Error;

use error_stack::{Report, ResultExt as _};
use rand_distr::{Bernoulli, Distribution as _};
use type_system::{
    knowledge::PropertyValue,
    ontology::{
        data_type::schema::ValidateDataTypeError,
        json_schema::{SingleValueConstraints, ValueConstraints},
    },
};

use super::Producer;
use crate::seeding::{
    context::{LocalId, ProduceContext, ProducerId, Scope, SubScope},
    distributions::value::{NumberValueDistribution, StringValueDistribution},
};

enum ValueDistribution<'c> {
    Null,
    Boolean(Bernoulli),
    Number(NumberValueDistribution<'c>),
    String(StringValueDistribution<'c>),
}

impl ValueDistribution<'_> {
    fn boolean() -> Self {
        ValueDistribution::Boolean(Bernoulli::new(0.5).unwrap_or_else(|error| {
            unreachable!("Bernoulli distribution should always be able to be created: {error}")
        }))
    }
}

#[derive(Debug, derive_more::Display)]
#[display("Invalid {_variant} distribution")]
pub enum ValueProducerError {
    #[display("number")]
    Number,
    #[display("string")]
    String,
}

impl Error for ValueProducerError {}

impl TryFrom<ValueConstraints> for ValueDistribution<'_> {
    type Error = Report<ValueProducerError>;

    #[expect(clippy::todo, reason = "Incomplete implementation")]
    fn try_from(constraints: ValueConstraints) -> Result<Self, Self::Error> {
        match constraints {
            ValueConstraints::Typed(typed) => match *typed {
                SingleValueConstraints::Null => Ok(Self::Null),
                SingleValueConstraints::Boolean => Ok(Self::boolean()),
                SingleValueConstraints::Number(number) => NumberValueDistribution::try_from(number)
                    .map(Self::Number)
                    .change_context(ValueProducerError::Number),
                SingleValueConstraints::String(string) => StringValueDistribution::try_from(string)
                    .map(Self::String)
                    .change_context(ValueProducerError::String),
                SingleValueConstraints::Array(_) => {
                    todo!("https://linear.app/hash/issue/H-5239/support-value-seeding-for-arrays")
                }
                SingleValueConstraints::Object => {
                    todo!("https://linear.app/hash/issue/H-5240/support-value-seeding-for-objects")
                }
            },
            ValueConstraints::AnyOf(_) => {
                todo!("https://linear.app/hash/issue/H-5241/support-value-seeding-for-anyof-types")
            }
        }
    }
}

impl<'c> TryFrom<&'c ValueConstraints> for ValueDistribution<'c> {
    type Error = Report<ValueProducerError>;

    #[expect(clippy::todo, reason = "Incomplete implementation")]
    fn try_from(constraints: &'c ValueConstraints) -> Result<Self, Self::Error> {
        match constraints {
            ValueConstraints::Typed(typed) => match &**typed {
                SingleValueConstraints::Null => Ok(Self::Null),
                SingleValueConstraints::Boolean => Ok(Self::boolean()),
                SingleValueConstraints::Number(number) => NumberValueDistribution::try_from(number)
                    .map(Self::Number)
                    .change_context(ValueProducerError::Number),
                SingleValueConstraints::String(string) => StringValueDistribution::try_from(string)
                    .map(Self::String)
                    .change_context(ValueProducerError::String),
                SingleValueConstraints::Array(_) => {
                    todo!("https://linear.app/hash/issue/H-5239/support-value-seeding-for-arrays")
                }
                SingleValueConstraints::Object => {
                    todo!("https://linear.app/hash/issue/H-5240/support-value-seeding-for-objects")
                }
            },
            ValueConstraints::AnyOf(_) => {
                todo!("https://linear.app/hash/issue/H-5241/support-value-seeding-for-anyof-types")
            }
        }
    }
}

pub struct ValueProducer<'e> {
    local_id: LocalId,
    value: ValueDistribution<'e>,
}

impl TryFrom<ValueConstraints> for ValueProducer<'_> {
    type Error = Report<ValueProducerError>;

    fn try_from(constraints: ValueConstraints) -> Result<Self, Self::Error> {
        Ok(ValueProducer {
            local_id: LocalId::default(),
            value: ValueDistribution::try_from(constraints)?,
        })
    }
}

impl<'c> TryFrom<&'c ValueConstraints> for ValueProducer<'c> {
    type Error = Report<ValueProducerError>;

    fn try_from(constraints: &'c ValueConstraints) -> Result<Self, Self::Error> {
        Ok(ValueProducer {
            local_id: LocalId::default(),
            value: ValueDistribution::try_from(constraints)?,
        })
    }
}

impl Producer<PropertyValue> for ValueProducer<'_> {
    type Error = Report<ValidateDataTypeError>;

    const ID: ProducerId = ProducerId::Value;

    fn generate(&mut self, context: ProduceContext) -> Result<PropertyValue, Self::Error> {
        let local_id = self.local_id.take_and_advance();

        let value = match &self.value {
            ValueDistribution::Null => PropertyValue::Null,
            ValueDistribution::Boolean(boolean) => {
                let boolean_gid = context.global_id(local_id, Scope::Boolean, SubScope::Unknown);

                PropertyValue::Bool(boolean.sample(&mut boolean_gid.rng()))
            }
            ValueDistribution::Number(number) => {
                let number_gid = context.global_id(local_id, Scope::Number, SubScope::Unknown);

                PropertyValue::Number(number.sample(&mut number_gid.rng()))
            }
            ValueDistribution::String(string) => {
                let string_gid = context.global_id(local_id, Scope::String, SubScope::Unknown);

                PropertyValue::String(string.sample(&mut string_gid.rng()))
            }
        };

        Ok(value)
    }
}

use alloc::borrow::Cow;
use core::error::Error;

use error_stack::{Report, ResultExt as _};
use rand::{Rng, distr::Alphabetic, seq::IndexedRandom as _};
use rand_distr::{Distribution, Uniform};
use type_system::ontology::json_schema::{StringConstraints, StringSchema};

#[derive(Debug, derive_more::Display)]
pub enum StringValueDistributionError {
    #[display("Enum is empty")]
    EmptyEnum,
    #[display("Invalid string length")]
    StringLength,
}

impl Error for StringValueDistributionError {}

pub enum StringValueDistribution<'e> {
    Constraints {
        length: Uniform<usize>,
        alphabet: Alphabetic,
    },
    Enum {
        choices: Cow<'e, [String]>,
    },
}

impl<'e> StringValueDistribution<'e> {
    #[expect(clippy::todo, reason = "Incomplete implementation")]
    fn from_constraints(
        constraints: &StringConstraints,
    ) -> Result<Self, Report<StringValueDistributionError>> {
        if constraints.format.is_some() {
            todo!("https://linear.app/hash/issue/H-5236/support-value-seeding-for-format-strings");
        }

        if constraints.pattern.is_some() {
            todo!("https://linear.app/hash/issue/H-5237/support-value-seeding-for-pattern-strings");
        }

        let (min, max) = match (constraints.min_length, constraints.max_length) {
            (Some(min), Some(max)) => (min, max),
            (Some(min), None) => (min, min << 2),
            (None, Some(max)) => (max >> 2, max),
            (None, None) => (4, 16),
        };

        Ok(Self::Constraints {
            length: Uniform::new(min, max)
                .change_context(StringValueDistributionError::StringLength)?,
            alphabet: Alphabetic,
        })
    }

    fn from_enum(
        choices: impl Into<Cow<'e, [String]>>,
    ) -> Result<Self, Report<StringValueDistributionError>> {
        let choices = choices.into();

        if choices.is_empty() {
            return Err(StringValueDistributionError::EmptyEnum.into());
        }

        Ok(Self::Enum { choices })
    }
}

impl TryFrom<StringSchema> for StringValueDistribution<'_> {
    type Error = Report<StringValueDistributionError>;

    fn try_from(schema: StringSchema) -> Result<Self, Self::Error> {
        match schema {
            StringSchema::Constrained(constraints) => Self::from_constraints(&constraints),
            StringSchema::Enum { r#enum } => Self::from_enum(r#enum),
        }
    }
}

impl<'a> TryFrom<&'a StringSchema> for StringValueDistribution<'a> {
    type Error = Report<StringValueDistributionError>;

    fn try_from(schema: &'a StringSchema) -> Result<Self, Self::Error> {
        match schema {
            StringSchema::Constrained(constraints) => Self::from_constraints(constraints),
            StringSchema::Enum { r#enum } => Self::from_enum(r#enum),
        }
    }
}

impl Distribution<String> for StringValueDistribution<'_> {
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> String {
        match self {
            Self::Constraints { length, alphabet } => {
                let length = length.sample(rng);
                String::from_utf8(alphabet.sample_iter(rng).take(length).collect())
                    .expect("should be able to convert chars to string")
            }
            Self::Enum { choices } => {
                let choice = choices
                    .choose(rng)
                    .unwrap_or_else(|| unreachable!("Choices somehow became empty"));
                choice.clone()
            }
        }
    }
}

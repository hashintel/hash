use indexmap::IndexSet;
use rand::{Rng, distr::Distribution};
use regex::Regex;
use type_system::ontology::json_schema::{StringConstraints, StringFormat, StringSchema};

#[derive(Debug)]
pub struct StringConstraintsDistribution<L, P, F> {
    pub min_max_length: L,
    pub pattern: P,
    pub format: F,
}

impl<L, P, F> Distribution<StringConstraints> for StringConstraintsDistribution<L, P, F>
where
    L: Distribution<(Option<usize>, Option<usize>)>,
    P: Distribution<Option<Regex>>,
    F: Distribution<Option<StringFormat>>,
{
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> StringConstraints {
        let (min_length, max_length) = self.min_max_length.sample(rng);
        StringConstraints {
            min_length,
            max_length,
            pattern: self.pattern.sample(rng),
            format: self.format.sample(rng),
        }
    }
}

pub struct StringEnumDistribution<C, V> {
    pub count: C,
    pub value: V,
    pub max_retries_per_item: usize,
}

impl<C, V> Distribution<Vec<String>> for StringEnumDistribution<C, V>
where
    C: Distribution<usize>,
    V: Distribution<String>,
{
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> Vec<String> {
        let target = self.count.sample(rng);
        let mut values = IndexSet::with_capacity(target);

        'outer: while values.len() < target {
            let mut retries = 0_usize;
            loop {
                let value = self.value.sample(rng);
                if values.insert(value) {
                    break;
                }

                retries += 1;
                if retries >= self.max_retries_per_item {
                    // Not enough entropy -> accept whatever we have and break the loop
                    break 'outer;
                }
            }
        }

        values.into_iter().collect()
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum StringSchemaKind {
    Constrained,
    Enum,
}

#[derive(Debug)]
pub struct StringSchemaDistribution<K, C, E> {
    pub kind: K,
    pub constraints: C,
    pub enum_values: E,
}

impl<K, C, E> Distribution<StringSchema> for StringSchemaDistribution<K, C, E>
where
    K: Distribution<StringSchemaKind>,
    C: Distribution<StringConstraints>,
    E: Distribution<Vec<String>>,
{
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> StringSchema {
        match self.kind.sample(rng) {
            StringSchemaKind::Constrained => {
                StringSchema::Constrained(self.constraints.sample(rng))
            }
            StringSchemaKind::Enum => StringSchema::Enum {
                r#enum: self.enum_values.sample(rng),
            },
        }
    }
}

#[cfg(test)]
#[expect(clippy::panic_in_result_fn, reason = "this is a test module")]
pub(crate) mod tests {
    use core::error::Error;

    use rand_distr::{Alphanumeric, Bernoulli, Uniform};
    use type_system::ontology::json_schema::StringConstraints;

    use super::*;
    use crate::seeding::{
        distributions::{
            ConsistentMinMax, OptionalDistribution, VectorDistribution, WeightedChoose,
        },
        test_utils::test_deterministic_distribution,
    };

    pub(crate) fn sample_string_constraints_distribution()
    -> Result<impl Distribution<StringConstraints>, Box<dyn Error>> {
        Ok(StringConstraintsDistribution {
            min_max_length: ConsistentMinMax {
                min: OptionalDistribution {
                    coin: Bernoulli::new(0.8)?,
                    distribution: Uniform::new(4, 8)?,
                },
                span: OptionalDistribution {
                    coin: Bernoulli::new(0.8)?,
                    distribution: Uniform::new(2, 4)?,
                },
                fallback_max: OptionalDistribution {
                    coin: Bernoulli::new(0.8)?,
                    distribution: Uniform::new(8, 12)?,
                },
            },
            pattern: OptionalDistribution {
                coin: Bernoulli::new(0.2)?,
                distribution: WeightedChoose::new([(Regex::new("^[a-z]+$")?, 1)])?,
            },
            format: OptionalDistribution {
                coin: Bernoulli::new(0.2)?,
                distribution: WeightedChoose::new([
                    (StringFormat::Email, 1),
                    (StringFormat::Uuid, 1),
                ])?,
            },
        })
    }

    pub(crate) fn sample_string_enum_distribution()
    -> Result<impl Distribution<Vec<String>>, Box<dyn Error>> {
        Ok(StringEnumDistribution {
            count: Uniform::new(1, 5)?,
            value: VectorDistribution {
                len: Uniform::new(8, 12)?,
                value: Alphanumeric,
            }
            .map(|utf8| String::from_utf8(utf8).expect("should be able to convert to string")),
            max_retries_per_item: 3,
        })
    }

    pub(crate) fn sample_string_schema_distribution()
    -> Result<impl Distribution<StringSchema>, Box<dyn Error>> {
        Ok(StringSchemaDistribution {
            kind: WeightedChoose::new([
                (StringSchemaKind::Constrained, 5),
                (StringSchemaKind::Enum, 1),
            ])?,
            constraints: sample_string_constraints_distribution()?,
            enum_values: sample_string_enum_distribution()?,
        })
    }

    #[test]
    fn deterministic_constraints_distribution() -> Result<(), Box<dyn Error>> {
        test_deterministic_distribution(sample_string_constraints_distribution()?.map(
            |constraints| {
                // Constraints cannot be compared directly because two different regexes represent
                // the same pattern. Serialize to JSON and compare the JSON strings instead.
                serde_json::to_string_pretty(&constraints)
                    .expect("should be able to serialize constraints")
            },
        ));
        Ok(())
    }

    #[test]
    fn deterministic_enum_distribution() -> Result<(), Box<dyn Error>> {
        test_deterministic_distribution(sample_string_enum_distribution()?);
        Ok(())
    }

    #[test]
    fn deterministic_schema_distribution() -> Result<(), Box<dyn Error>> {
        // Constraints cannot be compared directly because two different regexes represent
        // the same pattern. Serialize to JSON and compare the JSON strings instead.
        test_deterministic_distribution(sample_string_schema_distribution()?.map(|schema| {
            serde_json::to_string_pretty(&schema).expect("should be able to serialize schema")
        }));
        Ok(())
    }

    #[test]
    fn constraints_invariants() -> Result<(), Box<dyn Error>> {
        let distribution = sample_string_constraints_distribution()?;
        for constraints in distribution.sample_iter(rand::rng()).take(100) {
            if let (Some(min_length), Some(max_length)) =
                (constraints.min_length, constraints.max_length)
            {
                assert!(min_length <= max_length);
            }
        }
        Ok(())
    }

    #[test]
    fn enum_invariants() -> Result<(), Box<dyn Error>> {
        let distribution = sample_string_enum_distribution()?;
        for enum_values in distribution.sample_iter(rand::rng()).take(100) {
            assert!(!enum_values.is_empty());
        }
        Ok(())
    }
}

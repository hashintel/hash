use rand::{Rng, distr::Distribution};
use type_system::ontology::json_schema::{SingleValueConstraints, StringSchema, ValueConstraints};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum SingleValueConstraintsKind {
    Null,
    Boolean,
    // Number,
    String,
    // Array,
    Object,
}

#[derive(Debug)]
pub struct SingleValueConstraintsDistribution<K, S> {
    pub kind: K,
    pub string: S,
    // pub number: N,
    // pub array: A,
}

impl<K, S> Distribution<SingleValueConstraints> for SingleValueConstraintsDistribution<K, S>
where
    K: Distribution<SingleValueConstraintsKind>,
    S: Distribution<StringSchema>,
{
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> SingleValueConstraints {
        match self.kind.sample(rng) {
            SingleValueConstraintsKind::Null => SingleValueConstraints::Null,
            SingleValueConstraintsKind::Boolean => SingleValueConstraints::Boolean,
            SingleValueConstraintsKind::String => {
                SingleValueConstraints::String(self.string.sample(rng))
            }
            SingleValueConstraintsKind::Object => SingleValueConstraints::Object,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ValueConstraintsKind {
    Typed,
    // AnyOf,
}

#[derive(Debug)]
pub struct ValueConstraintsDistribution<K, S> {
    pub kind: K,
    pub typed: S,
    // pub number: N,
    // pub array: A,
}

impl<K, S> Distribution<ValueConstraints> for ValueConstraintsDistribution<K, S>
where
    K: Distribution<ValueConstraintsKind>,
    S: Distribution<SingleValueConstraints>,
{
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> ValueConstraints {
        match self.kind.sample(rng) {
            ValueConstraintsKind::Typed => {
                ValueConstraints::Typed(Box::new(self.typed.sample(rng)))
            } // ValueConstraintsKind::AnyOf => ValueConstraints::AnyOf(self.any_of.sample(rng)),
        }
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use core::error::Error;

    use super::*;
    use crate::seeding::{
        distributions::{
            WeightedChoose, constraints::string::tests::sample_string_schema_distribution,
        },
        test_utils::test_deterministic_distribution,
    };

    pub(crate) fn sample_single_value_constraints_distribution()
    -> Result<impl Distribution<SingleValueConstraints>, Box<dyn Error>> {
        Ok(SingleValueConstraintsDistribution {
            kind: WeightedChoose::new([
                (SingleValueConstraintsKind::Null, 1),
                (SingleValueConstraintsKind::Boolean, 1),
                (SingleValueConstraintsKind::String, 1),
                (SingleValueConstraintsKind::Object, 1),
            ])?,
            string: sample_string_schema_distribution()?,
        })
    }

    pub(crate) fn sample_value_constraints_distribution()
    -> Result<impl Distribution<ValueConstraints>, Box<dyn Error>> {
        Ok(ValueConstraintsDistribution {
            kind: WeightedChoose::new([
                (ValueConstraintsKind::Typed, 10),
                // (ValueConstraintsKind::AnyOf, 1),
            ])?,
            typed: sample_single_value_constraints_distribution()?,
        })
    }

    #[test]
    fn deterministic_constraints_distribution() -> Result<(), Box<dyn Error>> {
        test_deterministic_distribution(sample_single_value_constraints_distribution()?.map(
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
    fn deterministic_value_constraints_distribution() -> Result<(), Box<dyn Error>> {
        test_deterministic_distribution(sample_value_constraints_distribution()?.map(
            |constraints| {
                serde_json::to_string_pretty(&constraints)
                    .expect("should be able to serialize constraints")
            },
        ));
        Ok(())
    }
}

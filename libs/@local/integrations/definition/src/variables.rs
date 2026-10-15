use alloc::{boxed::Box, collections::BTreeMap};

use crate::name::VariableName;

/// Reports that two variable names differ only in ASCII case.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("`{variable}` and `{other}` differ only in case, so they name the same SQL parameter")]
pub struct ConflictingVariables {
    pub variable: VariableName,
    pub other: VariableName,
}

/// The values of a definition's `vars`, which SQL reads as `$NAME` parameters.
///
/// SQL matches parameter names without regard to ASCII case, so no two names differ only in ASCII
/// case.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Variables(BTreeMap<VariableName, Box<str>>);

impl TryFrom<BTreeMap<VariableName, Box<str>>> for Variables {
    type Error = ConflictingVariables;

    fn try_from(values: BTreeMap<VariableName, Box<str>>) -> Result<Self, Self::Error> {
        let mut lowercased = BTreeMap::new();
        for variable in values.keys() {
            let name: &str = variable.as_ref();
            if let Some(other) = lowercased.insert(name.to_ascii_lowercase(), variable) {
                return Err(ConflictingVariables {
                    variable: variable.clone(),
                    other: other.clone(),
                });
            }
        }
        Ok(Self(values))
    }
}

impl Variables {
    /// Returns the value of the variable `name`, compared without regard to ASCII case.
    #[must_use]
    pub fn get(&self, name: &str) -> Option<&str> {
        self.0
            .iter()
            .find(|(variable, _)| variable.matches(name))
            .map(|(_, value)| &**value)
    }
}

#[cfg(test)]
mod tests {
    use alloc::collections::BTreeMap;
    use core::str::FromStr as _;

    use super::{ConflictingVariables, Variables};
    use crate::name::VariableName;

    fn name(text: &str) -> VariableName {
        VariableName::from_str(text).expect("should be a valid variable name")
    }

    #[test]
    fn try_from_refuses_names_in_other_case() {
        assert_eq!(
            Variables::try_from(BTreeMap::from([
                (name("LIMIT"), "10".into()),
                (name("Limit"), "20".into()),
                (name("OFFSET"), "0".into()),
            ])),
            Err(ConflictingVariables {
                variable: name("Limit"),
                other: name("LIMIT"),
            }),
            "names that differ only in case should be refused"
        );
    }

    #[test]
    fn get_ignores_case() {
        let variables = Variables::try_from(BTreeMap::from([(name("Min_Seats"), "200".into())]))
            .expect("the variables should be valid");
        assert_eq!(
            variables.get("MIN_SEATS"),
            Some("200"),
            "a name in another case should find the variable"
        );
    }
}

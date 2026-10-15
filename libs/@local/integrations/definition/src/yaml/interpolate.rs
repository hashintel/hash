use alloc::{
    boxed::Box,
    collections::{BTreeMap, BTreeSet},
    string::String,
    vec::Vec,
};

use crate::{issue::IssueKind, name::VariableName};

/// The values of a definition's `vars`, which replace `${NAME}` placeholders outside SQL.
///
/// Values are inserted as written: a `${…}` or `$${` in a value is not replaced.
#[derive(Debug, Default)]
pub(super) struct Interpolation {
    values: BTreeMap<VariableName, Box<str>>,
    /// The values of declared names that are not valid variable names. Lowering reports each name
    /// at `vars`, and its placeholders are still replaced.
    invalid: BTreeMap<Box<str>, Box<str>>,
}

impl Interpolation {
    pub(super) fn insert(&mut self, name: VariableName, value: Box<str>) {
        self.values.insert(name, value);
    }

    /// Returns the values of the valid variable names.
    pub(super) fn into_values(self) -> BTreeMap<VariableName, Box<str>> {
        self.values
    }

    /// Records the value of a declared name that is not a valid variable name.
    pub(super) fn insert_invalid(&mut self, name: Box<str>, value: Box<str>) {
        self.invalid.insert(name, value);
    }

    /// Replaces every `${NAME}` in `text` with the value of `NAME`, and every `$${` with `${`.
    ///
    /// Names are compared without regard to ASCII case, as SQL parameter names are.
    ///
    /// The text is read from left to right, so `$$${NAME}` becomes `$${NAME}`: the first `$` is
    /// kept, and `$${` is an escape.
    ///
    /// Returns the replaced text and an issue for each placeholder that cannot be replaced:
    ///
    /// - [`UnknownVariable`] once for each name that no variable declares
    /// - [`UnterminatedPlaceholder`] if a `${` has no closing `}`. The returned text stops before
    ///   that `${`.
    ///
    /// [`UnknownVariable`]: IssueKind::UnknownVariable
    /// [`UnterminatedPlaceholder`]: IssueKind::UnterminatedPlaceholder
    pub(super) fn resolve(&self, text: &str) -> (String, Vec<IssueKind>) {
        let mut resolved = String::with_capacity(text.len());
        let mut issues = Vec::new();
        let mut unknown = BTreeSet::new();
        let mut rest = text;

        while let Some((before, after_dollar)) = rest.split_once('$') {
            resolved.push_str(before);

            if let Some(after) = after_dollar.strip_prefix("${") {
                resolved.push_str("${");
                rest = after;
            } else if let Some(after) = after_dollar.strip_prefix('{') {
                let Some((name, remainder)) = after.split_once('}') else {
                    issues.push(IssueKind::UnterminatedPlaceholder);
                    return (resolved, issues);
                };
                let value = self
                    .values
                    .iter()
                    .find(|(variable, _)| variable.matches(name))
                    .map(|(_, value)| value)
                    .or_else(|| self.invalid.get(name));
                match value {
                    Some(value) => resolved.push_str(value),
                    None => {
                        if unknown.insert(name) {
                            issues.push(IssueKind::UnknownVariable { name: name.into() });
                        }
                    }
                }
                rest = remainder;
            } else {
                resolved.push('$');
                rest = after_dollar;
            }
        }

        resolved.push_str(rest);
        (resolved, issues)
    }
}

#[cfg(test)]
mod tests {
    use alloc::{borrow::ToOwned as _, vec::Vec};

    use super::Interpolation;
    use crate::{issue::IssueKind, name::VariableName};

    fn name(text: &str) -> VariableName {
        text.parse().expect("should be a valid variable name")
    }

    #[test]
    fn resolve_escape() {
        let mut variables = Interpolation::default();
        variables.insert(name("X"), "value".into());
        for (text, resolved) in [
            ("SELECT '$${x}'", "SELECT '${x}'"),
            ("$$${X}", "$${X}"),
            ("$$ and $", "$$ and $"),
            ("$${X} ${X}", "${X} value"),
        ] {
            assert_eq!(
                variables.resolve(text),
                (resolved.to_owned(), Vec::new()),
                "`{text}` should resolve to `{resolved}`"
            );
        }
    }

    #[test]
    fn resolve_ignores_case() {
        let mut variables = Interpolation::default();
        variables.insert(name("Region"), "eu".into());
        assert_eq!(
            variables.resolve("${REGION}"),
            ("eu".to_owned(), Vec::new()),
            "a placeholder should match a variable in another case"
        );
    }

    #[test]
    fn resolve_value_not_reinterpolated() {
        let mut variables = Interpolation::default();
        variables.insert(name("A"), "${B}".into());
        assert_eq!(
            variables.resolve("${A}"),
            ("${B}".to_owned(), Vec::new()),
            "a variable's value should be used as written"
        );
    }

    #[test]
    fn resolve_unknown_variables() {
        let (_, issues) = Interpolation::default().resolve("${A} and ${B}");
        assert_eq!(
            issues,
            [
                IssueKind::UnknownVariable { name: "A".into() },
                IssueKind::UnknownVariable { name: "B".into() },
            ],
            "each unknown variable should be reported"
        );
    }

    #[test]
    fn resolve_repeated_unknown_variable() {
        let (_, issues) = Interpolation::default().resolve("${A}-${A}");
        assert_eq!(
            issues,
            [IssueKind::UnknownVariable { name: "A".into() }],
            "an unknown variable used twice in one text should be reported once"
        );
    }

    #[test]
    fn resolve_invalid_declared_name() {
        let mut variables = Interpolation::default();
        variables.insert_invalid("my-var".into(), "value".into());
        assert_eq!(
            variables.resolve("${my-var}"),
            ("value".to_owned(), Vec::new()),
            "a placeholder naming an invalid declared name should be replaced and not reported"
        );
    }
}

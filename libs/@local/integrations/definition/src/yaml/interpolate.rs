use alloc::{borrow::ToOwned as _, collections::BTreeMap, string::String};

use crate::issue::IssueKind;

/// The values of a definition's `vars`, which replace `${NAME}` placeholders.
///
/// Values are used as written. They cannot contain placeholders themselves. `$${` stands for a
/// literal `${`.
#[derive(Debug, Default)]
pub(super) struct Variables(BTreeMap<String, String>);

impl Variables {
    pub(super) fn insert(&mut self, name: String, value: String) {
        self.0.insert(name, value);
    }

    /// Replaces every `${NAME}` in `text` with the value of `NAME`, and every `$${` with `${`.
    ///
    /// The text is read from left to right, so `$$${NAME}` becomes `$${NAME}`: the first `$` is
    /// kept, and `$${` is an escape.
    ///
    /// # Errors
    ///
    /// - [`UnknownVariable`] for the first placeholder that names no variable
    /// - [`UnterminatedPlaceholder`] if a `${` has no closing `}`
    ///
    /// [`UnknownVariable`]: IssueKind::UnknownVariable
    /// [`UnterminatedPlaceholder`]: IssueKind::UnterminatedPlaceholder
    pub(super) fn resolve(&self, text: &str) -> Result<String, IssueKind> {
        let mut resolved = String::with_capacity(text.len());
        let mut rest = text;

        while let Some((before, after_dollar)) = rest.split_once('$') {
            resolved.push_str(before);

            if let Some(after) = after_dollar.strip_prefix("${") {
                resolved.push_str("${");
                rest = after;
            } else if let Some(after) = after_dollar.strip_prefix('{') {
                let (name, remainder) = after
                    .split_once('}')
                    .ok_or(IssueKind::UnterminatedPlaceholder)?;
                let value = self.0.get(name).ok_or_else(|| IssueKind::UnknownVariable {
                    name: name.to_owned(),
                })?;
                resolved.push_str(value);
                rest = remainder;
            } else {
                resolved.push('$');
                rest = after_dollar;
            }
        }

        resolved.push_str(rest);
        Ok(resolved)
    }
}

#[cfg(test)]
mod tests {
    use alloc::borrow::ToOwned as _;

    use super::Variables;

    #[test]
    fn resolve_escape() {
        let mut variables = Variables::default();
        variables.insert("X".to_owned(), "value".to_owned());
        for (text, resolved) in [
            ("SELECT '$${x}'", "SELECT '${x}'"),
            ("$$${X}", "$${X}"),
            ("$$ and $", "$$ and $"),
            ("$${X} ${X}", "${X} value"),
        ] {
            assert_eq!(
                variables.resolve(text),
                Ok(resolved.to_owned()),
                "`{text}` should resolve to `{resolved}`"
            );
        }
    }

    #[test]
    fn resolve_value_not_reinterpolated() {
        let mut variables = Variables::default();
        variables.insert("A".to_owned(), "${B}".to_owned());
        assert_eq!(
            variables.resolve("${A}"),
            Ok("${B}".to_owned()),
            "a variable's value should be used as written"
        );
    }
}

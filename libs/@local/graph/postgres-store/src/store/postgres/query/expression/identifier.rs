use alloc::borrow::Cow;
use core::fmt::{self, Write as _};

use crate::store::postgres::query::Transpile;

/// A PostgreSQL identifier (table name, column name, alias, schema name, etc.).
///
/// Identifiers are **always** quoted using double quotes (`"`) when transpiled to SQL. This
/// ensures:
/// - Protection against SQL injection
/// - Correct handling of SQL reserved keywords (e.g., `user`, `select`)
/// - Support for identifiers with special characters
/// - Preservation of case-sensitivity
///
/// Internal double quotes are escaped by doubling them (`""`) as per PostgreSQL's standard.
#[derive(Clone, PartialEq, Eq, Hash)]
pub struct Identifier<'name> {
    name: Cow<'name, str>,
}

impl fmt::Debug for Identifier<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.transpile(fmt)
    }
}

impl<'name> From<&'name str> for Identifier<'name> {
    fn from(name: &'name str) -> Self {
        Self {
            name: Cow::Borrowed(name),
        }
    }
}

impl From<String> for Identifier<'_> {
    fn from(identifier: String) -> Self {
        Self {
            name: Cow::Owned(identifier),
        }
    }
}

impl AsRef<str> for Identifier<'_> {
    fn as_ref(&self) -> &str {
        &self.name
    }
}

impl Transpile for Identifier<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_char('"')?;
        for ch in self.name.chars() {
            if ch == '"' {
                fmt.write_str("\"\"")?;
            } else {
                fmt.write_char(ch)?;
            }
        }
        fmt.write_char('"')
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simple_identifier() {
        let id = Identifier::from("users");
        assert_eq!(id.transpile_to_string(), r#""users""#);
    }

    #[test]
    fn keyword_identifier() {
        let id = Identifier::from("select");
        assert_eq!(id.transpile_to_string(), r#""select""#);

        let id = Identifier::from("user");
        assert_eq!(id.transpile_to_string(), r#""user""#);

        let id = Identifier::from("table");
        assert_eq!(id.transpile_to_string(), r#""table""#);
    }

    #[test]
    fn identifier_with_special_chars() {
        let id = Identifier::from("my-table");
        assert_eq!(id.transpile_to_string(), r#""my-table""#);

        let id = Identifier::from("table name");
        assert_eq!(id.transpile_to_string(), r#""table name""#);

        let id = Identifier::from("123abc");
        assert_eq!(id.transpile_to_string(), r#""123abc""#);
    }

    #[test]
    fn identifier_with_quotes() {
        // Single internal quote: my"table → "my""table"
        let id = Identifier::from(r#"my"table"#);
        assert_eq!(id.transpile_to_string(), r#""my""table""#);

        // Multiple internal quotes: a"b"c → "a""b""c"
        let id = Identifier::from(r#"a"b"c"#);
        assert_eq!(id.transpile_to_string(), r#""a""b""c""#);

        // Just a quote: " → """"
        let id = Identifier::from(r#"""#);
        assert_eq!(id.transpile_to_string(), r#""""""#);
    }

    #[test]
    fn case_sensitive_identifier() {
        let id = Identifier::from("UsErS");
        assert_eq!(id.transpile_to_string(), r#""UsErS""#);

        let id = Identifier::from("USERS");
        assert_eq!(id.transpile_to_string(), r#""USERS""#);
    }

    #[test]
    fn empty_identifier() {
        let id = Identifier::from("");
        assert_eq!(id.transpile_to_string(), r#""""#);
    }

    #[test]
    #[expect(clippy::non_ascii_literal)]
    fn unicode_identifier() {
        let id = Identifier::from("用户表"); // "user table" in Chinese
        assert_eq!(id.transpile_to_string(), r#""用户表""#);

        let id = Identifier::from("café");
        assert_eq!(id.transpile_to_string(), r#""café""#);
    }
}

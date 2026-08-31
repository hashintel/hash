use alloc::borrow::Cow;
#[cfg(feature = "postgres")]
use core::error::Error;
use core::fmt::{self, Write};

#[cfg(feature = "postgres")]
use bytes::BytesMut;
#[cfg(feature = "postgres")]
use postgres_types::{IsNull, ToSql, Type};
use serde::{Deserialize, Serialize, Serializer};

/// A single component in a JSON path.
///
/// Represents either a field access by name or an array index access.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Deserialize)]
#[serde(untagged)]
pub enum PathToken<'p> {
    Field(Cow<'p, str>),
    Index(usize),
}

/// A JSON path expression for navigating JSON data structures.
///
/// Represents a path through nested JSON objects and arrays using dot notation
/// for field access and bracket notation for array indices. Paths always start
/// with a `$` root indicator.
///
/// # Examples
///
/// ```
/// use std::borrow::Cow;
///
/// use hash_graph_store::filter::{JsonPath, PathToken};
///
/// // Create a path for $.users[0].name
/// let path = JsonPath::from_path_tokens(vec![
///     PathToken::Field(Cow::Borrowed("users")),
///     PathToken::Index(0),
///     PathToken::Field(Cow::Borrowed("name")),
/// ]);
///
/// assert_eq!(path.to_string(), r#"$."users"[0]."name""#);
/// ```
#[derive(Clone, PartialEq, Eq, Hash)]
pub struct JsonPath<'p> {
    path: Vec<PathToken<'p>>,
}

impl<'p> JsonPath<'p> {
    /// Creates a new empty JSON path.
    #[must_use]
    pub const fn new() -> Self {
        Self { path: Vec::new() }
    }

    /// Creates a new JSON path from a sequence of path tokens.
    #[must_use]
    pub const fn from_path_tokens(path: Vec<PathToken<'p>>) -> Self {
        Self { path }
    }

    /// Appends a path token to the end of this JSON path.
    pub fn push(&mut self, token: PathToken<'p>) {
        self.path.push(token);
    }

    /// Returns a reference to the path tokens.
    #[must_use]
    pub fn path_tokens(&self) -> &[PathToken<'p>] {
        &self.path
    }

    fn write(&self, writer: &mut impl Write) -> Result<(), fmt::Error> {
        writer.write_char('$')?;
        for token in &self.path {
            match token {
                PathToken::Field(field) => {
                    write!(writer, ".\"{}\"", field.replace('"', "\\\""))?;
                }
                PathToken::Index(index) => {
                    write!(writer, "[{index}]")?;
                }
            }
        }
        Ok(())
    }

    /// Converts this JSON path into an owned version with `'static` lifetime.
    #[must_use]
    pub fn into_owned(self) -> JsonPath<'static> {
        JsonPath {
            path: self
                .path
                .into_iter()
                .map(|token| match token {
                    PathToken::Field(field) => PathToken::Field(Cow::Owned(field.into_owned())),
                    PathToken::Index(index) => PathToken::Index(index),
                })
                .collect(),
        }
    }
}

impl Default for JsonPath<'_> {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Debug for JsonPath<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_char('\'')?;
        self.write(fmt)?;
        fmt.write_char('\'')
    }
}

impl fmt::Display for JsonPath<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.write(fmt)
    }
}

impl Serialize for JsonPath<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[cfg(feature = "postgres")]
impl ToSql for JsonPath<'_> {
    // Ideally, we want to accept `JSONPATH`, but that requires a special format, which we don't
    // know, so we accept `TEXT` instead and have to cast it to `JSONPATH` in postgres.
    postgres_types::accepts!(TEXT);

    postgres_types::to_sql_checked!();

    fn to_sql(&self, _: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        self.write(out)?;
        Ok(IsNull::No)
    }
}

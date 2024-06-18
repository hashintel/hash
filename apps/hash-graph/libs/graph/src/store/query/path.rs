use alloc::borrow::Cow;
use core::{error::Error, fmt, fmt::Write};

use bytes::BytesMut;
use postgres_types::{IsNull, ToSql, Type};
use serde::{Deserialize, Serialize, Serializer};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Deserialize)]
#[serde(untagged)]
pub enum PathToken<'p> {
    Field(Cow<'p, str>),
    Index(usize),
}

#[derive(Clone, PartialEq, Eq, Hash)]
pub struct JsonPath<'p> {
    path: Vec<PathToken<'p>>,
}

impl<'p> JsonPath<'p> {
    #[must_use]
    pub const fn from_path_tokens(path: Vec<PathToken<'p>>) -> Self {
        Self { path }
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

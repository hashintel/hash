use std::{error::Error, fmt, ops::Not, str::FromStr};

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use error_stack::{bail, IntoReport, Report, Result, ResultExt};
use futures::{future::BoxFuture, FutureExt};
use serde::{Deserialize, Serialize};
use type_system::uri::VersionedUri;

use crate::knowledge::EntityId;

#[derive(Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Literal {
    // TODO: Avoid cloning
    //   see https://app.asana.com/0/0/1202884883200947/f
    String(String),
    Float(f64),
    // TODO: Support Integer
    //   see https://app.asana.com/0/0/1202884883200973/f
    Bool(bool),
    Null,
    List(Vec<Self>),
    // TODO: Object
    /// Internal representation for a version
    #[serde(skip)]
    Version(Version, bool),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Version {
    Ontology(u32),
    Entity(DateTime<Utc>),
}

impl fmt::Display for Version {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Ontology(version) => fmt::Display::fmt(version, fmt),
            Self::Entity(version) => fmt::Display::fmt(version, fmt),
        }
    }
}

impl fmt::Debug for Literal {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::String(string) => fmt::Debug::fmt(string, fmt),
            Self::Float(float) => fmt::Debug::fmt(float, fmt),
            Self::Bool(bool) => fmt::Debug::fmt(bool, fmt),
            Self::Null => fmt.write_str("null"),
            Self::List(list) => fmt::Debug::fmt(list, fmt),
            Self::Version(version, latest) => write!(fmt, "({version}, latest={latest})"),
        }
    }
}

fn compare(lhs: &Literal, rhs: &Literal) -> Result<bool, ExpressionError> {
    Ok(match (lhs, rhs) {
        // Primitive types
        (Literal::String(lhs), Literal::String(rhs)) => lhs == rhs,
        (Literal::Float(lhs), Literal::Float(rhs)) => (lhs - rhs).abs() < f64::EPSILON,
        (Literal::Bool(lhs), Literal::Bool(rhs)) => lhs == rhs,

        // List comparisons
        (Literal::List(lhs), Literal::List(rhs)) => {
            lhs.len() == rhs.len()
                && lhs
                    .iter()
                    .zip(rhs)
                    .try_find(|(lhs, rhs)| compare(lhs, rhs).map(Not::not))?
                    .is_none()
        }
        // TODO: Implement function `contains` or `find`
        //   see https://app.asana.com/0/0/1202884883200944/f
        (Literal::List(lhs), rhs) => lhs.iter().try_find(|lhs| compare(lhs, rhs))?.is_some(),
        (lhs, Literal::List(rhs)) => rhs.iter().try_find(|rhs| compare(lhs, rhs))?.is_some(),

        // Version
        // ontology == float
        (Literal::Version(Version::Ontology(version), _), Literal::Float(literal))
        | (Literal::Float(literal), Literal::Version(Version::Ontology(version), _)) => {
            *version == *literal as u32
        }
        // entity == float
        (Literal::Version(Version::Entity(version), _), Literal::Float(literal))
        | (Literal::Float(literal), Literal::Version(Version::Entity(version), _)) => {
            version.timestamp() == *literal as i64
        }
        // entity == latest
        (Literal::Version(_, latest), Literal::String(literal))
        | (Literal::String(literal), Literal::Version(_, latest))
            if literal == "latest" =>
        {
            *latest
        }
        // entity == date time
        (Literal::Version(Version::Entity(version), _), Literal::String(literal))
        | (Literal::String(literal), Literal::Version(Version::Entity(version), _)) => {
            DateTime::<Utc>::from_str(literal)
                .map(|date_time| date_time == *version)
                .into_report()
                .attach_printable_lazy(|| format!("cannot parse {rhs:?} as version"))
                .change_context(ExpressionError)?
        }
        // version == version
        (Literal::Version(lhs, _), Literal::Version(rhs, _)) => lhs == rhs,

        // anything compared to null (except null) will return `false`
        (Literal::Null, Literal::Null) => true,
        (Literal::Null, _) | (_, Literal::Null) => false,

        // unmatched
        (lhs, rhs) => {
            bail!(
                Report::new(ExpressionError)
                    .attach_printable(format!("cannot compare `{lhs:?}` and `{rhs:?}`"))
            )
        }
    })
}

impl From<serde_json::Value> for Literal {
    fn from(value: serde_json::Value) -> Self {
        use serde_json::Value;

        match value {
            Value::Null => Self::Null,
            Value::Bool(bool) => Self::Bool(bool),
            // TODO: Support Integer to avoid potential panic
            //   see https://app.asana.com/0/0/1202884883200973/f
            Value::Number(number) => number.as_f64().map_or_else(
                || panic!("Could not parse {number} as literal"),
                Self::Float,
            ),
            Value::String(string) => Self::String(string),
            Value::Array(list) => Self::List(list.into_iter().map(From::from).collect()),
            Value::Object(_) => todo!("{}", UNIMPLEMENTED_LITERAL_OBJECT),
        }
    }
}

type Identifier = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(transparent)]
pub struct PathSegment {
    pub identifier: Identifier,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Path {
    pub segments: Vec<PathSegment>,
}

impl fmt::Display for Path {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(
            &self
                .segments
                .iter()
                .map(|segment| segment.identifier.as_str())
                .collect::<Vec<_>>()
                .join("."),
            fmt,
        )
    }
}

// TODO: DOC: Write documentation for the AST
//   see https://app.asana.com/0/0/1202884883200976/f
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Expression {
    Eq(Vec<Expression>),
    Ne(Vec<Expression>),
    All(Vec<Expression>),
    Any(Vec<Expression>),
    Literal(Literal),
    Path(Path),
    Field(Identifier),
}

impl Default for Expression {
    fn default() -> Self {
        Self::Literal(Literal::Bool(true))
    }
}

impl Expression {
    #[must_use]
    pub fn for_versioned_uri(uri: &VersionedUri) -> Self {
        Self::Eq(vec![
            Self::Path(Path {
                segments: vec![PathSegment {
                    identifier: "versionedUri".to_owned(),
                }],
            }),
            Self::Literal(Literal::String(uri.to_string())),
        ])
    }

    #[must_use]
    pub fn for_latest_version() -> Self {
        Self::Eq(vec![
            Self::Path(Path {
                segments: vec![PathSegment {
                    identifier: "version".to_owned(),
                }],
            }),
            Self::Literal(Literal::String("latest".to_owned())),
        ])
    }

    #[must_use]
    pub fn for_latest_entity_id(id: EntityId) -> Self {
        Self::All(vec![
            Self::for_latest_version(),
            Self::Eq(vec![
                Self::Path(Path {
                    segments: vec![PathSegment {
                        identifier: "id".to_owned(),
                    }],
                }),
                Self::Literal(Literal::String(id.to_string())),
            ]),
        ])
    }

    #[must_use]
    pub fn for_link_by_source_entity_id(id: EntityId) -> Self {
        Self::Eq(vec![
            Self::Path(Path {
                segments: vec![
                    PathSegment {
                        identifier: "source".to_owned(),
                    },
                    PathSegment {
                        identifier: "id".to_owned(),
                    },
                ],
            }),
            Self::Literal(Literal::String(id.to_string())),
        ])
    }
}

#[derive(Debug)]
pub struct ExpressionError;

impl fmt::Display for ExpressionError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("evaluation of expression failed")
    }
}

impl Error for ExpressionError {}

impl Expression {
    #[expect(clippy::missing_panics_doc, reason = "Not implemented yet")]
    pub fn evaluate<'a, R, C>(
        &'a self,
        resolver: &'a R,
        context: &'a C,
    ) -> BoxFuture<Result<Literal, ExpressionError>>
    where
        R: Resolve<C> + Sync,
        C: Sync,
    {
        async move {
            Ok(match self {
                Self::Eq(expressions) => {
                    for expression in expressions.windows(2) {
                        if !compare(
                            &expression[0].evaluate(resolver, context).await?,
                            &expression[1].evaluate(resolver, context).await?,
                        )? {
                            return Ok(Literal::Bool(false));
                        }
                    }
                    Literal::Bool(true)
                }
                Self::Ne(expressions) => {
                    for expression in expressions.windows(2) {
                        if compare(
                            &expression[0].evaluate(resolver, context).await?,
                            &expression[1].evaluate(resolver, context).await?,
                        )? {
                            return Ok(Literal::Bool(false));
                        }
                    }
                    Literal::Bool(true)
                }
                Self::All(expressions) => {
                    for expression in expressions {
                        match expression.evaluate(resolver, context).await? {
                            Literal::Bool(true) => continue,
                            literal @ Literal::Bool(false) => return Ok(literal),
                            literal => bail!(
                                Report::new(ExpressionError)
                                    .attach_printable(format!("not a boolean: {literal:?}"))
                            ),
                        }
                    }
                    Literal::Bool(true)
                }
                Self::Any(expressions) => {
                    for expression in expressions {
                        match expression.evaluate(resolver, context).await? {
                            Literal::Bool(false) => continue,
                            literal @ Literal::Bool(true) => return Ok(literal),
                            literal => bail!(
                                Report::new(ExpressionError)
                                    .attach_printable(format!("not a boolean: {literal:?}"))
                            ),
                        }
                    }
                    Literal::Bool(false)
                }
                Self::Literal(literal) => literal.clone(),
                Self::Path(path) => resolver
                    .resolve(&path.segments, context)
                    .await
                    .change_context(ExpressionError)?,
                Self::Field(_) => todo!("{}", UNIMPLEMENTED_LITERAL_OBJECT),
            })
        }
        .boxed()
    }
}

// TODO: Split these errors into structs
#[derive(Debug)]
pub enum ResolveError {
    EmptyPath { literal: Literal },
    CannotIndex { path: Path, literal: Literal },
    OutOfBounds { index: usize, list: Vec<Literal> },
    StoreReadError,
    Custom,
}

impl fmt::Display for ResolveError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyPath { literal } => write!(fmt, "empty path when resolving `{literal:?}`"),
            Self::CannotIndex { path, literal } => {
                write!(fmt, "cannot index `{literal:?}` with path `{path}`")
            }
            Self::StoreReadError => fmt.write_str("could not read data from store"),
            Self::OutOfBounds { index, list } => {
                write!(
                    fmt,
                    "index out of bounds, requested index was `{index}`, but only a length of `{}`",
                    list.len()
                )
            }
            Self::Custom => write!(fmt, "Could not resolve the query"),
        }
    }
}

impl Error for ResolveError {}

pub const UNIMPLEMENTED_LITERAL_OBJECT: &str =
    "`Literal::Object` is not implemented yet, see https://app.asana.com/0/0/1202884883200943/f";
pub const UNIMPLEMENTED_WILDCARDS: &str =
    "fine-grained wildcards are not implemented yet, see https://app.asana.com/0/0/1202884883200970/f";

#[async_trait]
pub trait Resolve<C: ?Sized> {
    async fn resolve(&self, path: &[PathSegment], context: &C) -> Result<Literal, ResolveError>;
}

#[async_trait]
impl<C> Resolve<C> for Literal
where
    C: Sync + ?Sized,
{
    async fn resolve(&self, path: &[PathSegment], context: &C) -> Result<Self, ResolveError> {
        match path {
            [] => Ok(self.clone()),
            [head_path_segment, tail_path_segments @ ..] => match self {
                Self::List(values) => {
                    let index: usize = head_path_segment
                        .identifier
                        .parse()
                        .expect("path needs to be an unsigned integer");
                    let literal = values.get(index).ok_or_else(|| {
                        Report::new(ResolveError::OutOfBounds {
                            index,
                            list: values.clone(),
                        })
                    })?;
                    literal.resolve(tail_path_segments, context).await
                }
                literal => bail!(ResolveError::CannotIndex {
                    path: Path {
                        segments: path.to_vec(),
                    },
                    literal: literal.clone(),
                }),
            },
        }
    }
}

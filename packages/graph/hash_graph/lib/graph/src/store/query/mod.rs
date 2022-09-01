mod knowledge;
mod ontology;

use std::{error::Error, fmt, ops::Not};

use async_trait::async_trait;
use error_stack::{bail, Report, Result, ResultExt};
use futures::{future::BoxFuture, FutureExt};
use serde::{Deserialize, Serialize};
use type_system::uri::VersionedUri;

pub use self::{
    knowledge::{EntityQuery, EntityVersion, LinkQuery},
    ontology::{EntityTypeQuery, LinkTypeQuery, OntologyQuery, OntologyVersion},
};

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
    Version(u32, bool),
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
        (Literal::Null, Literal::Null) => true,

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
        (Literal::Version(lhs, _), Literal::Float(rhs)) => *lhs == *rhs as u32,
        (Literal::Float(lhs), Literal::Version(rhs, _)) => *lhs as u32 == *rhs,
        (Literal::String(lhs), Literal::Version(_, latest)) if lhs == "latest" => *latest,
        (Literal::Version(_, latest), Literal::String(rhs)) if rhs == "latest" => *latest,

        // unmatched
        (lhs, rhs) => {
            bail!(
                Report::new(ExpressionError)
                    .attach_printable(format!("unsupported operation: {lhs:?} == {rhs:?}"))
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
            Value::Object(_) => todo!("{}", ResolveError::UNIMPLEMENTED_LITERAL_OBJECT),
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

impl Expression {
    #[must_use]
    pub fn for_versioned_uri(uri: &VersionedUri) -> Self {
        Self::All(vec![
            Self::Eq(vec![
                Self::Path(Path {
                    segments: vec![PathSegment {
                        identifier: "version".to_owned(),
                    }],
                }),
                Self::Literal(Literal::Float(f64::from(uri.version()))),
            ]),
            Self::Eq(vec![
                Self::Path(Path {
                    segments: vec![PathSegment {
                        identifier: "uri".to_owned(),
                    }],
                }),
                Self::Literal(Literal::String(uri.base_uri().to_string())),
            ]),
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
                Expression::Eq(expressions) => {
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
                Expression::Ne(expressions) => {
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
                Expression::All(expressions) => {
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
                Expression::Any(expressions) => {
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
                Expression::Literal(literal) => literal.clone(),
                Expression::Path(path) => resolver
                    .resolve(&path.segments, context)
                    .await
                    .change_context(ExpressionError)?,
                Expression::Field(_) => bail!(
                    Report::new(ResolveError::UNIMPLEMENTED_LITERAL_OBJECT)
                        .change_context(ExpressionError)
                ),
            })
        }
        .boxed()
    }
}

#[derive(Debug)]
pub enum ResolveError {
    Unimplemented {
        description: &'static str,
        issue: &'static str,
    },
    EmptyPath {
        literal: Literal,
    },
    CannotIndex {
        path: Path,
        literal: Literal,
    },
    StoreReadError,
}

impl fmt::Display for ResolveError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unimplemented { description, issue } => write!(fmt, "{description}, see {issue}"),
            Self::EmptyPath { literal } => write!(fmt, "empty path when resolving `{literal:?}`"),
            Self::CannotIndex { path, literal } => {
                write!(fmt, "cannot index `{literal:?}` with path `{path}`")
            }
            Self::StoreReadError => fmt.write_str("could not read data from store"),
        }
    }
}

impl Error for ResolveError {}

impl ResolveError {
    pub const UNIMPLEMENTED_LITERAL_OBJECT: Self = Self::Unimplemented {
        description: "`Literal::Object` is not implemented yet",
        issue: "https://app.asana.com/0/0/1202884883200943/f",
    };
    pub const UNIMPLEMENTED_WILDCARDS: Self = Self::Unimplemented {
        description: "fine-grained wildcards are not implemented yet",
        issue: "https://app.asana.com/0/0/1202884883200970/f",
    };
}

#[async_trait]
pub trait Resolve<C> {
    async fn resolve(&self, path: &[PathSegment], context: &C) -> Result<Literal, ResolveError>;
}

#[async_trait]
impl<C> Resolve<C> for Literal
where
    C: Sync,
{
    async fn resolve(&self, path: &[PathSegment], context: &C) -> Result<Literal, ResolveError> {
        // TODO: Support `Literal::Object`
        //   see https://app.asana.com/0/0/1202884883200943/f
        match self {
            Literal::List(values) => match path {
                [] => bail!(ResolveError::EmptyPath {
                    literal: self.clone()
                }),
                [segment, segments @ ..] => {
                    let index: usize = segment
                        .identifier
                        .parse()
                        .expect("path needs to be an unsigned integer");
                    let literal = values.get(index).expect("index out of bounds");
                    if segments.is_empty() {
                        Ok(literal.clone())
                    } else {
                        literal.resolve(segments, context).await
                    }
                }
            },
            literal => bail!(ResolveError::CannotIndex {
                path: Path {
                    segments: path.to_vec(),
                },
                literal: literal.clone(),
            }),
        }
    }
}

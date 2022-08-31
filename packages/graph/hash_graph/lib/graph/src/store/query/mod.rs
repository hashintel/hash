mod knowledge;
mod ontology;

use async_trait::async_trait;
use futures::{future::BoxFuture, FutureExt};
use serde::{Deserialize, Serialize};
use type_system::uri::VersionedUri;

pub use self::{
    knowledge::{EntityQuery, EntityVersion, LinkQuery},
    ontology::{EntityTypeQuery, LinkTypeQuery, OntologyQuery, OntologyVersion},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
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

fn compare(lhs: &Literal, rhs: &Literal) -> bool {
    match (lhs, rhs) {
        // Primitive types
        (Literal::String(lhs), Literal::String(rhs)) => lhs == rhs,
        (Literal::Float(lhs), Literal::Float(rhs)) => (lhs - rhs).abs() < f64::EPSILON,
        (Literal::Bool(lhs), Literal::Bool(rhs)) => lhs == rhs,
        (Literal::Null, Literal::Null) => true,

        // List comparisons
        (Literal::List(lhs), Literal::List(rhs)) => {
            lhs.len() == rhs.len() && lhs.iter().zip(rhs).all(|(lhs, rhs)| compare(lhs, rhs))
        }
        // TODO: Implement function `contains`
        //   see https://app.asana.com/0/0/1202884883200944/f
        (Literal::List(lhs), rhs) => lhs.iter().any(|literal| compare(literal, rhs)),
        (lhs, Literal::List(rhs)) => rhs.iter().any(|literal| compare(lhs, literal)),

        // Version
        (Literal::Version(lhs, _), Literal::Float(rhs)) => *lhs == *rhs as u32,
        (Literal::Float(lhs), Literal::Version(rhs, _)) => *lhs as u32 == *rhs,
        (Literal::String(lhs), Literal::Version(_, latest)) if lhs == "latest" => *latest,
        (Literal::Version(_, latest), Literal::String(rhs)) if rhs == "latest" => *latest,

        // unmatched
        (lhs, rhs) => {
            tracing::warn!("unsupported operation: {lhs:?} == {rhs:?}");
            false
        }
    }
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
            Value::Object(_) => {
                // see: https://app.asana.com/0/0/1202884883200943/f
                todo!("`Literal::Object`")
            }
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

impl Expression {
    // TODO: Implement error handling
    //   see https://app.asana.com/0/0/1202884883200968/f
    #[expect(clippy::missing_panics_doc, reason = "Error handling not applied yet")]
    pub fn evaluate<'a, R, C>(&'a self, resolver: &'a R, context: &'a C) -> BoxFuture<Literal>
    where
        R: Resolve<C> + Sync,
        C: Sync,
    {
        async move {
            match self {
                Expression::Eq(expressions) => {
                    for expression in expressions.windows(2) {
                        if !compare(
                            &expression[0].evaluate(resolver, context).await,
                            &expression[1].evaluate(resolver, context).await,
                        ) {
                            return Literal::Bool(false);
                        }
                    }
                    Literal::Bool(true)
                }
                Expression::Ne(expressions) => {
                    for expression in expressions.windows(2) {
                        if compare(
                            &expression[0].evaluate(resolver, context).await,
                            &expression[1].evaluate(resolver, context).await,
                        ) {
                            return Literal::Bool(false);
                        }
                    }
                    Literal::Bool(true)
                }
                Expression::All(expressions) => {
                    for expression in expressions {
                        match expression.evaluate(resolver, context).await {
                            Literal::Bool(true) => continue,
                            literal @ Literal::Bool(false) => return literal,
                            literal => panic!("Not a boolean: {literal:?}"),
                        }
                    }
                    Literal::Bool(true)
                }
                Expression::Any(expressions) => {
                    for expression in expressions {
                        match expression.evaluate(resolver, context).await {
                            Literal::Bool(false) => continue,
                            literal @ Literal::Bool(true) => return literal,
                            literal => panic!("Not a boolean: {literal:?}"),
                        }
                    }
                    Literal::Bool(false)
                }
                Expression::Literal(literal) => literal.clone(),
                Expression::Path(path) => resolver.resolve(&path.segments, context).await,
                Expression::Field(_identifier) => {
                    // see https://app.asana.com/0/0/1202884883200943/f
                    todo!("`Literal::Object`")
                }
            }
        }
        .boxed()
    }
}

/// Resolves this types into a [`Literal`].
// TODO: DOC
//   see https://app.asana.com/0/0/1202884883200976/f
#[async_trait]
pub trait Resolve<C> {
    // TODO: Implement error handling
    //   see https://app.asana.com/0/0/1202884883200968/f
    async fn resolve(&self, path: &[PathSegment], context: &C) -> Literal;
}

#[async_trait]
impl<C> Resolve<C> for Literal
where
    C: Sync,
{
    async fn resolve(&self, path: &[PathSegment], context: &C) -> Literal {
        // TODO: Support `Literal::Object`
        //   see https://app.asana.com/0/0/1202884883200943/f
        match self {
            Literal::List(values) => match path {
                [] => panic!("Path is empty"),
                [segment, segments @ ..] => {
                    let index: usize = segment
                        .identifier
                        .parse()
                        .expect("path needs to be an unsigned integer");
                    let literal = values.get(index).expect("index out of bounds");
                    if segments.is_empty() {
                        literal.clone()
                    } else {
                        literal.resolve(segments, context).await
                    }
                }
            },
            literal => panic!("Cannot index a {literal:?}"),
        }
    }
}

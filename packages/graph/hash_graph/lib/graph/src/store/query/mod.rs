mod knowledge;
mod ontology;

use async_trait::async_trait;
use error_stack::Result;
use futures::{future::BoxFuture, FutureExt};
use serde::{Deserialize, Serialize};

pub use self::{
    knowledge::{EntityQuery, EntityVersion, LinkQuery},
    ontology::{
        DataTypeQuery, EntityTypeQuery, LinkTypeQuery, OntologyQuery, OntologyVersion,
        PropertyTypeQuery,
    },
};
use crate::store::QueryError;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Literal {
    String(String),
    Float(f64),
    Bool(bool),
    Null,
    List(Vec<Self>),
    /// Internal representation for a version
    #[serde(skip)]
    Version(u32, bool),
}

fn compare(lhs: &Literal, rhs: &Literal) -> bool {
    match (lhs, rhs) {
        (Literal::String(lhs), Literal::String(rhs)) => lhs == rhs,
        (Literal::Float(lhs), Literal::Float(rhs)) => (lhs - rhs).abs() < f64::EPSILON,
        (Literal::Bool(lhs), Literal::Bool(rhs)) => lhs == rhs,
        (Literal::Null, Literal::Null) => true,
        (Literal::List(lhs), Literal::List(rhs)) => {
            lhs.len() == rhs.len() && lhs.iter().zip(rhs).all(|(lhs, rhs)| compare(lhs, rhs))
        }
        (Literal::Version(lhs, _), Literal::Float(rhs)) => *lhs == *rhs as u32,
        (Literal::Float(lhs), Literal::Version(rhs, _)) => *lhs as u32 == *rhs,
        (Literal::String(lhs), Literal::Version(_, latest)) if lhs == "latest" => *latest,
        (Literal::Version(_, latest), Literal::String(rhs)) if rhs == "latest" => *latest,
        (lhs, rhs) => {
            tracing::warn!("unsupported operation: {lhs:?} == {rhs:?}");
            false
        }
    }
}

impl TryFrom<serde_json::Value> for Literal {
    type Error = ();

    fn try_from(value: serde_json::Value) -> std::result::Result<Self, Self::Error> {
        use serde_json::Value;

        Ok(match value {
            Value::Null => Self::Null,
            Value::Bool(bool) => Self::Bool(bool),
            Value::Number(number) => number.as_f64().map_or_else(
                || panic!("Could not parse {number} as literal"),
                Self::Float,
            ),
            Value::String(string) => Self::String(string),
            Value::Array(values) => Self::List(
                values
                    .into_iter()
                    .map(TryFrom::try_from)
                    .collect::<std::result::Result<Vec<_>, _>>()?,
            ),
            Value::Object(_) => todo!(),
        })
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
    #[allow(clippy::missing_panics_doc, reason = "TODO: Apply error handling")]
    pub fn evaluate<'a, R>(&'a self, resolver: &'a mut R) -> BoxFuture<Literal>
    where
        R: PathResolver + Send + Sync,
    {
        async move {
            match self {
                Expression::Eq(expressions) => {
                    for expression in expressions.windows(2) {
                        if !compare(
                            &expression[0].evaluate(resolver).await,
                            &expression[1].evaluate(resolver).await,
                        ) {
                            return Literal::Bool(false);
                        }
                    }
                    Literal::Bool(true)
                }
                Expression::Ne(expressions) => {
                    for expression in expressions.windows(2) {
                        if compare(
                            &expression[0].evaluate(resolver).await,
                            &expression[1].evaluate(resolver).await,
                        ) {
                            return Literal::Bool(false);
                        }
                    }
                    Literal::Bool(true)
                }
                Expression::All(expressions) => {
                    for expression in expressions {
                        match expression.evaluate(resolver).await {
                            Literal::Bool(true) => continue,
                            literal @ Literal::Bool(false) => return literal,
                            literal => panic!("Not a boolean: {literal:?}"),
                        }
                    }
                    Literal::Bool(true)
                }
                Expression::Any(expressions) => {
                    for expression in expressions {
                        match expression.evaluate(resolver).await {
                            Literal::Bool(false) => continue,
                            literal @ Literal::Bool(true) => return literal,
                            literal => panic!("Not a boolean: {literal:?}"),
                        }
                    }
                    Literal::Bool(false)
                }
                Expression::Literal(literal) => literal.clone(),
                Expression::Path(path) => resolver.resolve(path).await,
                Expression::Field(_identifier) => todo!(),
            }
        }
        .boxed()
    }
}

#[async_trait]
pub trait ExpressionResolver {
    type Record;

    async fn resolve(&mut self, expression: &Expression) -> Result<Vec<Self::Record>, QueryError>;
}

#[async_trait]
pub trait PathResolver {
    async fn resolve(&self, path: &Path) -> Literal;
}

#[async_trait]
impl PathResolver for Literal {
    async fn resolve(&self, path: &Path) -> Literal {
        match self {
            Literal::List(values) => match path.segments.as_slice() {
                [] => panic!("Path is empty"),
                [segment, segments @ ..] => {
                    let index: usize = segment
                        .identifier
                        .parse()
                        .expect("path needs to be an unsigned integer");
                    let literal = values.get(index).expect("Index out of bounds");
                    if segments.is_empty() {
                        literal.clone()
                    } else {
                        literal
                            .resolve(&Path {
                                segments: segments.to_vec(),
                            })
                            .await
                    }
                }
            },
            literal => panic!("Cannot index a {literal:?}"),
        }
    }
}

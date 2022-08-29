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
    String(String),
    Float(f64),
    // TODO: Integer
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
            Value::Array(_) => todo!(),
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
    #[allow(clippy::missing_panics_doc, reason = "TODO: Apply error handling")]
    pub fn evaluate<'t, 'resolver, 'context, 'r, R, C>(
        &'t self,
        resolver: &'resolver R,
        context: &'context mut C,
    ) -> BoxFuture<'t, Literal>
    where
        for<'rec> R: Resolve<C> + Send + Sync + 'resolver,
        C: Send + 'context,
        'context: 't,
        'resolver: 't,
        Self: 't,
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
                // _ => todo!(),
                Expression::Field(_identifier) => todo!(),
            }
        }
        .boxed()
    }
}

#[async_trait]
pub trait Resolve<Ctx> {
    async fn resolve(&self, path: &[PathSegment], context: &mut Ctx) -> Literal;

    fn by_ref(&self) -> &Self
    where
        Self: Sized,
    {
        self
    }
}

#[async_trait]
impl<Ctx> Resolve<Ctx> for Literal
where
    Ctx: Send,
{
    async fn resolve(&self, path: &[PathSegment], context: &mut Ctx) -> Literal {
        match self {
            Literal::List(values) => match path {
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
                        literal.resolve(segments, context).await
                    }
                }
            },
            literal => panic!("Cannot index a {literal:?}"),
        }
    }
}

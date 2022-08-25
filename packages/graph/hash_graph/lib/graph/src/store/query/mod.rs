mod knowledge;
mod ontology;

use serde::{Deserialize, Serialize};

pub use self::{
    knowledge::{EntityQuery, EntityVersion, LinkQuery},
    ontology::{
        DataTypeQuery, EntityTypeQuery, LinkTypeQuery, OntologyQuery, OntologyVersion,
        PropertyTypeQuery,
    },
};

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

    fn try_from(value: serde_json::Value) -> Result<Self, Self::Error> {
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
                    .collect::<Result<Vec<_>, _>>()?,
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

pub trait Resolve {
    fn resolve_path(&self, path: &Path) -> Literal;
}

#[allow(clippy::missing_panics_doc, reason = "Error handling needs to be done")]
pub fn resolve(
    expr: &Expression,
    resolver: &impl Resolve,
    current_path: &mut Vec<PathSegment>,
) -> Literal {
    match expr {
        Expression::Eq(expressions) => Literal::Bool(expressions.windows(2).all(|expression| {
            compare(
                &resolve(&expression[0], resolver, current_path),
                &resolve(&expression[1], resolver, current_path),
            )
        })),
        Expression::Ne(expressions) => Literal::Bool(expressions.windows(2).any(|expression| {
            !compare(
                &resolve(&expression[0], resolver, current_path),
                &resolve(&expression[1], resolver, current_path),
            )
        })),
        Expression::All(expressions) => Literal::Bool(expressions.iter().all(|expression| {
            match resolve(expression, resolver, current_path) {
                Literal::Bool(bool) => bool,
                literal => panic!("Not a boolean: {literal:?}"),
            }
        })),
        Expression::Any(expressions) => Literal::Bool(expressions.iter().any(|expression| {
            match resolve(expression, resolver, current_path) {
                Literal::Bool(bool) => bool,
                literal => panic!("Not a boolean: {literal:?}"),
            }
        })),
        Expression::Literal(literal) => literal.clone(),
        Expression::Path(path) => resolver.resolve_path(path),
        Expression::Field(_identifier) => todo!(),
    }
}

impl Resolve for Literal {
    fn resolve_path(&self, path: &Path) -> Literal {
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
                        literal.resolve_path(&Path {
                            segments: segments.to_vec(),
                        })
                    }
                }
            },
            literal => panic!("Cannot index a {literal:?}"),
        }
    }
}

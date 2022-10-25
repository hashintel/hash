use std::{
    borrow::Cow,
    fmt::{Debug, Formatter},
};

use serde::Deserialize;
use type_system::{uri::VersionedUri, DataType, EntityType, LinkType, PropertyType};

use crate::{
    ontology::{DataTypeQueryPath, EntityTypeQueryPath, LinkTypeQueryPath, PropertyTypeQueryPath},
    store::query::{Expression, Literal, Path, QueryRecord},
};

/// A set of conditions used for queries.
#[derive(Deserialize)]
#[serde(
    rename_all = "camelCase",
    bound = "'de: 'q, T::Path<'q>: Deserialize<'de>"
)]
pub enum Filter<'q, T: QueryRecord> {
    All(Vec<Self>),
    Any(Vec<Self>),
    Not(Box<Self>),
    Equal(
        Option<FilterExpression<'q, T>>,
        Option<FilterExpression<'q, T>>,
    ),
    NotEqual(
        Option<FilterExpression<'q, T>>,
        Option<FilterExpression<'q, T>>,
    ),
}

macro_rules! define_ontology_filters {
    ($record:ty, $path:ty) => {
        impl<'q> Filter<'q, $record> {
            #[must_use]
            pub const fn for_latest_version() -> Self {
                Self::Equal(
                    Some(FilterExpression::Path(<$path>::Version)),
                    Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                        "latest",
                    )))),
                )
            }

            #[must_use]
            pub fn for_versioned_uri(versioned_uri: &'q VersionedUri) -> Self {
                Self::All(vec![
                    Self::Equal(
                        Some(FilterExpression::Path(<$path>::BaseUri)),
                        Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                            versioned_uri.base_uri().as_str(),
                        )))),
                    ),
                    Self::Equal(
                        Some(FilterExpression::Path(<$path>::Version)),
                        // TODO: Change to `SignedInteger` when #1255 merged
                        //   see https://app.asana.com/0/1200211978612931/1203205825668105/f
                        Some(FilterExpression::Parameter(Parameter::Number(
                            versioned_uri.version() as f64,
                        ))),
                    ),
                ])
            }
        }
    };
}

define_ontology_filters!(DataType, DataTypeQueryPath);
define_ontology_filters!(PropertyType, PropertyTypeQueryPath);
define_ontology_filters!(EntityType, EntityTypeQueryPath);
define_ontology_filters!(LinkType, LinkTypeQueryPath);

// TODO: Derive traits when bounds are generated correctly
//   see https://github.com/rust-lang/rust/issues/26925
impl<'q, T> Debug for Filter<'q, T>
where
    T: QueryRecord<Path<'q>: Debug>,
{
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::All(filters) => f.debug_tuple("All").field(filters).finish(),
            Self::Any(filters) => f.debug_tuple("Any").field(filters).finish(),
            Self::Not(filter) => f.debug_tuple("Not").field(filter).finish(),
            Self::Equal(lhs, rhs) => f.debug_tuple("Equal").field(lhs).field(rhs).finish(),
            Self::NotEqual(lhs, rhs) => f.debug_tuple("NotEqual").field(lhs).field(rhs).finish(),
        }
    }
}

// TODO: Derive traits when bounds are generated correctly
//   see https://github.com/rust-lang/rust/issues/26925
impl<'q, T> PartialEq for Filter<'q, T>
where
    T: QueryRecord<Path<'q>: PartialEq>,
{
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::All(lhs), Self::All(rhs)) | (Self::Any(lhs), Self::Any(rhs)) => lhs == rhs,
            (Self::Not(lhs), Self::Not(rhs)) => lhs == rhs,
            (Self::Equal(lhs_1, lhs_2), Self::Equal(rhs_1, rhs_2))
            | (Self::NotEqual(lhs_1, lhs_2), Self::NotEqual(rhs_1, rhs_2)) => {
                lhs_1 == rhs_1 && lhs_2 == rhs_2
            }
            _ => false,
        }
    }
}

impl<'q, T: QueryRecord> TryFrom<Expression> for Filter<'q, T> {
    type Error = <T::Path<'q> as TryFrom<Path>>::Error;

    fn try_from(expression: Expression) -> Result<Self, Self::Error> {
        Ok(match expression {
            Expression::Eq(expressions) => match expressions.as_slice() {
                [] | [_] => unimplemented!(),
                [lhs, rhs] => Self::Equal(lhs.clone().try_into()?, rhs.clone().try_into()?),
                _ => Self::All(
                    expressions
                        .windows(2)
                        .map(|expressions| {
                            Ok(Self::Equal(
                                expressions[0].clone().try_into()?,
                                expressions[1].clone().try_into()?,
                            ))
                        })
                        .collect::<Result<_, _>>()?,
                ),
            },
            Expression::Ne(expressions) => match expressions.as_slice() {
                [] | [_] => unimplemented!(),
                [lhs, rhs] => Self::NotEqual(lhs.clone().try_into()?, rhs.clone().try_into()?),
                _ => Self::All(
                    expressions
                        .windows(2)
                        .map(|expressions| {
                            Ok(Self::NotEqual(
                                expressions[0].clone().try_into()?,
                                expressions[1].clone().try_into()?,
                            ))
                        })
                        .collect::<Result<_, _>>()?,
                ),
            },
            Expression::All(expressions) => Self::All(
                expressions
                    .into_iter()
                    .map(Self::try_from)
                    .collect::<Result<_, _>>()?,
            ),
            Expression::Any(expressions) => Self::Any(
                expressions
                    .into_iter()
                    .map(Self::try_from)
                    .collect::<Result<_, _>>()?,
            ),
            Expression::Literal(_) | Expression::Path(_) | Expression::Field(_) => unimplemented!(),
        })
    }
}

/// A leaf value in a [`Filter`].
// TODO: Derive traits when bounds are generated correctly
//   see https://github.com/rust-lang/rust/issues/26925
#[derive(Deserialize)]
#[serde(
    rename_all = "camelCase",
    bound = "'de: 'q, T::Path<'q>: Deserialize<'de>"
)]
pub enum FilterExpression<'q, T: QueryRecord> {
    Path(T::Path<'q>),
    Parameter(Parameter<'q>),
}

// TODO: Derive traits when bounds are generated correctly
//   see https://github.com/rust-lang/rust/issues/26925
impl<'q, T> Debug for FilterExpression<'q, T>
where
    T: QueryRecord<Path<'q>: Debug>,
{
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Path(path) => f.debug_tuple("Path").field(path).finish(),
            Self::Parameter(parameter) => f.debug_tuple("Parameter").field(parameter).finish(),
        }
    }
}

// TODO: Derive traits when bounds are generated correctly
//   see https://github.com/rust-lang/rust/issues/26925
impl<'q, T> PartialEq for FilterExpression<'q, T>
where
    T: QueryRecord<Path<'q>: PartialEq>,
{
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Path(lhs), Self::Path(rhs)) => lhs == rhs,
            (Self::Parameter(lhs), Self::Parameter(rhs)) => lhs == rhs,
            _ => false,
        }
    }
}

impl<'q, T: QueryRecord> TryFrom<Expression> for FilterExpression<'q, T> {
    type Error = <T::Path<'q> as TryFrom<Path>>::Error;

    fn try_from(expression: Expression) -> Result<Self, Self::Error> {
        Ok(match expression {
            Expression::Eq(_)
            | Expression::Ne(_)
            | Expression::All(_)
            | Expression::Any(_)
            | Expression::Field(_)
            | Expression::Literal(Literal::Null) => unimplemented!(),
            Expression::Literal(literal) => FilterExpression::Parameter(Parameter::from(literal)),
            Expression::Path(path) => FilterExpression::Path(path.try_into()?),
        })
    }
}

impl<'q, T: QueryRecord> TryFrom<Expression> for Option<FilterExpression<'q, T>> {
    type Error = <T::Path<'q> as TryFrom<Path>>::Error;

    fn try_from(expression: Expression) -> Result<Self, Self::Error> {
        Ok(if let Expression::Literal(Literal::Null) = expression {
            None
        } else {
            Some(FilterExpression::try_from(expression)?)
        })
    }
}

#[derive(Debug, PartialEq, Deserialize)]
#[serde(untagged)]
pub enum Parameter<'q> {
    Number(f64),
    Text(Cow<'q, str>),
    Boolean(bool),
}

impl From<Literal> for Parameter<'_> {
    fn from(literal: Literal) -> Self {
        match literal {
            Literal::String(string) => Parameter::Text(Cow::Owned(string)),
            Literal::Float(float) => Parameter::Number(float),
            Literal::Bool(bool) => Parameter::Boolean(bool),
            Literal::Null | Literal::List(_) | Literal::Version(..) => unimplemented!(),
        }
    }
}

impl From<Literal> for Option<Parameter<'_>> {
    fn from(literal: Literal) -> Self {
        if let Literal::Null = literal {
            None
        } else {
            Some(Parameter::from(literal))
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use type_system::{
        uri::{BaseUri, VersionedUri},
        DataType,
    };

    use super::*;
    use crate::ontology::DataTypeQueryPath;

    #[test]
    fn convert_expression() {
        assert_eq!(
            Filter::try_from(Expression::for_latest_version())
                .expect("could not convert expression"),
            Filter::Equal(
                Some(FilterExpression::<DataType>::Path(
                    DataTypeQueryPath::Version
                )),
                Some(FilterExpression::<DataType>::Parameter(Parameter::Text(
                    Cow::Borrowed("latest")
                ))),
            )
        );

        let versioned_id = VersionedUri::new(
            BaseUri::new(
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/".to_owned(),
            )
            .expect("invalid base uri"),
            1,
        );
        assert_eq!(
            Filter::try_from(Expression::for_versioned_uri(&versioned_id))
                .expect("could not convert expression"),
            Filter::Equal(
                Some(FilterExpression::<DataType>::Path(
                    DataTypeQueryPath::VersionedUri
                )),
                Some(FilterExpression::<DataType>::Parameter(Parameter::Text(
                    Cow::Owned(versioned_id.to_string())
                ))),
            )
        );
    }

    #[test]
    fn deserialize() {
        let latest_version_filter = json! {{
          "equal": [
            { "path": ["version"] },
            { "parameter": "latest" }
          ]
        }};
        assert_eq!(
            Filter::deserialize(&latest_version_filter).expect("could not deserialize filter"),
            Filter::Equal(
                Some(FilterExpression::<DataType>::Path(
                    DataTypeQueryPath::Version
                )),
                Some(FilterExpression::<DataType>::Parameter(Parameter::Text(
                    Cow::Borrowed("latest")
                ))),
            )
        );

        let specific_version_filter = json! {{
          "all": [
            { "equal": [
              { "path": ["baseUri"] },
              { "parameter": "https://blockprotocol.org/@blockprotocol/types/data-type/text/" }
            ]},
            { "equal": [
              { "path": ["version"] },
              { "parameter": 1 }
            ]}
          ]
        }};
        assert_eq!(
            Filter::deserialize(&specific_version_filter).expect("could not deserialize filter"),
            Filter::All(vec![
                Filter::Equal(
                    Some(FilterExpression::<DataType>::Path(
                        DataTypeQueryPath::BaseUri
                    )),
                    Some(FilterExpression::<DataType>::Parameter(Parameter::Text(
                        Cow::Borrowed(
                            "https://blockprotocol.org/@blockprotocol/types/data-type/text/"
                        )
                    ))),
                ),
                Filter::Equal(
                    Some(FilterExpression::<DataType>::Path(
                        DataTypeQueryPath::Version
                    )),
                    Some(FilterExpression::<DataType>::Parameter(Parameter::Number(
                        1.0
                    ))),
                ),
            ])
        );

        let null_check = json! {{
          "notEqual": [
            { "path": ["description"] },
            null
          ]
        }};
        assert_eq!(
            Filter::deserialize(&null_check).expect("could not deserialize filter"),
            Filter::NotEqual(
                Some(FilterExpression::<DataType>::Path(
                    DataTypeQueryPath::Description
                )),
                None,
            )
        );
    }
}

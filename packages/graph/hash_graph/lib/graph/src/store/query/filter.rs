use std::{
    borrow::Cow,
    fmt::{Debug, Formatter},
};

use serde::Deserialize;

use crate::store::query::{Expression, Literal, Path, QueryRecord};

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
    Equal(Option<FilterValue<'q, T>>, Option<FilterValue<'q, T>>),
    NotEqual(Option<FilterValue<'q, T>>, Option<FilterValue<'q, T>>),
}

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
pub enum FilterValue<'q, T: QueryRecord> {
    Path(T::Path<'q>),
    Parameter(Parameter<'q>),
}

// TODO: Derive traits when bounds are generated correctly
//   see https://github.com/rust-lang/rust/issues/26925
impl<'q, T> Debug for FilterValue<'q, T>
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
impl<'q, T> PartialEq for FilterValue<'q, T>
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

impl<'q, T: QueryRecord> TryFrom<Expression> for FilterValue<'q, T> {
    type Error = <T::Path<'q> as TryFrom<Path>>::Error;

    fn try_from(expression: Expression) -> Result<Self, Self::Error> {
        Ok(match expression {
            Expression::Eq(_)
            | Expression::Ne(_)
            | Expression::All(_)
            | Expression::Any(_)
            | Expression::Field(_)
            | Expression::Literal(Literal::Null) => unimplemented!(),
            Expression::Literal(literal) => FilterValue::Parameter(Parameter::from(literal)),
            Expression::Path(path) => FilterValue::Path(path.try_into()?),
        })
    }
}

impl<'q, T: QueryRecord> TryFrom<Expression> for Option<FilterValue<'q, T>> {
    type Error = <T::Path<'q> as TryFrom<Path>>::Error;

    fn try_from(expression: Expression) -> Result<Self, Self::Error> {
        Ok(if let Expression::Literal(Literal::Null) = expression {
            None
        } else {
            Some(FilterValue::try_from(expression)?)
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
                Some(FilterValue::<DataType>::Path(DataTypeQueryPath::Version)),
                Some(FilterValue::<DataType>::Parameter(Parameter::Text(
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
                Some(FilterValue::<DataType>::Path(
                    DataTypeQueryPath::VersionedUri
                )),
                Some(FilterValue::<DataType>::Parameter(Parameter::Text(
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
                Some(FilterValue::<DataType>::Path(DataTypeQueryPath::Version)),
                Some(FilterValue::<DataType>::Parameter(Parameter::Text(
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
                    Some(FilterValue::<DataType>::Path(DataTypeQueryPath::BaseUri)),
                    Some(FilterValue::<DataType>::Parameter(Parameter::Text(
                        Cow::Borrowed(
                            "https://blockprotocol.org/@blockprotocol/types/data-type/text/"
                        )
                    ))),
                ),
                Filter::Equal(
                    Some(FilterValue::<DataType>::Path(DataTypeQueryPath::Version)),
                    Some(FilterValue::<DataType>::Parameter(Parameter::Number(1.0))),
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
                Some(FilterValue::<DataType>::Path(
                    DataTypeQueryPath::Description
                )),
                None,
            )
        );
    }
}

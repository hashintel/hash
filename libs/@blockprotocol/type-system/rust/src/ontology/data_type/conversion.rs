#[cfg(feature = "postgres")]
use core::error::Error;
use core::fmt::{self, Write as _};

#[cfg(feature = "postgres")]
use bytes::BytesMut;
use hash_codec::numeric::Real;
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, Json, ToSql, Type};
use serde::{Deserialize, Serialize};
#[cfg(feature = "utoipa")]
use utoipa::openapi;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Conversions {
    pub from: ConversionDefinition,
    pub to: ConversionDefinition,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConversionDefinition {
    pub expression: ConversionExpression,
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for ConversionDefinition {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Json::from_sql(ty, raw)?.0)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as FromSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl ToSql for ConversionDefinition {
    postgres_types::to_sql_checked!();

    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        Json(self).to_sql(ty, out)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as ToSql>::accepts(ty)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
pub enum Variable {
    #[serde(rename = "self")]
    This,
}

impl fmt::Display for Variable {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::This => fmt.write_str("self"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(from = "codec::ConversionValue", into = "codec::ConversionValue")]
pub enum ConversionValue {
    Variable(Variable),
    Constant(Real),
    Expression(Box<ConversionExpression>),
}

impl ConversionValue {
    fn evaluate(&self, value: Real) -> Real {
        match self {
            Self::Variable(Variable::This) => value,
            Self::Constant(constant) => constant.clone(),
            Self::Expression(expression) => expression.evaluate(value),
        }
    }
}

impl fmt::Display for ConversionValue {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Variable(variable) => fmt::Display::fmt(variable, fmt),
            Self::Constant(value) => fmt::Display::fmt(value, fmt),
            Self::Expression(expression) => fmt::Display::fmt(expression, fmt),
        }
    }
}

#[cfg(feature = "utoipa")]
impl utoipa::ToSchema<'_> for ConversionValue {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        ("ConversionValue", codec::ConversionValue::schema().1)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
pub enum Operator {
    #[serde(rename = "+")]
    Add,
    #[serde(rename = "-")]
    Subtract,
    #[serde(rename = "*")]
    Multiply,
    #[serde(rename = "/")]
    Divide,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    from = "codec::ConversionExpression",
    into = "codec::ConversionExpression"
)]
pub struct ConversionExpression {
    pub lhs: ConversionValue,
    pub operator: Operator,
    pub rhs: ConversionValue,
}

impl ConversionExpression {
    #[must_use]
    pub fn evaluate(&self, value: Real) -> Real {
        let lhs = self.lhs.evaluate(value.clone());
        let rhs = self.rhs.evaluate(value);

        match self.operator {
            Operator::Add => lhs + rhs,
            Operator::Subtract => lhs - rhs,
            Operator::Multiply => lhs * rhs,
            Operator::Divide => lhs / rhs,
        }
    }
}

impl fmt::Display for ConversionExpression {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        if matches!(&self.lhs, ConversionValue::Expression(expr) if matches!(expr.operator, Operator::Add | Operator::Subtract))
        {
            write!(fmt, "({}) ", self.lhs)?;
        } else {
            write!(fmt, "{} ", self.lhs)?;
        }

        match self.operator {
            Operator::Add => fmt.write_char('+')?,
            Operator::Subtract => fmt.write_char('-')?,
            Operator::Multiply => fmt.write_char('*')?,
            Operator::Divide => fmt.write_char('/')?,
        }

        if matches!(self.rhs, ConversionValue::Expression(_)) {
            write!(fmt, " ({})", self.rhs)
        } else {
            write!(fmt, " {}", self.rhs)
        }
    }
}

#[cfg(feature = "utoipa")]
impl utoipa::ToSchema<'_> for ConversionExpression {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "ConversionExpression",
            openapi::OneOfBuilder::new()
                .item(openapi::Ref::from_schema_name(Operator::schema().0))
                .item(openapi::Ref::from_schema_name(ConversionValue::schema().0))
                .to_array_builder()
                .min_items(Some(3))
                .max_items(Some(3))
                .build()
                .into(),
        )
    }
}

mod codec {
    use hash_codec::numeric::Real;
    use serde::{Deserialize, Serialize};
    #[cfg(feature = "utoipa")]
    use utoipa::{ToSchema, openapi};

    use super::{Operator, Variable};
    use crate::ontology::json_schema::NumberTypeTag;

    #[derive(Serialize, Deserialize)]
    #[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
    #[serde(untagged, rename = "ConversionValue")]
    pub(super) enum ConversionValue {
        Variable(Variable),
        Constant {
            #[serde(rename = "const")]
            value: Real,
            r#type: NumberTypeTag,
        },

        Expression(Box<super::ConversionExpression>),
    }

    #[cfg(feature = "utoipa")]
    impl ToSchema<'static> for ConversionValue {
        fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
            (
                "ConversionValue",
                openapi::Schema::OneOf(
                    openapi::OneOfBuilder::new()
                        .item(openapi::Ref::from_schema_name(Variable::schema().0))
                        .item(
                            openapi::ObjectBuilder::new()
                                .property("const", openapi::Ref::from_schema_name("Real"))
                                .required("const")
                                .property("type", NumberTypeTag::schema().1)
                                .required("type")
                                .build(),
                        )
                        .item(openapi::Ref::from_schema_name("ConversionExpression"))
                        .build(),
                )
                .into(),
            )
        }
    }

    impl From<ConversionValue> for super::ConversionValue {
        fn from(value: ConversionValue) -> Self {
            match value {
                ConversionValue::Variable(variable) => Self::Variable(variable),
                ConversionValue::Constant { value, .. } => Self::Constant(value),
                ConversionValue::Expression(expression) => Self::Expression(expression),
            }
        }
    }

    impl From<super::ConversionValue> for ConversionValue {
        fn from(value: super::ConversionValue) -> Self {
            match value {
                super::ConversionValue::Variable(variable) => Self::Variable(variable),
                super::ConversionValue::Constant(value) => Self::Constant {
                    value,
                    r#type: NumberTypeTag::Number,
                },
                super::ConversionValue::Expression(expression) => Self::Expression(expression),
            }
        }
    }

    #[derive(Serialize, Deserialize)]
    #[serde(rename = "ConversionExpression")]
    #[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
    pub(super) struct ConversionExpression(
        Operator,
        super::ConversionValue,
        super::ConversionValue,
    );

    impl From<ConversionExpression> for super::ConversionExpression {
        fn from(ConversionExpression(operator, lhs, rhs): ConversionExpression) -> Self {
            Self { lhs, operator, rhs }
        }
    }

    impl From<super::ConversionExpression> for ConversionExpression {
        fn from(value: super::ConversionExpression) -> Self {
            Self(value.operator, value.lhs, value.rhs)
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{self, Value as JsonValue, json};

    use super::*;

    fn test_conversion(expression: &ConversionExpression, value: JsonValue, string: &str) {
        assert_eq!(
            serde_json::to_value(expression).expect("failed to serialize"),
            value
        );

        assert_eq!(
            serde_json::from_value::<ConversionExpression>(value).expect("failed to deserialize"),
            *expression
        );

        assert_eq!(expression.to_string(), string);
    }

    #[test]
    fn centimeters_to_meters() {
        let expression = ConversionExpression {
            lhs: ConversionValue::Variable(Variable::This),
            operator: Operator::Multiply,
            rhs: ConversionValue::Constant(Real::from(100)),
        };

        test_conversion(
            &expression,
            json!([
                "*",
                "self",
                { "const": 100.0, "type": "number" }
            ]),
            "self * 100",
        );

        assert_eq!(expression.evaluate(Real::from(1)), Real::from(100));
        assert_eq!(expression.evaluate(Real::from(10)), Real::from(1000));
    }

    #[test]
    fn meters_to_centimeters() {
        let expression = ConversionExpression {
            lhs: ConversionValue::Variable(Variable::This),
            operator: Operator::Divide,
            rhs: ConversionValue::Constant(Real::from(100)),
        };

        test_conversion(
            &expression,
            json!([
                "/",
                "self",
                { "const": 100.0, "type": "number" }
            ]),
            "self / 100",
        );

        assert_eq!(expression.evaluate(Real::from(100)), Real::from(1));
        assert_eq!(expression.evaluate(Real::from(1000)), Real::from(10));
    }

    #[test]
    fn celsius_to_fahrenheit() {
        let expression = ConversionExpression {
            lhs: ConversionValue::Expression(Box::new(ConversionExpression {
                lhs: ConversionValue::Expression(Box::new(ConversionExpression {
                    lhs: ConversionValue::Variable(Variable::This),
                    operator: Operator::Multiply,
                    rhs: ConversionValue::Constant(Real::from(9)),
                })),
                operator: Operator::Divide,
                rhs: ConversionValue::Constant(Real::from(5)),
            })),
            operator: Operator::Add,
            rhs: ConversionValue::Constant(Real::from(32)),
        };

        test_conversion(
            &expression,
            json!([
                "+",
                [
                    "/",
                    [
                        "*",
                        "self",
                        { "const": 9.0, "type": "number" }
                    ],
                    { "const": 5.0, "type": "number" }
                ],
                { "const": 32.0, "type": "number" },
            ]),
            "self * 9 / 5 + 32",
        );

        assert_eq!(expression.evaluate(Real::from(0)), Real::from(32));
        assert_eq!(expression.evaluate(Real::from(100)), Real::from(212));
    }

    #[test]
    fn celsius_to_fahrenheit_alternative() {
        let expression = ConversionExpression {
            lhs: ConversionValue::Expression(Box::new(ConversionExpression {
                lhs: ConversionValue::Variable(Variable::This),
                operator: Operator::Multiply,
                rhs: ConversionValue::Expression(Box::new(ConversionExpression {
                    lhs: ConversionValue::Constant(Real::from(9)),
                    operator: Operator::Divide,
                    rhs: ConversionValue::Constant(Real::from(5)),
                })),
            })),
            operator: Operator::Add,
            rhs: ConversionValue::Constant(Real::from(32)),
        };
        test_conversion(
            &expression,
            json!([
                "+",
                [
                    "*",
                    "self",
                    [
                        "/",
                        { "const": 9.0, "type": "number" },
                        { "const": 5.0, "type": "number" }
                    ]
                ],
                { "const": 32.0, "type": "number" },
            ]),
            "self * (9 / 5) + 32",
        );

        assert_eq!(expression.evaluate(Real::from(0)), Real::from(32));
        assert_eq!(expression.evaluate(Real::from(100)), Real::from(212));
    }

    #[test]
    fn fahrenheit_to_celsius() {
        let expression = ConversionExpression {
            lhs: ConversionValue::Expression(Box::new(ConversionExpression {
                lhs: ConversionValue::Expression(Box::new(ConversionExpression {
                    lhs: ConversionValue::Variable(Variable::This),
                    operator: Operator::Subtract,
                    rhs: ConversionValue::Constant(Real::from(32)),
                })),
                operator: Operator::Multiply,
                rhs: ConversionValue::Constant(Real::from(5)),
            })),
            operator: Operator::Divide,
            rhs: ConversionValue::Constant(Real::from(9)),
        };

        test_conversion(
            &expression,
            json!([
                "/",
                [
                    "*",
                    [
                        "-",
                        "self",
                        { "const": 32.0, "type": "number" }
                    ],
                    { "const": 5.0, "type": "number" }
                ],
                { "const": 9.0, "type": "number" },
            ]),
            "(self - 32) * 5 / 9",
        );

        assert_eq!(expression.evaluate(Real::from(32)), Real::from(0));
        assert_eq!(expression.evaluate(Real::from(212)), Real::from(100));
    }

    #[test]
    fn fahrenheit_to_celsius_alternative() {
        let expression = ConversionExpression {
            lhs: ConversionValue::Expression(Box::new(ConversionExpression {
                lhs: ConversionValue::Variable(Variable::This),
                operator: Operator::Subtract,
                rhs: ConversionValue::Constant(Real::from(32)),
            })),
            operator: Operator::Multiply,
            rhs: ConversionValue::Expression(Box::new(ConversionExpression {
                lhs: ConversionValue::Constant(Real::from(5)),
                operator: Operator::Divide,
                rhs: ConversionValue::Constant(Real::from(9)),
            })),
        };

        test_conversion(
            &expression,
            json!([
                "*",
                [
                    "-",
                    "self",
                    { "const": 32.0, "type": "number" }
                ],
                [
                    "/",
                    { "const": 5.0, "type": "number" },
                    { "const": 9.0, "type": "number" }
                ]
            ]),
            "(self - 32) * (5 / 9)",
        );

        assert_eq!(expression.evaluate(Real::from(32)), Real::from(0));
        assert_eq!(expression.evaluate(Real::from(212)), Real::from(100));
    }
}

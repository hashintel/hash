use core::{fmt, fmt::Write as _};

use crate::store::postgres::query::{Expression, Transpile};

/// A [`Filter`], which can be transpiled.
///
/// [`Filter`]: hash_graph_store::filter::Filter
#[derive(Debug, Clone, PartialEq)]
pub enum Condition {
    All(Vec<Self>),
    Any(Vec<Self>),
    Not(Box<Self>),
    Equal(Expression, Expression),
    NotEqual(Expression, Expression),
    Exists(Expression),
    Less(Expression, Expression),
    LessOrEqual(Expression, Expression),
    Greater(Expression, Expression),
    GreaterOrEqual(Expression, Expression),
    In(Expression, Expression),
    TimeIntervalContainsTimestamp(Expression, Expression),
    Overlap(Expression, Expression),
    StartsWith(Expression, Expression),
    EndsWith(Expression, Expression),
    ContainsSegment(Expression, Expression),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EqualityOperator {
    Equal,
    NotEqual,
}

impl Transpile for Condition {
    #[expect(clippy::too_many_lines)]
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::All(conditions) if conditions.is_empty() => fmt.write_str("TRUE"),
            Self::Any(conditions) if conditions.is_empty() => fmt.write_str("FALSE"),
            Self::All(conditions) => {
                for (idx, condition) in conditions.iter().enumerate() {
                    if idx > 0 {
                        fmt.write_str(" AND ")?;
                    }
                    fmt.write_char('(')?;
                    condition.transpile(fmt)?;
                    fmt.write_char(')')?;
                }
                Ok(())
            }
            Self::Any(conditions) => {
                if conditions.len() > 1 {
                    fmt.write_char('(')?;
                }
                for (idx, condition) in conditions.iter().enumerate() {
                    if idx > 0 {
                        fmt.write_str(" OR ")?;
                    }
                    fmt.write_char('(')?;
                    condition.transpile(fmt)?;
                    fmt.write_char(')')?;
                }
                if conditions.len() > 1 {
                    fmt.write_char(')')?;
                }
                Ok(())
            }
            Self::Not(condition) => {
                if let Self::Exists(path) = &**condition {
                    path.transpile(fmt)?;
                    fmt.write_str(" IS NOT NULL")
                } else {
                    fmt.write_str("NOT(")?;
                    condition.transpile(fmt)?;
                    fmt.write_char(')')
                }
            }
            Self::Exists(path) => {
                path.transpile(fmt)?;
                fmt.write_str(" IS NULL")
            }
            Self::Equal(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" = ")?;
                rhs.transpile(fmt)
            }
            Self::NotEqual(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" != ")?;
                rhs.transpile(fmt)
            }
            Self::Less(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" < ")?;
                rhs.transpile(fmt)
            }
            Self::LessOrEqual(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" <= ")?;
                rhs.transpile(fmt)
            }
            Self::Greater(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" > ")?;
                rhs.transpile(fmt)
            }
            Self::GreaterOrEqual(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" >= ")?;
                rhs.transpile(fmt)
            }
            Self::In(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" = ANY(")?;
                rhs.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::TimeIntervalContainsTimestamp(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" @> ")?;
                rhs.transpile(fmt)?;
                fmt.write_str("::TIMESTAMPTZ")
            }
            Self::Overlap(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" && ")?;
                rhs.transpile(fmt)
            }
            Self::StartsWith(lhs, rhs) => {
                fmt.write_str("starts_with(")?;
                lhs.transpile(fmt)?;
                fmt.write_str(", ")?;
                rhs.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::EndsWith(lhs, rhs) => {
                fmt.write_str("right(")?;
                lhs.transpile(fmt)?;
                fmt.write_str(", length(")?;
                rhs.transpile(fmt)?;
                fmt.write_str(")) = ")?;
                rhs.transpile(fmt)
            }
            Self::ContainsSegment(lhs, rhs) => {
                fmt.write_str("strpos(")?;
                lhs.transpile(fmt)?;
                fmt.write_str(", ")?;
                rhs.transpile(fmt)?;
                fmt.write_str(") > 0")
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use alloc::borrow::Cow;

    use hash_codec::numeric::Real;
    use hash_graph_store::{
        data_type::DataTypeQueryPath,
        filter::{Filter, FilterExpression, Parameter},
    };
    use postgres_types::ToSql;
    use type_system::ontology::DataTypeWithMetadata;

    use crate::store::postgres::query::{SelectCompiler, Transpile as _};

    fn test_condition<'p, 'f: 'p>(
        filter: &'f Filter<'p, DataTypeWithMetadata>,
        rendered: &'static str,
        parameters: &[&'p dyn ToSql],
    ) {
        let mut compiler = SelectCompiler::new(None, false);
        let condition = compiler
            .compile_filter(filter)
            .expect("failed to compile filter");

        assert_eq!(condition.transpile_to_string(), rendered);

        let parameter_list = parameters
            .iter()
            .map(|parameter| format!("{parameter:?}"))
            .collect::<Vec<_>>();
        let expected_parameters = compiler
            .compile()
            .1
            .iter()
            .map(|parameter| format!("{parameter:?}"))
            .collect::<Vec<_>>();

        assert_eq!(parameter_list, expected_parameters);
    }

    #[test]
    fn transpile_empty_condition() {
        test_condition(&Filter::All(vec![]), "TRUE", &[]);
        test_condition(&Filter::Any(vec![]), "FALSE", &[]);
    }

    #[test]
    fn transpile_exists_condition() {
        test_condition(
            &Filter::Exists {
                path: DataTypeQueryPath::Description,
            },
            r#""data_types_0_1_0"."schema"->>'description' IS NULL"#,
            &[],
        );

        test_condition(
            &Filter::Not(Box::new(Filter::Exists {
                path: DataTypeQueryPath::Description,
            })),
            r#""data_types_0_1_0"."schema"->>'description' IS NOT NULL"#,
            &[],
        );
    }

    #[test]
    fn transpile_all_condition() {
        test_condition(
            &Filter::All(vec![Filter::Equal(
                FilterExpression::Path {
                    path: DataTypeQueryPath::VersionedUrl,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Borrowed(
                        "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    )),
                    convert: None,
                },
            )]),
            r#"("data_types_0_1_0"."schema"->>'$id' = $1)"#,
            &[&"https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"],
        );

        test_condition(
            &Filter::All(vec![
                Filter::Equal(
                    FilterExpression::Path {
                        path: DataTypeQueryPath::BaseUrl,
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Text(Cow::Borrowed(
                            "https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                        )),
                        convert: None,
                    },
                ),
                Filter::Equal(
                    FilterExpression::Path {
                        path: DataTypeQueryPath::Version,
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Decimal(Real::from_natural(1, 1)),
                        convert: None,
                    },
                ),
            ]),
            r#"("ontology_ids_0_1_0"."base_url" = $1) AND ("ontology_ids_0_1_0"."version" = $2)"#,
            &[
                &"https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                &Real::from_natural(1, 1),
            ],
        );
    }

    #[test]
    fn transpile_any_condition() {
        test_condition(
            &Filter::Any(vec![Filter::Equal(
                FilterExpression::Path {
                    path: DataTypeQueryPath::VersionedUrl,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Borrowed(
                        "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    )),
                    convert: None,
                },
            )]),
            r#"("data_types_0_1_0"."schema"->>'$id' = $1)"#,
            &[&"https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"],
        );

        test_condition(
            &Filter::Any(vec![
                Filter::Equal(
                    FilterExpression::Path {
                        path: DataTypeQueryPath::BaseUrl,
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Text(Cow::Borrowed(
                            "https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                        )),
                        convert: None,
                    },
                ),
                Filter::Equal(
                    FilterExpression::Path {
                        path: DataTypeQueryPath::Version,
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Decimal(Real::from_natural(1, 1)),
                        convert: None,
                    },
                ),
            ]),
            r#"(("ontology_ids_0_1_0"."base_url" = $1) OR ("ontology_ids_0_1_0"."version" = $2))"#,
            &[
                &"https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                &Real::from_natural(1, 1),
            ],
        );
    }

    #[test]
    fn transpile_not_condition() {
        test_condition(
            &Filter::Not(Box::new(Filter::Equal(
                FilterExpression::Path {
                    path: DataTypeQueryPath::VersionedUrl,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Borrowed(
                        "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    )),
                    convert: None,
                },
            ))),
            r#"NOT("data_types_0_1_0"."schema"->>'$id' = $1)"#,
            &[&"https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"],
        );
    }

    #[test]
    fn transpile_starts_with_condition() {
        test_condition(
            &Filter::StartsWith(
                FilterExpression::Path {
                    path: DataTypeQueryPath::Title,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Borrowed("foo")),
                    convert: None,
                },
            ),
            r#"starts_with("data_types_0_1_0"."schema"->>'title', $1)"#,
            &[&"foo"],
        );
    }

    #[test]
    fn transpile_ends_with_condition() {
        test_condition(
            &Filter::EndsWith(
                FilterExpression::Path {
                    path: DataTypeQueryPath::Title,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Borrowed("bar")),
                    convert: None,
                },
            ),
            r#"right("data_types_0_1_0"."schema"->>'title', length($1)) = $1"#,
            &[&"bar"],
        );
    }

    #[test]
    fn transpile_contains_segment_condition() {
        test_condition(
            &Filter::ContainsSegment(
                FilterExpression::Path {
                    path: DataTypeQueryPath::Title,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Borrowed("baz")),
                    convert: None,
                },
            ),
            r#"strpos("data_types_0_1_0"."schema"->>'title', $1) > 0"#,
            &[&"baz"],
        );
    }

    #[test]
    fn render_without_parameters() {
        test_condition(
            &Filter::Any(vec![Filter::Equal(
                FilterExpression::Path {
                    path: DataTypeQueryPath::Description,
                },
                FilterExpression::Path {
                    path: DataTypeQueryPath::Title,
                },
            )]),
            r#"("data_types_0_1_0"."schema"->>'description' = "data_types_0_1_0"."schema"->>'title')"#,
            &[],
        );
    }
}

use error_stack::{Report, Result, ResultExt};
use hql_cst_lex::{Lexer, Location, SyntaxKind, Token, TokenKind};

use super::util::{ArrayParser, EofParser, ObjectParser};
use crate::{
    value::{Value, ValueKind},
    Arena,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash, thiserror::Error)]
pub enum ValueParseError {
    #[error("unable to parse input")]
    Parse,
    #[error("unable to parse array")]
    Array,
    #[error("unable to parse object")]
    Object,
    #[error("unexpected token, received {received}")]
    UnexpectedToken { received: SyntaxKind },
    #[error("duplicate key {key}")]
    DuplicateKey { key: Box<str> },
}

pub(crate) struct ValueParser<'arena> {
    arena: &'arena Arena,
}

impl<'arena> ValueParser<'arena> {
    pub(crate) const fn new(arena: &'arena Arena) -> Self {
        Self { arena }
    }

    pub(crate) fn parse_value<'source>(
        &self,
        lexer: &mut Lexer<'source>,
        token: Option<Token<'source>>,
    ) -> Result<Value<'arena, 'source>, ValueParseError> {
        let token = if let Some(token) = token {
            token
        } else {
            let mut eof = EofParser { lexer };
            eof.advance().change_context(ValueParseError::Parse)?
        };

        match token.kind {
            TokenKind::Bool(bool) => Ok(Value {
                kind: ValueKind::Bool(bool),
                span: token.span,
            }),
            TokenKind::Null => Ok(Value {
                kind: ValueKind::Null,
                span: token.span,
            }),
            TokenKind::Number(number) => Ok(Value {
                kind: ValueKind::Number(number),
                span: token.span,
            }),
            TokenKind::String(string) => Ok(Value {
                kind: ValueKind::String(string),
                span: token.span,
            }),
            TokenKind::LBracket => self.parse_array(lexer, token),
            TokenKind::LBrace => self.parse_object(lexer, token),
            _ => Err(Report::new(ValueParseError::UnexpectedToken {
                received: SyntaxKind::from(&token.kind),
            }))
            .attach(Location::new(token.span)),
        }
    }

    /// Parse a JSON object, expects the `[` to already be consumed
    fn parse_array<'source>(
        &self,
        lexer: &mut Lexer<'source>,
        token: Token<'source>,
    ) -> Result<Value<'arena, 'source>, ValueParseError> {
        let mut values = self.arena.vec(None);

        let mut parser = ArrayParser::new(lexer);

        let span = parser
            .parse(token, |lexer, token| {
                let item = self.parse_value(lexer, token)?;
                values.push(item);
                Ok(())
            })
            .change_context(ValueParseError::Array)?;

        Ok(Value {
            kind: ValueKind::Array(values),
            span,
        })
    }

    /// Parse a JSON object, expects the `{` to already be consumed
    fn parse_object<'source>(
        &self,
        lexer: &mut Lexer<'source>,
        token: Token<'source>,
    ) -> Result<Value<'arena, 'source>, ValueParseError> {
        let mut object = self.arena.hash_map(None);

        let mut parser = ObjectParser::new(lexer);
        let span = parser
            .parse(token, |lexer, key, key_span| {
                if object.contains_key(&key) {
                    return Err(Report::new(ValueParseError::DuplicateKey {
                        key: key.into_owned().into_boxed_str(),
                    })
                    .attach(Location::new(key_span)));
                }

                let value = self.parse_value(lexer, None)?;
                object.insert(key, value);
                Ok(())
            })
            .change_context(ValueParseError::Object)?;

        Ok(Value {
            kind: ValueKind::Object(object),
            span,
        })
    }
}

#[cfg(test)]
mod test {
    #![expect(
        clippy::integer_division_remainder_used,
        reason = "used in test-fuzz macro"
    )]
    use error_stack::{Frame, Report};
    use hql_cst_lex::Lexer;

    use super::ValueParseError;
    use crate::{
        arena::Arena,
        parse::json::value::ValueParser,
        value::{Value, ValueKind},
    };

    impl PartialEq<serde_json::Value> for Value<'_, '_> {
        #[expect(
            clippy::float_arithmetic,
            reason = "difference comparison for equality"
        )]
        fn eq(&self, other: &serde_json::Value) -> bool {
            match (&self.kind, other) {
                (ValueKind::Bool(a), serde_json::Value::Bool(b)) => a == b,
                (ValueKind::Null, serde_json::Value::Null) => true,
                (ValueKind::Number(a), serde_json::Value::Number(b)) => {
                    let Some(b) = b.as_f64() else {
                        return false;
                    };

                    f64::abs(a.as_f64_lossy() - b) < f64::EPSILON
                }
                (ValueKind::String(a), serde_json::Value::String(b)) => a == b,
                (ValueKind::Array(a), serde_json::Value::Array(b)) => {
                    a.iter().zip(b.iter()).all(|(a, b)| a == b)
                }
                (ValueKind::Object(a), serde_json::Value::Object(b)) => a
                    .iter()
                    .all(|(k, v)| b.get(k.as_ref()).map_or(false, |b| v == b)),
                _ => false,
            }
        }
    }

    fn parse_complete<'arena, 'source>(
        parser: &ValueParser<'arena>,
        lexer: &mut Lexer<'source>,
    ) -> error_stack::Result<Value<'arena, 'source>, ValueParseError> {
        let value = parser.parse_value(lexer, None)?;
        if lexer.advance().is_some() {
            // early eof is not handled by the parser itself
            return Err(Report::new(ValueParseError::Parse));
        }
        Ok(value)
    }

    #[test_fuzz::test_fuzz]
    fn assert_eq_serde(input: &str) {
        let input = input.trim_end(); // we ignore whitespace, serde_json does not
        let arena = Arena::new();
        let mut lexer = Lexer::new(input);
        let parser = ValueParser::new(&arena);

        let value_result = parse_complete(&parser, &mut lexer);
        let serde_result = serde_json::from_str::<serde_json::Value>(input);

        if let Err(error) = &serde_result {
            // serde_json number out of range is normal, because we don't have any precision checks
            // (we save it as a string for later)
            if error.to_string().contains("number out of range") {
                return;
            }

            if input.contains('\u{c}') {
                // serde_json does not support form feed, we do
                return;
            }
        }

        if let Err(error) = &value_result {
            let is_duplicate =
                error
                    .frames()
                    .filter_map(Frame::downcast_ref)
                    .any(|error: &ValueParseError| {
                        matches!(error, ValueParseError::DuplicateKey { .. })
                    });
            if is_duplicate {
                // we error out on duplicate keys, serde_json does not
                return;
            }
        }

        match (value_result, serde_result) {
            (Ok(a), Ok(b)) => assert_eq!(a, b),
            (Err(_), Err(_)) => {}
            (value, serde) => {
                panic!("input: {input:?}\nvalue: {value:?}\nserde: {serde:?}");
            }
        };
    }

    const INPUT: &str = r#"
    [
      {
        "Name": "Edward the Elder",
        "Country": "United Kingdom",
        "House": "House of Wessex",
        "Reign": "899-925",
        "ID": 1
      },
      {
        "Name": "Athelstan",
        "Country": "United Kingdom",
        "House": "House of Wessex",
        "Reign": "925-940",
        "ID": 2
      },
      {
        "Name": "Edmund",
        "Country": "United Kingdom",
        "House": "House of Wessex",
        "Reign": "940-946",
        "ID": 3
      },
      {
        "Name": "Edred",
        "Country": "United Kingdom",
        "House": "House of Wessex",
        "Reign": "946-955",
        "ID": 4
      },
      {
        "Name": "Edwy",
        "Country": "United Kingdom",
        "House": "House of Wessex",
        "Reign": "955-959",
        "ID": 5
      }
    ]"#;

    #[test]
    fn serde_integration() {
        // ensure that everything that serde can parse, we can parse as well
        assert_eq_serde(INPUT);
        assert_eq_serde("[[");
        assert_eq_serde("[[[]]");
        assert_eq_serde("{}");
        assert_eq_serde("{}}");
        assert_eq_serde(r#"{12: "12"}"#);
    }
}

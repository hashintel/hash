use text_size::TextRange;

use super::{
    Grammar, Parser,
    recovery::{self, ContainerStep},
};
use crate::{
    error::SyntaxErrorKind,
    lexer::ScannedToken,
    syntax_kind::{SyntaxKind, T},
    syntax_kind_set::SyntaxKindSet,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum PrimaryKind {
    Literal,
    Struct,
    Tuple,
    List,
    Dict,
}

impl PrimaryKind {
    const fn key(self) -> &'static str {
        match self {
            Self::Literal => "#literal",
            Self::Struct => "#struct",
            Self::Tuple => "#tuple",
            Self::List => "#list",
            Self::Dict => "#dict",
        }
    }

    const fn node_kind(self) -> SyntaxKind {
        match self {
            Self::Literal => SyntaxKind::Literal,
            Self::Struct => SyntaxKind::Struct,
            Self::Tuple => SyntaxKind::Tuple,
            Self::List => SyntaxKind::List,
            Self::Dict => SyntaxKind::Dict,
        }
    }

    fn from_key(key: &str) -> Option<Self> {
        match key {
            "#literal" => Some(Self::Literal),
            "#struct" => Some(Self::Struct),
            "#tuple" => Some(Self::Tuple),
            "#list" => Some(Self::List),
            "#dict" => Some(Self::Dict),
            _ => None,
        }
    }
}

const PRIMARY_KEYS: &[&str] = &["#literal", "#struct", "#dict", "#tuple", "#list"];
const ALL_EXPR_KEYS: &[&str] = &["#literal", "#struct", "#dict", "#tuple", "#list", "#type"];
const TYPE_ONLY_KEYS: &[&str] = &["#type"];

/// Parses a constructor object whose `#type` field may precede or follow the primary key.
pub(crate) fn parse_object<G: Grammar>(parser: &mut Parser<'_, G>) {
    let checkpoint = parser.checkpoint();
    let open = parser.bump(T!['{']).range;
    let err_start = parser.error_count();

    let mut primary: Option<(PrimaryKind, TextRange)> = None;
    let mut type_field: Option<(TextRange, TextRange)> = None;
    let mut has_unknown_or_error = false;
    let mut index = 0_usize;

    loop {
        match recovery::next_object_entry(parser, index) {
            ContainerStep::Closed | ContainerStep::Aborted => break,
            ContainerStep::Item => {
                index += 1;
                let key = parser.current().expect("next_object_entry guarantees key");
                parse_object_field(
                    parser,
                    key,
                    &mut primary,
                    &mut type_field,
                    &mut has_unknown_or_error,
                );
            }
        }
    }

    let node_kind = if let Some((kind, _)) = primary {
        kind.node_kind()
    } else {
        if let Some((_, field_range)) = type_field {
            if !has_unknown_or_error && parser.error_count() == err_start {
                parser.error(field_range, SyntaxErrorKind::OrphanedType);
            }
        } else if index == 0 && !has_unknown_or_error && parser.error_count() == err_start {
            let range = TextRange::new(open.start(), parser.last_token_end());
            parser.error(range, SyntaxErrorKind::EmptyObject);
        } else {
            // An unknown field or lexer error already explained why no constructor was formed.
        }
        SyntaxKind::JsonObject
    };

    parser.start_node_at(checkpoint, node_kind);
    parser.finish_node();
}

fn parse_object_field<G: Grammar>(
    parser: &mut Parser<'_, G>,
    key: ScannedToken,
    primary: &mut Option<(PrimaryKind, TextRange)>,
    type_field: &mut Option<(TextRange, TextRange)>,
    has_unknown_or_error: &mut bool,
) {
    let Some(decoded) = parser.decode_string(key) else {
        *has_unknown_or_error = true;
        parse_unknown_field(parser);
        return;
    };

    if let Some(kind) = PrimaryKind::from_key(&decoded) {
        match *primary {
            None => {
                *primary = Some((kind, key.range));
                parse_primary_field(parser, kind);
            }
            Some((existing, first_range)) if existing == kind => {
                parser.error(
                    key.range,
                    SyntaxErrorKind::DuplicateKey {
                        first: first_range,
                        key: existing.key(),
                    },
                );
                parse_unknown_field(parser);
            }
            Some(_) => {
                let expected = if G::ALLOW_TYPE_ANNOTATIONS && type_field.is_none() {
                    TYPE_ONLY_KEYS
                } else {
                    &[]
                };
                parser.error(
                    key.range,
                    SyntaxErrorKind::UnknownKey {
                        key: decoded.into_owned(),
                        expected,
                    },
                );
                *has_unknown_or_error = true;
                parse_unknown_field(parser);
            }
        }
        return;
    }

    if G::ALLOW_TYPE_ANNOTATIONS && decoded == "#type" {
        if let Some((first_range, _)) = *type_field {
            parser.error(
                key.range,
                SyntaxErrorKind::DuplicateKey {
                    first: first_range,
                    key: "#type",
                },
            );
            parse_unknown_field(parser);
        } else {
            let field_range = parse_type_field(parser);
            *type_field = Some((key.range, field_range));
        }
        return;
    }

    let expected = if primary.is_some() {
        if G::ALLOW_TYPE_ANNOTATIONS && type_field.is_none() {
            TYPE_ONLY_KEYS
        } else {
            &[]
        }
    } else if type_field.is_some() || !G::ALLOW_TYPE_ANNOTATIONS {
        PRIMARY_KEYS
    } else {
        ALL_EXPR_KEYS
    };

    parser.error(
        key.range,
        SyntaxErrorKind::UnknownKey {
            key: decoded.into_owned(),
            expected,
        },
    );
    *has_unknown_or_error = true;
    parse_unknown_field(parser);
}

fn parse_primary_field<G: Grammar>(parser: &mut Parser<'_, G>, kind: PrimaryKind) {
    match kind {
        PrimaryKind::Literal => parse_constructor_field(
            parser,
            SyntaxKind::LiteralField,
            SyntaxKindSet::VALUE,
            |found| SyntaxErrorKind::LiteralExpectedPrimitive { found },
            |parser, token_kind| {
                parser.start_node(SyntaxKind::LiteralValue);
                parser.bump(token_kind);
                parser.finish_node();
            },
        ),
        PrimaryKind::Struct => parse_constructor_field(
            parser,
            SyntaxKind::StructField,
            SyntaxKindSet::from_kind(T!['{']),
            |found| SyntaxErrorKind::StructExpectedObject { found },
            |parser, _| parse_struct_body(parser),
        ),
        PrimaryKind::Tuple => parse_constructor_field(
            parser,
            SyntaxKind::TupleField,
            SyntaxKindSet::from_kind(T!['[']),
            |found| SyntaxErrorKind::TupleExpectedArray { found },
            |parser, _| {
                parse_sequence_body(parser, SyntaxKind::TupleBody, SyntaxKind::TupleElement);
            },
        ),
        PrimaryKind::List => parse_constructor_field(
            parser,
            SyntaxKind::ListField,
            SyntaxKindSet::from_kind(T!['[']),
            |found| SyntaxErrorKind::ListExpectedArray { found },
            |parser, _| parse_sequence_body(parser, SyntaxKind::ListBody, SyntaxKind::ListElement),
        ),
        PrimaryKind::Dict => parse_constructor_field(
            parser,
            SyntaxKind::DictField,
            SyntaxKindSet::OPENING_DELIMITER,
            |found| SyntaxErrorKind::DictExpectedFormat { found },
            |parser, kind| {
                if kind == T!['{'] {
                    parse_dict_object_body(parser);
                } else {
                    parse_dict_array_body(parser);
                }
            },
        ),
    }
}

fn parse_constructor_field<G: Grammar>(
    parser: &mut Parser<'_, G>,
    field_kind: SyntaxKind,
    expected: SyntaxKindSet,
    make_mismatch: impl FnOnce(SyntaxKind) -> SyntaxErrorKind,
    parse_body: impl FnOnce(&mut Parser<'_, G>, SyntaxKind),
) {
    parser.start_node(field_kind);
    parser.bump(T![string]);

    if recovery::expect_colon(parser) {
        match parser.current() {
            None => {
                let eof = parser.eof_range();
                parser.error(eof, SyntaxErrorKind::UnexpectedEof { expected });
            }
            Some(token) if expected.contains(token.kind) => parse_body(parser, token.kind),
            Some(token) if token.kind == SyntaxKind::InvalidToken => {
                parser.start_node(SyntaxKind::Error);
                parser.bump(SyntaxKind::InvalidToken);
                parser.finish_node();
            }
            Some(token) => {
                parser.error(token.range, make_mismatch(token.kind));
                if !matches!(token.kind, T![,] | T!['}'] | T![']']) {
                    recovery::parse_json_value(parser);
                }
            }
        }
    }

    parser.finish_node();
}

fn parse_type_field<G: Grammar>(parser: &mut Parser<'_, G>) -> TextRange {
    let key_start = parser
        .current()
        .expect("type field starts at key token")
        .range
        .start();

    parse_constructor_field(
        parser,
        SyntaxKind::TypeField,
        SyntaxKindSet::from_kind(T![string]),
        |found| SyntaxErrorKind::TypeExpectedString { found },
        |parser, _| {
            parser.start_node(SyntaxKind::TypeAnnotation);
            parser.bump(T![string]);
            parser.finish_node();
        },
    );

    TextRange::new(key_start, parser.last_token_end())
}

fn parse_unknown_field<G: Grammar>(parser: &mut Parser<'_, G>) {
    parser.start_node(SyntaxKind::UnknownField);
    parser.bump(T![string]);
    if recovery::expect_colon(parser)
        && !matches!(
            parser.current().map(|tok| tok.kind),
            None | Some(T![,] | T!['}'] | T![']'])
        )
    {
        recovery::parse_json_value(parser);
    }
    parser.finish_node();
}

fn parse_struct_body<G: Grammar>(parser: &mut Parser<'_, G>) {
    parser.start_node(SyntaxKind::StructBody);
    parser.bump(T!['{']);

    let mut index = 0_usize;
    loop {
        match recovery::next_object_entry(parser, index) {
            ContainerStep::Closed | ContainerStep::Aborted => break,
            ContainerStep::Item => {
                index += 1;
                parser.start_node(SyntaxKind::StructEntry);
                parser.bump(T![string]);
                if recovery::expect_colon(parser) {
                    G::parse_item(parser);
                }
                parser.finish_node();
            }
        }
    }

    parser.finish_node();
}

fn parse_sequence_body<G: Grammar>(
    parser: &mut Parser<'_, G>,
    body_kind: SyntaxKind,
    element_kind: SyntaxKind,
) {
    parser.start_node(body_kind);
    parser.bump(T!['[']);

    let mut index = 0_usize;
    loop {
        match recovery::next_array_element(parser, index, |kind| G::ITEM_FIRST.contains(kind)) {
            ContainerStep::Closed | ContainerStep::Aborted => break,
            ContainerStep::Item => {
                index += 1;
                parser.start_node(element_kind);
                G::parse_item(parser);
                parser.finish_node();
            }
        }
    }

    parser.finish_node();
}

fn parse_dict_object_body<G: Grammar>(parser: &mut Parser<'_, G>) {
    parser.start_node(SyntaxKind::DictObjectBody);
    parser.bump(T!['{']);

    let mut index = 0_usize;
    loop {
        match recovery::next_object_entry(parser, index) {
            ContainerStep::Closed | ContainerStep::Aborted => break,
            ContainerStep::Item => {
                index += 1;
                parser.start_node(SyntaxKind::DictObjectEntry);
                parser.bump(T![string]);
                if recovery::expect_colon(parser) {
                    G::parse_item(parser);
                }
                parser.finish_node();
            }
        }
    }

    parser.finish_node();
}

fn parse_dict_array_body<G: Grammar>(parser: &mut Parser<'_, G>) {
    parser.start_node(SyntaxKind::DictArrayBody);
    parser.bump(T!['[']);

    let mut index = 0_usize;
    loop {
        match recovery::next_array_element(parser, index, |kind| kind == T!['[']) {
            ContainerStep::Closed | ContainerStep::Aborted => break,
            ContainerStep::Item => {
                index += 1;
                parse_dict_array_entry(parser);
            }
        }
    }

    parser.finish_node();
}

fn parse_dict_array_entry<G: Grammar>(parser: &mut Parser<'_, G>) {
    let Some(token) = parser.current() else {
        return;
    };

    if token.kind == SyntaxKind::InvalidToken {
        parser.start_node(SyntaxKind::DictArrayEntry);
        parser.start_node(SyntaxKind::Error);
        parser.bump(SyntaxKind::InvalidToken);
        parser.finish_node();
        parser.finish_node();
        return;
    }

    if token.kind != T!['['] {
        parser.error(
            token.range,
            SyntaxErrorKind::DictEntryExpectedArray { found: token.kind },
        );
        parser.start_node(SyntaxKind::DictArrayEntry);
        recovery::parse_json_value(parser);
        parser.finish_node();
        return;
    }

    parser.start_node(SyntaxKind::DictArrayEntry);
    let open = parser.bump(T!['[']).range;
    let err_start = parser.error_count();

    let mut count = 0_usize;
    let mut excess = Vec::new();

    loop {
        match recovery::next_array_element(parser, count, |kind| G::ITEM_FIRST.contains(kind)) {
            ContainerStep::Closed | ContainerStep::Aborted => break,
            ContainerStep::Item => {
                let item_start = parser.current().map(|tok| tok.range.start());
                G::parse_item(parser);
                if count >= 2
                    && let Some(start) = item_start
                {
                    excess.push(TextRange::new(start, parser.last_token_end()));
                }
                count += 1;
            }
        }
    }

    if let Some((&first_excess, rest)) = excess.split_first() {
        parser.error(
            first_excess,
            SyntaxErrorKind::DictEntryTooManyItems(rest.to_vec()),
        );
    } else if count < 2 && parser.error_count() == err_start {
        let range = TextRange::new(open.start(), parser.last_token_end());
        parser.error(
            range,
            SyntaxErrorKind::DictEntryTooFewItems { found: count },
        );
    } else {
        // Entry has two elements or already reported an inner syntax error.
    }

    parser.finish_node();
}

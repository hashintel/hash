use text_size::TextRange;

use super::{
    Grammar, Parser, dict,
    recovery::{self, ContainerStep},
};
use crate::{
    error::{ConstructorKind, EofContext, ObjectErrorKind, SyntaxErrorKind, ValueKind},
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
    const fn as_constructor(self) -> ConstructorKind {
        match self {
            Self::Literal => ConstructorKind::Literal,
            Self::Struct => ConstructorKind::Struct,
            Self::Tuple => ConstructorKind::Tuple,
            Self::List => ConstructorKind::List,
            Self::Dict => ConstructorKind::Dict,
        }
    }

    const fn key(self) -> &'static str {
        self.as_constructor().key()
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
        match recovery::next_object_entry(parser, open, index) {
            ContainerStep::Closed | ContainerStep::Aborted => break,
            ContainerStep::Item { .. } => {
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
                parser.error(
                    field_range,
                    SyntaxErrorKind::Object(ObjectErrorKind::OrphanedType),
                );
            }
        } else if index == 0 && !has_unknown_or_error && parser.error_count() == err_start {
            let range = TextRange::new(open.start(), parser.last_token_end());
            parser.error(
                range,
                SyntaxErrorKind::Object(ObjectErrorKind::Empty {
                    allow_type_annotations: G::ALLOW_TYPE_ANNOTATIONS,
                }),
            );
        } else {
            // An unknown field or lexer error already explained why the object has no constructor.
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
                    SyntaxErrorKind::Object(ObjectErrorKind::DuplicateKey {
                        first: first_range,
                        key: existing.key(),
                    }),
                );
                parse_unknown_field(parser);
            }
            Some((existing, existing_range)) => {
                parser.error(
                    key.range,
                    SyntaxErrorKind::Object(ObjectErrorKind::ConflictingConstructor {
                        existing: existing.as_constructor(),
                        existing_range,
                        found: kind.as_constructor(),
                        allow_type: G::ALLOW_TYPE_ANNOTATIONS && type_field.is_none(),
                    }),
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
                SyntaxErrorKind::Object(ObjectErrorKind::DuplicateKey {
                    first: first_range,
                    key: "#type",
                }),
            );
            parse_unknown_field(parser);
        } else {
            let field_range = parse_type_field(parser);
            *type_field = Some((key.range, field_range));
        }
        return;
    }

    let type_annotations_disallowed = !G::ALLOW_TYPE_ANNOTATIONS && decoded == "#type";
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
        SyntaxErrorKind::Object(ObjectErrorKind::UnknownKey {
            key: decoded.into_owned(),
            expected,
            primary_key: primary.map(|(kind, range)| (kind.as_constructor(), range)),
            type_annotations_disallowed,
        }),
    );
    *has_unknown_or_error = true;
    parse_unknown_field(parser);
}

fn parse_primary_field<G: Grammar>(parser: &mut Parser<'_, G>, kind: PrimaryKind) {
    match kind {
        PrimaryKind::Literal => parse_constructor_field(
            parser,
            SyntaxKind::LiteralField,
            ConstructorKind::Literal,
            SyntaxKindSet::VALUE,
            |key, found| {
                SyntaxErrorKind::Object(ObjectErrorKind::LiteralExpectedPrimitive { key, found })
            },
            |parser, _, token_kind| {
                parser.start_node(SyntaxKind::LiteralValue);
                parser.bump(token_kind);
                parser.finish_node();
            },
        ),
        PrimaryKind::Struct => parse_constructor_field(
            parser,
            SyntaxKind::StructField,
            ConstructorKind::Struct,
            SyntaxKindSet::from_kind(T!['{']),
            |key, found| {
                SyntaxErrorKind::Object(ObjectErrorKind::StructExpectedObject { key, found })
            },
            |parser, _, _| parse_struct_body(parser),
        ),
        PrimaryKind::Tuple => parse_constructor_field(
            parser,
            SyntaxKind::TupleField,
            ConstructorKind::Tuple,
            SyntaxKindSet::from_kind(T!['[']),
            |key, found| {
                SyntaxErrorKind::Object(ObjectErrorKind::TupleExpectedArray { key, found })
            },
            |parser, _, _| {
                parse_sequence_body(parser, SyntaxKind::TupleBody, SyntaxKind::TupleElement);
            },
        ),
        PrimaryKind::List => parse_constructor_field(
            parser,
            SyntaxKind::ListField,
            ConstructorKind::List,
            SyntaxKindSet::from_kind(T!['[']),
            |key, found| SyntaxErrorKind::Object(ObjectErrorKind::ListExpectedArray { key, found }),
            |parser, _, _| {
                parse_sequence_body(parser, SyntaxKind::ListBody, SyntaxKind::ListElement);
            },
        ),
        PrimaryKind::Dict => parse_constructor_field(
            parser,
            SyntaxKind::DictField,
            ConstructorKind::Dict,
            SyntaxKindSet::OPENING_DELIMITER,
            |key, found| {
                SyntaxErrorKind::Object(ObjectErrorKind::DictExpectedFormat { key, found })
            },
            |parser, key_range, token_kind| {
                if token_kind == T!['{'] {
                    dict::parse_dict_object_body(parser);
                } else {
                    dict::parse_dict_array_body(parser, key_range);
                }
            },
        ),
    }
}

fn parse_constructor_field<G: Grammar>(
    parser: &mut Parser<'_, G>,
    field_kind: SyntaxKind,
    constructor: ConstructorKind,
    expected: SyntaxKindSet,
    make_mismatch: impl FnOnce(TextRange, Option<ValueKind>) -> SyntaxErrorKind,
    parse_body: impl FnOnce(&mut Parser<'_, G>, TextRange, SyntaxKind),
) {
    parser.start_node(field_kind);
    let key_range = parser.bump(T![string]).range;

    if recovery::expect_colon(parser, key_range) {
        match parser.current() {
            None => {
                parser.record_eof(
                    expected,
                    EofContext::FieldValue {
                        key: key_range,
                        constructor: Some(constructor),
                    },
                );
            }
            Some(token) if expected.contains(token.kind) => {
                parse_body(parser, key_range, token.kind);
            }
            Some(token) if token.kind == SyntaxKind::InvalidToken => {
                parser.start_node(SyntaxKind::Error);
                parser.bump(SyntaxKind::InvalidToken);
                parser.finish_node();
            }
            Some(token) if matches!(token.kind, T![,] | T!['}'] | T![']']) => {
                parser.error(
                    TextRange::empty(token.range.start()),
                    make_mismatch(key_range, None),
                );
            }
            Some(token) => {
                let start = token.range.start();
                let found = ValueKind::from_syntax_kind(token.kind);
                recovery::parse_json_value(parser);
                let value_range = TextRange::new(start, parser.last_token_end());
                parser.error(value_range, make_mismatch(key_range, found));
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
        ConstructorKind::Type,
        SyntaxKindSet::from_kind(T![string]),
        |key, found| SyntaxErrorKind::Object(ObjectErrorKind::TypeExpectedString { key, found }),
        |parser, _, _| {
            parser.start_node(SyntaxKind::TypeAnnotation);
            parser.bump(T![string]);
            parser.finish_node();
        },
    );

    TextRange::new(key_start, parser.last_token_end())
}

fn parse_unknown_field<G: Grammar>(parser: &mut Parser<'_, G>) {
    parser.start_node(SyntaxKind::UnknownField);
    let key_range = parser.bump(T![string]).range;
    if recovery::expect_colon(parser, key_range)
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
    let open = parser.bump(T!['{']).range;

    let mut index = 0_usize;
    loop {
        match recovery::next_object_entry(parser, open, index) {
            ContainerStep::Closed | ContainerStep::Aborted => break,
            ContainerStep::Item { .. } => {
                index += 1;
                parser.start_node(SyntaxKind::StructEntry);
                let key_range = parser.bump(T![string]).range;
                if recovery::expect_colon(parser, key_range) {
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
    let open = parser.bump(T!['[']).range;

    let mut index = 0_usize;
    loop {
        match recovery::next_array_element(parser, open, index, |kind| G::ITEM_FIRST.contains(kind))
        {
            ContainerStep::Closed | ContainerStep::Aborted => break,
            ContainerStep::Item { .. } => {
                index += 1;
                parser.start_node(element_kind);
                G::parse_item(parser);
                parser.finish_node();
            }
        }
    }

    parser.finish_node();
}

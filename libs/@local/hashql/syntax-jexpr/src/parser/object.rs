use alloc::borrow::Cow;
use core::{alloc::Allocator, ops::ControlFlow};

use rowan::Checkpoint;
use text_size::TextRange;

use super::{
    Grammar, Parser, dict,
    recovery::{self, FieldValue},
};
use crate::{
    error::{ConstructorKind, EofContext, FieldKind, ObjectErrorKind, SyntaxErrorKind, ValueKind},
    lexer::Token,
    syntax_kind::{SyntaxKind, T},
};

const PRIMARY_KEYS: &[&str] = &["#literal", "#struct", "#dict", "#tuple", "#list"];
const ALL_EXPR_KEYS: &[&str] = &["#literal", "#struct", "#dict", "#tuple", "#list", "#type"];
const TYPE_ONLY_KEYS: &[&str] = &["#type"];

fn parse_unknown_field<G, A>(parser: &mut Parser<'_, G, A>)
where
    G: Grammar,
    A: Allocator + Clone,
{
    parser.start_node(SyntaxKind::UnknownField);
    let key_range = parser.bump(T![string]).range;
    if let ControlFlow::Continue(FieldValue::Token(_)) = recovery::expect_colon(parser, key_range) {
        recovery::parse_json_value(parser);
    }
    parser.finish_node();
}

fn parse_struct_body<G, A>(parser: &mut Parser<'_, G, A>)
where
    G: Grammar,
    A: Allocator + Clone,
{
    parser.start_node(SyntaxKind::StructBody);
    let open = parser.bump(T!['{']).range;

    let mut index = 0_usize;
    while let ControlFlow::Continue(_) = recovery::next_object_entry(parser, open, index) {
        index += 1;

        parser.start_node(SyntaxKind::StructEntry);
        let key_range = parser.bump(T![string]).range;
        if let ControlFlow::Continue(_) = recovery::expect_colon(parser, key_range) {
            parser.nested(G::parse_item);
        }
        parser.finish_node();
    }

    parser.finish_node();
}

fn parse_sequence_body<G, A>(
    parser: &mut Parser<'_, G, A>,
    body_kind: SyntaxKind,
    element_kind: SyntaxKind,
) where
    G: Grammar,
    A: Allocator + Clone,
{
    parser.start_node(body_kind);
    let open = parser.bump(T!['[']).range;

    let mut index = 0_usize;
    while let ControlFlow::Continue(_) =
        recovery::next_array_element(parser, open, index, G::ITEM_FIRST)
    {
        index += 1;
        parser.start_node(element_kind);
        parser.nested(G::parse_item);
        parser.finish_node();
    }

    parser.finish_node();
}

fn parse_field_body<G, A>(
    parser: &mut Parser<'_, G, A>,
    field: FieldKind,
    key_range: TextRange,
    token_kind: SyntaxKind,
) where
    G: Grammar,
    A: Allocator + Clone,
{
    match field {
        FieldKind::Constructor(ConstructorKind::Literal) => {
            parser.start_node(SyntaxKind::LiteralValue);
            parser.bump(token_kind);
            parser.finish_node();
        }
        FieldKind::Constructor(ConstructorKind::Struct) => parse_struct_body(parser),
        FieldKind::Constructor(ConstructorKind::Tuple) => {
            parse_sequence_body(parser, SyntaxKind::TupleBody, SyntaxKind::TupleElement);
        }
        FieldKind::Constructor(ConstructorKind::List) => {
            parse_sequence_body(parser, SyntaxKind::ListBody, SyntaxKind::ListElement);
        }
        FieldKind::Constructor(ConstructorKind::Dict) => {
            if token_kind == T!['{'] {
                dict::parse_dict_object_body(parser);
            } else {
                dict::parse_dict_array_body(parser, key_range);
            }
        }
        FieldKind::Type => {
            parser.start_node(SyntaxKind::TypeAnnotation);
            parser.bump(T![string]);
            parser.finish_node();
        }
    }
}

fn parse_known_field<G, A>(parser: &mut Parser<'_, G, A>, field: FieldKind) -> TextRange
where
    G: Grammar,
    A: Allocator + Clone,
{
    parser.start_node(field.syntax_kind());
    let key_range = parser.bump(T![string]).range;

    if let ControlFlow::Continue(value) = recovery::expect_colon(parser, key_range) {
        let expected = field.expected_value();
        match value {
            FieldValue::Eof => {
                parser.record_eof(
                    expected,
                    EofContext::FieldValue {
                        key: key_range,
                        field: Some(field),
                    },
                );
            }
            FieldValue::Token(token) if expected.contains(token.kind) => {
                parse_field_body(parser, field, key_range, token.kind);
            }
            FieldValue::Token(token) if token.kind == SyntaxKind::InvalidToken => {
                parser.skip_invalid_tokens();

                if let Some(token) = parser.current()
                    && expected.contains(token.kind)
                {
                    parse_field_body(parser, field, key_range, token.kind);
                }
            }
            FieldValue::Missing(boundary) => {
                parser.error(
                    TextRange::empty(boundary.range.start()),
                    SyntaxErrorKind::Object(ObjectErrorKind::ExpectedValue {
                        field,
                        key: key_range,
                        found: None,
                    }),
                );
            }
            FieldValue::Token(token) => {
                let start = token.range.start();
                let found = ValueKind::from_syntax_kind(token.kind);
                recovery::parse_json_value(parser);
                let value_range = TextRange::new(start, parser.last_token_end());
                parser.error(
                    value_range,
                    SyntaxErrorKind::Object(ObjectErrorKind::ExpectedValue {
                        field,
                        key: key_range,
                        found,
                    }),
                );
            }
        }
    }

    parser.finish_node();
    TextRange::new(key_range.start(), parser.last_token_end())
}

#[derive(Copy, Clone)]
struct ConstructorField {
    kind: ConstructorKind,
    key: TextRange,
}

#[derive(Copy, Clone)]
struct TypeFieldSpan {
    key: TextRange,
    range: TextRange,
}

#[derive(Default)]
struct ObjectFields {
    primary: Option<ConstructorField>,
    type_field: Option<TypeFieldSpan>,
    has_unknown_or_error: bool,
}

impl ObjectFields {
    const fn expected_keys(&self, allow_type_annotations: bool) -> &'static [&'static str] {
        if self.primary.is_some() {
            if allow_type_annotations && self.type_field.is_none() {
                TYPE_ONLY_KEYS
            } else {
                &[]
            }
        } else if self.type_field.is_some() || !allow_type_annotations {
            PRIMARY_KEYS
        } else {
            ALL_EXPR_KEYS
        }
    }

    fn parse_constructor<G, A>(
        &mut self,
        parser: &mut Parser<'_, G, A>,
        kind: ConstructorKind,
        key: TextRange,
    ) where
        G: Grammar,
        A: Allocator + Clone,
    {
        match self.primary {
            None => {
                self.primary = Some(ConstructorField { kind, key });
                let _: TextRange = parse_known_field(parser, FieldKind::Constructor(kind));
            }
            Some(existing) if existing.kind == kind => {
                parser.error(
                    key,
                    SyntaxErrorKind::Object(ObjectErrorKind::DuplicateKey {
                        first: existing.key,
                        key: existing.kind.key(),
                    }),
                );
                parse_unknown_field(parser);
            }
            Some(existing) => {
                parser.error(
                    key,
                    SyntaxErrorKind::Object(ObjectErrorKind::ConflictingConstructor {
                        existing: existing.kind,
                        existing_range: existing.key,
                        found: kind,
                        allow_type: G::ALLOW_TYPE_ANNOTATIONS && self.type_field.is_none(),
                    }),
                );
                self.has_unknown_or_error = true;
                parse_unknown_field(parser);
            }
        }
    }

    fn parse_type<G, A>(&mut self, parser: &mut Parser<'_, G, A>, key: TextRange)
    where
        G: Grammar,
        A: Allocator + Clone,
    {
        if let Some(existing) = self.type_field {
            parser.error(
                key,
                SyntaxErrorKind::Object(ObjectErrorKind::DuplicateKey {
                    first: existing.key,
                    key: FieldKind::Type.key(),
                }),
            );
            parse_unknown_field(parser);
        } else {
            let range = parse_known_field(parser, FieldKind::Type);
            self.type_field = Some(TypeFieldSpan { key, range });
        }
    }

    fn parse_unknown<G, A>(
        &mut self,
        parser: &mut Parser<'_, G, A>,
        decoded: Cow<'_, str>,
        key: TextRange,
    ) where
        G: Grammar,
        A: Allocator + Clone,
    {
        let type_annotations_disallowed = !G::ALLOW_TYPE_ANNOTATIONS && decoded == "#type";
        let expected = self.expected_keys(G::ALLOW_TYPE_ANNOTATIONS);

        parser.error(
            key,
            SyntaxErrorKind::Object(ObjectErrorKind::UnknownKey {
                key: decoded.into_owned(),
                expected,
                primary_key: self.primary.map(|field| (field.kind, field.key)),
                type_annotations_disallowed,
            }),
        );
        self.has_unknown_or_error = true;
        parse_unknown_field(parser);
    }

    fn parse_field<G, A>(&mut self, parser: &mut Parser<'_, G, A>, key: Token<'_>)
    where
        G: Grammar,
        A: Allocator + Clone,
    {
        let Some(decoded) = key.decode_string() else {
            self.has_unknown_or_error = true;
            parse_unknown_field(parser);
            return;
        };

        if let Some(kind) = ConstructorKind::from_key(&decoded) {
            self.parse_constructor(parser, kind, key.range);
            return;
        }

        if G::ALLOW_TYPE_ANNOTATIONS && decoded == "#type" {
            self.parse_type(parser, key.range);
            return;
        }

        self.parse_unknown(parser, decoded, key.range);
    }

    fn resolve_node_kind<G, A: Allocator>(
        self,
        parser: &mut Parser<'_, G, A>,
        open: TextRange,
        error_start: usize,
        count: usize,
    ) -> SyntaxKind
    where
        G: Grammar,
    {
        if let Some(primary) = self.primary {
            return primary.kind.node_kind();
        }

        if let Some(type_field) = self.type_field {
            if !self.has_unknown_or_error && parser.error_count() == error_start {
                parser.error(
                    type_field.range,
                    SyntaxErrorKind::Object(ObjectErrorKind::OrphanedType),
                );
            }
        } else if count == 0 && !self.has_unknown_or_error && parser.error_count() == error_start {
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
    }
}

/// Opening `{` state captured before flushing interior trivia or inspecting the first field key.
#[derive(Copy, Clone)]
pub(crate) struct OpenObject {
    pub checkpoint: Checkpoint,
    pub open: TextRange,
    pub error_start: usize,
}

impl OpenObject {
    pub(crate) fn open<G, A: Allocator>(parser: &mut Parser<'_, G, A>) -> Self
    where
        G: Grammar,
    {
        let checkpoint = parser.checkpoint();
        let open = parser.bump(T!['{']).range;
        let error_start = parser.error_count();

        Self {
            checkpoint,
            open,
            error_start,
        }
    }

    pub(crate) fn parse_object<G, A>(self, parser: &mut Parser<'_, G, A>)
    where
        G: Grammar,
        A: Allocator + Clone,
    {
        let mut fields = ObjectFields::default();
        let mut count = 0_usize;

        while let ControlFlow::Continue(_) = recovery::next_object_entry(parser, self.open, count) {
            count += 1;
            let key = parser.current().expect("next_object_entry guarantees key");
            fields.parse_field(parser, key);
        }

        let node_kind = fields.resolve_node_kind(parser, self.open, self.error_start, count);

        parser.start_node_at(self.checkpoint, node_kind);
        parser.finish_node();
    }
}

/// Parses a constructor object whose `#type` field may precede or follow the primary key.
pub(crate) fn parse_object<G, A>(parser: &mut Parser<'_, G, A>)
where
    G: Grammar,
    A: Allocator + Clone,
{
    OpenObject::open(parser).parse_object(parser);
}

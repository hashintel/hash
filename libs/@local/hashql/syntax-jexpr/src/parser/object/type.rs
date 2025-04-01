use hashql_ast::{
    heap,
    node::{expr::Expr, r#type::Type},
};
use text_size::TextRange;

use super::{
    ObjectState, State,
    dict::DictNode,
    error::{ObjectDiagnosticCategory, duplicate_key, unknown_key},
    list::ListNode,
    literal::LiteralNode,
    r#struct::StructNode,
    tuple::TupleNode,
    visit::Key,
};
use crate::{
    ParserState,
    error::ResultExt as _,
    lexer::{syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet},
    parser::{
        error::{ParserDiagnostic, unexpected_token},
        object::error::orphaned_type,
        string::parse_type_from_token,
    },
};

// The `#type` field is present
// but without `#struct`, `#dict`, `#list`, `#tuple` present
pub(crate) struct TypeNode<'heap> {
    key_span: TextRange,
    value_span: TextRange,

    value: Type<'heap>,
}

impl<'heap> TypeNode<'heap> {
    pub(crate) fn parse(
        state: &mut ParserState<'heap, '_>,
        key: &Key<'_>,
    ) -> Result<Self, ParserDiagnostic> {
        let (value_span, value) = parse_type(state).change_category(From::from)?;

        Ok(Self {
            key_span: key.span,
            value_span,
            value,
        })
    }

    pub(crate) fn into_inner(self) -> Type<'heap> {
        self.value
    }

    pub(crate) fn finish(
        node: Option<Self>,
        state: &ParserState<'heap, '_>,
    ) -> Option<heap::Box<'heap, Type<'heap>>> {
        node.map(Self::into_inner)
            .map(|r#type| state.heap().boxed(r#type))
    }
}

impl<'heap> State<'heap> for TypeNode<'heap> {
    fn handle(
        self,
        state: &mut ParserState<'heap, '_>,
        key: Key<'_>,
    ) -> Result<ObjectState<'heap>, ParserDiagnostic> {
        match &*key.value {
            "#literal" => LiteralNode::parse(state, &key)
                .map(|node| node.with_type(self))
                .map(ObjectState::Literal),
            "#struct" => StructNode::parse(state, &key)
                .map(|node| node.with_type(self))
                .map(ObjectState::Struct),
            "#dict" => DictNode::parse(state, &key)
                .map(|node| node.with_type(self))
                .map(ObjectState::Dict),
            "#tuple" => TupleNode::parse(state, &key)
                .map(|node| node.with_type(self))
                .map(ObjectState::Tuple),
            "#list" => ListNode::parse(state, &key)
                .map(|node| node.with_type(self))
                .map(ObjectState::List),
            "#type" => Err(duplicate_key(
                state.insert_range(self.key_span),
                state.insert_range(key.span),
                "#type",
            )
            .map_category(From::from)),
            _ => Err(unknown_key(
                state.insert_range(key.span),
                &key.value,
                &["#literal", "#struct", "#dict", "#tuple", "#list"],
            )
            .map_category(From::from)),
        }
    }

    fn build(
        self,
        state: &mut ParserState<'heap, '_>,
        _span: TextRange,
    ) -> Result<Expr<'heap>, ParserDiagnostic> {
        // to improve error visibility, we only show the error on the key-value pair of the type
        // instead of the whole object
        let span = state.insert_range(self.key_span.cover(self.value_span));

        Err(orphaned_type(span).map_category(From::from))
    }
}

pub(crate) fn handle_typed<'heap>(
    id: &'static str,
    id_span: TextRange,
    r#type: &mut Option<TypeNode<'heap>>,
    state: &mut ParserState<'heap, '_>,
    key: &Key<'_>,
) -> Result<(), ParserDiagnostic> {
    match &*key.value {
        key_value if key_value == id => Err(duplicate_key(
            state.insert_range(id_span),
            state.insert_range(key.span),
            id,
        )
        .map_category(From::from)),
        "#type" if let Some(r#type) = r#type => Err(duplicate_key(
            state.insert_range(r#type.key_span),
            state.insert_range(key.span),
            "#type",
        )
        .map_category(From::from)),
        "#type" => {
            let type_node = TypeNode::parse(state, key)?;

            *r#type = Some(type_node);
            Ok(())
        }
        _ => Err(unknown_key(
            state.insert_range(key.span),
            &key.value,
            if r#type.is_some() { &[] } else { &["#type"] },
        )
        .map_category(From::from)),
    }
}

fn parse_type<'heap>(
    state: &mut ParserState<'heap, '_>,
) -> Result<(TextRange, Type<'heap>), ParserDiagnostic> {
    // right now we only support string for types that are parsed.
    let token = state.advance().change_category(From::from)?;
    let span = token.span;

    let r#type = if token.kind.syntax() == SyntaxKind::String {
        parse_type_from_token(state, token).change_category(From::from)?
    } else {
        let span = state.insert_range(token.span);

        return Err(unexpected_token(
            span,
            ObjectDiagnosticCategory::InvalidType,
            SyntaxKindSet::from_slice(&[SyntaxKind::String]),
        )
        .map_category(From::from));
    };

    Ok((span, r#type))
}

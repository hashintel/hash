use hashql_ast::node::{expr::Expr, r#type::Type};
use hashql_core::heap;
use text_size::TextRange;

use super::{
    ObjectState, State,
    dict::DictNode,
    error::{duplicate_key, type_expected_string, unknown_key},
    list::ListNode,
    literal::LiteralNode,
    r#struct::StructNode,
    tuple::TupleNode,
    visit::Key,
};
use crate::{
    ParserState,
    error::ResultExt as _,
    lexer::syntax_kind::SyntaxKind,
    parser::{
        error::ParserDiagnostic, object::error::orphaned_type, state::Expected,
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
        state: &mut ParserState<'heap, '_, '_>,
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
        state: &ParserState<'heap, '_, '_>,
    ) -> Option<heap::Box<'heap, Type<'heap>>> {
        node.map(Self::into_inner)
            .map(|r#type| Box::new_in(r#type, state.heap()))
    }
}

impl<'heap> State<'heap> for TypeNode<'heap> {
    fn handle(
        self,
        state: &mut ParserState<'heap, '_, '_>,
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
        state: &mut ParserState<'heap, '_, '_>,
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
    state: &mut ParserState<'heap, '_, '_>,
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
    state: &mut ParserState<'heap, '_, '_>,
) -> Result<(TextRange, Type<'heap>), ParserDiagnostic> {
    // We do not use the `expected` of advance here, so that we're able to give the user a better
    // error message.
    let token = state
        .advance(Expected::hint(SyntaxKind::String))
        .change_category(From::from)?;

    if token.kind.syntax() != SyntaxKind::String {
        return Err(
            type_expected_string(state.insert_range(token.span), token.kind.syntax())
                .map_category(From::from),
        );
    }

    let span = token.span;
    let r#type = parse_type_from_token(state, token).change_category(From::from)?;

    Ok((span, r#type))
}

#[cfg(test)]
mod tests {
    use insta::{assert_snapshot, with_settings};

    use crate::{
        lexer::syntax_kind::SyntaxKind,
        parser::{object::parse_object, test::bind_parser},
    };

    // Create a parser binding that will handle objects starting with '{'
    bind_parser!(fn parse_object_expr(parse_object, SyntaxKind::LBrace));

    #[test]
    fn parse_invalid_type() {
        let result = parse_object_expr(r##"{"#type": ""}"##)
            .expect_err("should not be able to parse an empty type");

        with_settings!({
            description => "Parses an invalid type"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.diagnostic, &result.input);
        });
    }

    #[test]
    fn parse_invalid_syntax() {
        let result = parse_object_expr(r##"{"#type": ["a"]}"##)
            .expect_err("should not be able to parse an invalid syntax");

        with_settings!({
            description => "Parses invalid syntax"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.diagnostic, &result.input);
        });
    }

    #[test]
    fn parse_incomplete() {
        // Empty dict with object format
        let result =
            parse_object_expr(r##"{"#type": "##).expect_err("should not parse incomplete type");

        with_settings!({
            description => "Parses with a sudden EOF"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.diagnostic, &result.input);
        });
    }
}

use hashql_ast::node::{
    expr::{DictExpr, Expr, ExprKind, dict::DictEntry},
    id::NodeId,
};
use text_size::TextRange;

use super::{
    ObjectState, State,
    error::{
        ObjectDiagnosticCategory, dict_entry_too_few_items, dict_entry_too_many_items,
        dict_expected_format,
    },
    r#type::{TypeNode, handle_typed},
    visit::{Key, visit_object},
};
use crate::{
    ParserState,
    error::ResultExt as _,
    lexer::{syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet, token::Token},
    parser::{
        array::visit::visit_array,
        error::{ParserDiagnostic, unexpected_token},
        expr::parse_expr,
        string::parse_expr_from_string,
    },
};

pub(crate) struct DictNode<'heap> {
    key_span: TextRange,

    expr: DictExpr<'heap>,
    r#type: Option<TypeNode<'heap>>,
}

impl<'heap> DictNode<'heap> {
    pub(crate) fn parse(
        state: &mut ParserState<'heap, '_>,
        key: &Key<'_>,
    ) -> Result<Self, ParserDiagnostic> {
        let expr = parse_dict(state)?;

        Ok(Self {
            key_span: key.span,
            expr,
            r#type: None,
        })
    }

    pub(crate) fn with_type(mut self, r#type: TypeNode<'heap>) -> Self {
        self.r#type = Some(r#type);
        self
    }
}

impl<'heap> State<'heap> for DictNode<'heap> {
    fn handle(
        mut self,
        state: &mut ParserState<'heap, '_>,
        key: Key<'_>,
    ) -> Result<ObjectState<'heap>, ParserDiagnostic> {
        handle_typed("#dict", self.key_span, &mut self.r#type, state, &key)?;
        Ok(ObjectState::Dict(self))
    }

    fn build(
        mut self,
        state: &mut ParserState<'heap, '_>,
        span: TextRange,
    ) -> Result<Expr<'heap>, ParserDiagnostic> {
        self.expr.r#type = TypeNode::finish(self.r#type, state);

        Ok(Expr {
            id: NodeId::PLACEHOLDER,
            span: state.insert_range(span),
            kind: ExprKind::Dict(self.expr),
        })
    }
}

fn parse_dict_object<'heap, 'source>(
    state: &mut ParserState<'heap, 'source>,
    token: Token<'source>,
) -> Result<DictExpr<'heap>, ParserDiagnostic> {
    let mut entries = Vec::new();

    let span = visit_object(state, token, |state, key| {
        let key_span = key.span;

        let key = parse_expr_from_string(state, state.insert_range(key.span), &key.value)
            .change_category(From::from)?;

        let value = parse_expr(state)?;
        let value_span = state.current_span();

        let entry_span = key_span.cover(value_span);

        entries.push(DictEntry {
            id: NodeId::PLACEHOLDER,
            span: state.insert_range(entry_span),
            key: state.heap().boxed(key),
            value: state.heap().boxed(value),
        });

        Ok(())
    })?;

    Ok(DictExpr {
        id: NodeId::PLACEHOLDER,
        span: state.insert_range(span),
        entries: state.heap().boxed_slice(entries),
        r#type: None,
    })
}

fn parse_dict_array<'heap, 'source>(
    state: &mut ParserState<'heap, 'source>,
    token: Token<'source>,
) -> Result<DictExpr<'heap>, ParserDiagnostic> {
    let mut entries = Vec::new();

    let span = visit_array(state, token, |state| {
        let mut key = None;
        let mut value = None;
        let mut excess = Vec::new();

        let token = state.advance().change_category(From::from)?;
        if token.kind.syntax() != SyntaxKind::LBracket {
            let span = state.insert_range(token.span);

            return Err(unexpected_token(
                span,
                ObjectDiagnosticCategory::DictEntryExpectedArray,
                SyntaxKindSet::from_slice(&[SyntaxKind::LBracket]),
            )
            .map_category(From::from));
        }

        let span = visit_array(state, token, |state| {
            if key.is_some() && value.is_some() {
                // we just parse, and then report the issue later
                // This way we're able to tell the user how many entries were skipped
                let expr = parse_expr(state)?;
                excess.push(expr.span);

                return Ok(());
            }

            let expr = parse_expr(state)?;

            if key.is_none() {
                key = Some(expr);
            } else {
                value = Some(expr);
            }

            Ok(())
        })?;

        if !excess.is_empty() {
            return Err(dict_entry_too_many_items(state.insert_range(span), &excess)
                .map_category(From::from));
        }

        let found = usize::from(key.is_some()) + usize::from(value.is_some());
        let Some((key, value)) = Option::zip(key, value) else {
            return Err(
                dict_entry_too_few_items(state.insert_range(span), found).map_category(From::from)
            );
        };

        entries.push(DictEntry {
            id: NodeId::PLACEHOLDER,
            span: state.insert_range(span),
            key: state.heap().boxed(key),
            value: state.heap().boxed(value),
        });

        Ok(())
    })?;

    Ok(DictExpr {
        id: NodeId::PLACEHOLDER,
        span: state.insert_range(span),
        entries: state.heap().boxed_slice(entries),
        r#type: None,
    })
}

fn parse_dict<'heap>(
    state: &mut ParserState<'heap, '_>,
) -> Result<DictExpr<'heap>, ParserDiagnostic> {
    let token = state.advance().change_category(From::from)?;

    let is_object = match token.kind.syntax() {
        SyntaxKind::LBrace => true,
        SyntaxKind::LBracket => false,
        kind => {
            let span = state.insert_range(token.span);

            return Err(dict_expected_format(span, kind)).change_category(From::from)?;
        }
    };

    if is_object {
        parse_dict_object(state, token)
    } else {
        parse_dict_array(state, token)
    }
}

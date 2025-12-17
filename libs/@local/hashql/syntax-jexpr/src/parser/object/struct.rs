use hashql_ast::node::{
    expr::{Expr, ExprKind, StructExpr, r#struct::StructEntry},
    id::NodeId,
};
use hashql_core::heap::CloneIn as _;
use text_size::TextRange;

use super::{
    ObjectState, State,
    error::struct_expected_object,
    r#type::{TypeNode, handle_typed},
    visit::Key,
};
use crate::{
    ParserState,
    error::ResultExt as _,
    lexer::syntax_kind::SyntaxKind,
    parser::{
        error::ParserDiagnostic,
        expr::parse_expr,
        object::{error::struct_key_expected_identifier, visit::visit_object},
        state::Expected,
        string::parse_ident_from_string,
    },
};

pub(crate) struct StructNode<'heap> {
    key_span: TextRange,

    expr: StructExpr<'heap>,
    r#type: Option<TypeNode<'heap>>,
}

impl<'heap> StructNode<'heap> {
    pub(crate) fn parse(
        state: &mut ParserState<'heap, '_, '_>,
        key: &Key<'_>,
    ) -> Result<Self, ParserDiagnostic> {
        let expr = parse_struct(state)?;

        Ok(Self {
            key_span: key.span,
            expr,
            r#type: None,
        })
    }

    pub(crate) fn with_type(mut self, type_node: TypeNode<'heap>) -> Self {
        self.r#type = Some(type_node);
        self
    }
}

impl<'heap> State<'heap> for StructNode<'heap> {
    fn handle(
        mut self,
        state: &mut ParserState<'heap, '_, '_>,
        key: Key<'_>,
    ) -> Result<ObjectState<'heap>, ParserDiagnostic> {
        handle_typed("#struct", self.key_span, &mut self.r#type, state, &key)?;
        Ok(ObjectState::Struct(self))
    }

    fn build(
        mut self,
        state: &mut ParserState<'heap, '_, '_>,
        span: TextRange,
    ) -> Result<Expr<'heap>, ParserDiagnostic> {
        self.expr.r#type = TypeNode::finish(self.r#type, state);

        Ok(Expr {
            id: NodeId::PLACEHOLDER,
            span: state.insert_range(span),
            kind: ExprKind::Struct(self.expr),
        })
    }
}

fn parse_struct<'heap>(
    state: &mut ParserState<'heap, '_, '_>,
) -> Result<StructExpr<'heap>, ParserDiagnostic> {
    // We do not use expected here, to give the user a better error message
    let token = state
        .advance(Expected::hint(SyntaxKind::LBrace))
        .change_category(From::from)?;

    if token.kind.syntax() != SyntaxKind::LBrace {
        let span = state.insert_range(token.span);

        return Err(struct_expected_object(span, token.kind.syntax()))
            .change_category(From::from)?;
    }

    let mut entries = Vec::new();

    let span = visit_object(state, token, |state, key| {
        let key_span = state.insert_range(key.span);

        let ident = match parse_ident_from_string(state, key_span, &key.value) {
            Ok(ident) => ident,
            Err(error) => {
                let error = (error.offset(), error.into_inner());

                return Err(
                    struct_key_expected_identifier(state.spans(), key_span, error)
                        .map_category(From::from),
                );
            }
        };

        let value = parse_expr(state)?;
        let value_span = state.current_span();

        entries.push(StructEntry {
            id: NodeId::PLACEHOLDER,
            span: state.insert_range(key.span.cover(value_span)),
            key: ident,
            value: Box::new_in(value, state.heap()),
        });

        Ok(())
    })?;

    Ok(StructExpr {
        id: NodeId::PLACEHOLDER,
        span: state.insert_range(span),
        entries: entries.clone_in(state.heap()),
        r#type: None,
    })
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
    fn parse_empty_struct() {
        // Empty struct
        let result = parse_object_expr(r##"{"#struct": {}}"##).expect("should parse empty struct");

        with_settings!({
            description => "Parses an empty struct"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_struct_incomplete() {
        // Empty struct with object format
        let result =
            parse_object_expr(r##"{"#struct": "##).expect_err("should not parse incomplete struct");

        with_settings!({
            description => "Parses with a sudden EOF"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.diagnostic, &result.input);
        });
    }

    #[test]
    fn parse_struct_with_simple_fields() {
        // Struct with simple fields
        let result = parse_object_expr(
            r##"{"#struct": {
            "name": {"#literal": "Alice"},
            "age": {"#literal": 30}
        }}"##,
        )
        .expect("should parse struct with simple fields");

        with_settings!({
            description => "Parses a struct with simple fields"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_struct_with_complex_fields() {
        // Struct with complex field values
        let result = parse_object_expr(
            r##"{"#struct": {
            "info": {"#struct": {
                "id": {"#literal": 42},
                "active": {"#literal": true}
            }},
            "items": {"#list": [
                {"#literal": 1},
                {"#literal": 2}
            ]}
        }}"##,
        )
        .expect("should parse struct with complex fields");

        with_settings!({
            description => "Parses a struct with complex field values"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_struct_with_function_calls() {
        // Struct with function call values
        let result = parse_object_expr(
            r##"{"#struct": {
            "sum": ["add", {"#literal": 1}, {"#literal": 2}],
            "message": ["format", {"#literal": "Hello, {0}!"}, {"#literal": "World"}]
        }}"##,
        )
        .expect("should parse struct with function calls");

        with_settings!({
            description => "Parses a struct with function call values"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_struct_with_type() {
        // Struct with type annotation
        let result = parse_object_expr(
            r##"{"#struct": {
            "name": {"#literal": "Alice"},
            "age": {"#literal": 30}
        }, "#type": "Person"}"##,
        )
        .expect("should parse struct with type");

        with_settings!({
            description => "Parses a struct with type annotation"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_struct_with_complex_type() {
        // Struct with complex type annotation
        let result = parse_object_expr(
            r##"{"#struct": {
            "name": {"#literal": "Alice"},
            "age": {"#literal": 30}
        }, "#type": "(name: String, age: Int)"}"##,
        )
        .expect("should parse struct with complex type");

        with_settings!({
            description => "Parses a struct with complex type annotation"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_invalid_struct_value() {
        // Invalid value for struct (not an object)
        let error = parse_object_expr(r##"{"#struct": ["not", "an-object"]}"##)
            .expect_err("should fail with invalid struct value");

        with_settings!({
            description => "Rejects non-object values for structs"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_struct_with_invalid_field_name() {
        // Invalid field name (not a valid identifier)
        let error = parse_object_expr(
            r##"{"#struct": {
            "valid": {"#literal": 1},
            "123-invalid": {"#literal": 2}
        }}"##,
        )
        .expect_err("should fail with invalid field name");

        with_settings!({
            description => "Rejects invalid identifiers as struct field names"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_struct_with_special_chars_in_field_name() {
        // Field name with underscore (valid identifier)
        let result = parse_object_expr(
            r##"{"#struct": {
            "valid_field": {"#literal": 1},
            "anotherField": {"#literal": 2}
        }}"##,
        )
        .expect("should parse struct with special chars in field name");

        with_settings!({
            description => "Parses a struct with valid identifiers containing underscores and camelCase"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_duplicate_struct_key() {
        // Duplicate #struct keys
        let error = parse_object_expr(r##"{"#struct": {}, "#struct": {}}"##)
            .expect_err("should fail with duplicate #struct key");

        with_settings!({
            description => "Rejects duplicate #struct keys"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_duplicate_type_key() {
        // Duplicate #type keys
        let error = parse_object_expr(r##"{"#struct": {}, "#type": "Person", "#type": "User"}"##)
            .expect_err("should fail with duplicate #type key");

        with_settings!({
            description => "Rejects duplicate #type keys in struct"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_unknown_key_in_struct() {
        // Unknown key in struct object
        let error = parse_object_expr(r##"{"#struct": {}, "unknown": {"#literal": "value"}}"##)
            .expect_err("should fail with unknown key");

        with_settings!({
            description => "Rejects unknown keys in struct objects"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_deeply_nested_structs() {
        // Deeply nested struct structure
        let result = parse_object_expr(
            r##"{"#struct": {
            "level1": {"#struct": {
                "level2": {"#struct": {
                    "level3": {"#struct": {
                        "value": {"#literal": "nested"}
                    }}
                }}
            }}
        }}"##,
        )
        .expect("should parse deeply nested structs");

        with_settings!({
            description => "Parses deeply nested struct structures"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_struct_with_many_fields() {
        // Struct with many fields to test scaling
        let result = parse_object_expr(
            r##"{"#struct": {
            "field1": {"#literal": 1},
            "field2": {"#literal": 2},
            "field3": {"#literal": 3},
            "field4": {"#literal": 4},
            "field5": {"#literal": 5},
            "field6": {"#literal": 6},
            "field7": {"#literal": 7},
            "field8": {"#literal": 8},
            "field9": {"#literal": 9},
            "field10": {"#literal": 10}
        }}"##,
        )
        .expect("should parse struct with many fields");

        with_settings!({
            description => "Parses a struct with many fields"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }
}

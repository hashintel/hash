pub mod call;
pub mod constant;
pub mod path;
pub mod signature;

use self::{call::Call, constant::Constant, path::Path, signature::Signature};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Expr<'arena, 'source> {
    Call(Call<'arena, 'source>),
    Signature(Signature<'arena>),
    Path(Path<'arena>),
    Constant(Constant<'arena, 'source>),
}

#[cfg(test)]
mod test {
    use std::assert_matches::assert_matches;

    use insta::assert_debug_snapshot;

    use super::Expr;
    use crate::arena::Arena;

    // This needs to be a macro, because we need to get the function name for auto-naming.
    macro_rules! assert_expr {
        ($expr:expr, $pattern:pat) => {{
            let arena = Arena::new();

            let result = Expr::from_str(&arena, $expr);

            assert_debug_snapshot!(insta::_macro_support::AutoName, result, $expr);

            assert_matches!(result, $pattern);
        }};

        ($expr:expr) => {{
            assert_expr!($expr, _);
        }};
    }

    #[test]
    fn fn_is_expr() {
        assert_expr!(
            r#"[
                ["input", "variable"],
                "arg1",
                "arg2"
            ]"#,
            Ok(Expr::Call(_))
        );
    }

    #[test]
    fn fn_empty_args() {
        assert_expr!(r#"["func"]"#, Ok(Expr::Call(_)));
    }

    #[test]
    fn fn_empty() {
        assert_expr!("[]", Err(_));
    }

    #[test]
    fn string_is_path() {
        assert_expr!(r#""symbol""#, Ok(Expr::Path(_)));

        assert_expr!(r#""foo::bar""#, Ok(Expr::Path(_)));
    }

    #[test]
    fn string_is_signature() {
        assert_expr!(r#""<T: Int>(a: T) -> T""#, Ok(Expr::Signature(_)));
    }

    #[test]
    fn string_is_invalid() {
        assert_expr!(r#""1234""#, Err(_));
    }

    #[test]
    fn object_is_constant() {
        assert_expr!(r#"{"const": 42}"#, Ok(Expr::Constant(_)));
    }

    #[test]
    fn object_is_constant_with_type() {
        assert_expr!(r#"{"type": "u32", "const": 42}"#, Ok(Expr::Constant(_)));
    }

    #[test]
    fn object_is_constant_with_extra_fields() {
        assert_expr!(
            r#"{"type": "u32", "const": 42, "sig": "() -> Unit"}"#,
            Err(_)
        );
    }

    #[test]
    fn object_is_call() {
        assert_expr!(
            r#"{"fn": "func", "args": ["arg1", "arg2"]}"#,
            Ok(Expr::Call(_))
        );
    }

    #[test]
    fn object_is_args_without_fn() {
        assert_expr!(r#"{"args": ["arg1", "arg2"]}"#, Err(_));
    }

    #[test]
    fn object_is_call_without_args() {
        assert_expr!(r#"{"fn": "func"}"#, Ok(Expr::Call(_)));
    }

    #[test]
    fn object_is_signature() {
        assert_expr!(r#"{"sig": "<T: Int>(a: T) -> T"}"#, Ok(Expr::Signature(_)));
    }

    #[test]
    fn object_is_invalid_multiple() {
        assert_expr!(r#"{"sig": "<T: Int>(a: T) -> T", "fn": "func"}"#, Err(_));
    }

    #[test]
    fn object_is_invalid() {
        assert_expr!(r#"{"unknown": "key"}"#, Err(_));
    }

    #[test]
    fn object_is_empty() {
        assert_expr!("{}", Err(_));
    }
}

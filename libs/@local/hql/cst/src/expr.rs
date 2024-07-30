use serde::de::DeserializeSeed;

use crate::{
    arena::Arena, call::Call, codec::deserialize::ExprVisitor, constant::Constant,
    signature::Signature, Path,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Expr<'a> {
    Call(Call<'a>),
    Signature(Signature<'a>),
    Path(Path<'a>),
    Constant(Constant<'a>),
}

impl<'a> Expr<'a> {
    /// Deserialize an expression from a JSON string.
    ///
    /// # Errors
    ///
    /// Returns an error if the input is not valid JSON, or a malformed expression.
    pub fn from_str(arena: &'a Arena, value: &str) -> serde_json::Result<Self> {
        let mut deserializer = serde_json::Deserializer::from_str(value);

        DeserializeSeed::deserialize(ExprVisitor { arena }, &mut deserializer)
    }

    /// Deserialize an expression from a JSON byte slice.
    ///
    /// # Errors
    ///
    /// Returns an error if the input is not valid JSON, or a malformed expression.
    pub fn from_slice(arena: &'a Arena, value: &[u8]) -> serde_json::Result<Self> {
        let mut deserializer = serde_json::Deserializer::from_slice(value);

        DeserializeSeed::deserialize(ExprVisitor { arena }, &mut deserializer)
    }

    /// Deserialize an expression from a JSON value.
    ///
    /// # Errors
    ///
    /// Returns an error if the input is a malformed expression.
    pub fn from_value(arena: &'a Arena, value: &serde_json::Value) -> serde_json::Result<Self> {
        DeserializeSeed::deserialize(ExprVisitor { arena }, value)
    }
}

#[cfg(test)]
mod test {
    use insta::assert_debug_snapshot;

    use super::Expr;
    use crate::arena::Arena;

    // This needs to be a macro, because we need to get the function name for auto-naming.
    macro_rules! assert_expr {
        ($expr:expr) => {{
            let arena = Arena::new();

            let result = Expr::from_str(&arena, $expr);

            assert_debug_snapshot!(insta::_macro_support::AutoName, result, $expr);
        }};
    }

    #[test]
    fn fn_is_expr() {
        assert_expr!(
            r#"[
            ["input", "variable"],
            "arg1",
            "arg2"
        ]"#
        );
    }

    #[test]
    fn fn_empty_args() {
        assert_expr!(r#"["func"]"#);
    }

    #[test]
    fn fn_empty() {
        assert_expr!("[]");
    }

    #[test]
    fn string_is_path() {
        assert_expr!(r#""symbol""#);

        assert_expr!(r#""foo::bar""#);
    }

    #[test]
    fn string_is_signature() {
        assert_expr!(r#""<T: Int>(a: T) -> T""#);
    }

    #[test]
    fn string_is_invalid() {
        assert_expr!(r#""1234""#);
    }

    #[test]
    fn object_is_constant() {
        assert_expr!(r#"{"const": 42}"#);
    }

    #[test]
    fn object_is_constant_with_type() {
        assert_expr!(r#"{"type": "u32", "const": 42}"#);
    }

    #[test]
    fn object_is_constant_with_extra_fields() {
        assert_expr!(r#"{"type": "u32", "const": 42, "sig": "() -> Unit"}"#);
    }

    #[test]
    fn object_is_call() {
        assert_expr!(r#"{"fn": "func", "args": ["arg1", "arg2"]}"#);
    }

    #[test]
    fn object_is_args_without_fn() {
        assert_expr!(r#"{"args": ["arg1", "arg2"]}"#);
    }

    #[test]
    fn object_is_call_without_args() {
        assert_expr!(r#"{"fn": "func"}"#);
    }

    #[test]
    fn object_is_signature() {
        assert_expr!(r#"{"sig": "<T: Int>(a: T) -> T"}"#);
    }

    #[test]
    fn object_is_invalid_multiple() {
        assert_expr!(r#"{"sig": "<T: Int>(a: T) -> T", "fn": "func"}"#);
    }

    #[test]
    fn object_is_invalid() {
        assert_expr!(r#"{"unknown": "key"}"#);
    }

    #[test]
    fn object_is_empty() {
        assert_expr!("{}");
    }
}

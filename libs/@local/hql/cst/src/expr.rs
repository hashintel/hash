use serde::de::DeserializeSeed;

use crate::{
    arena::Arena, call::Call, codec::deserialize::ExprVisitor, constant::Constant,
    signature::Signature, symbol::Symbol,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Expr<'a> {
    Call(Call<'a>),
    Signature(Signature<'a>),
    Symbol(Symbol),
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

    #[test]
    fn fn_is_expr() {
        let arena = Arena::new();

        let result = Expr::from_str(
            &arena,
            r#"[
            ["input", "variable"],
            "arg1",
            "arg2"
        ]"#,
        );

        assert_debug_snapshot!(result);
    }

    #[test]
    fn fn_empty_args() {
        let arena = Arena::new();

        let result = Expr::from_str(&arena, r#"["func"]"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn fn_empty() {
        let arena = Arena::new();

        let result = Expr::from_str(&arena, r"[]");

        assert_debug_snapshot!(result);
    }

    #[test]
    fn string_is_symbol() {
        let arena = Arena::new();

        let result = Expr::from_str(&arena, r#""symbol""#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn string_is_signature() {
        let arena = Arena::new();

        let result = Expr::from_str(&arena, r#""<T: Int>(a: T) -> T""#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn string_is_invalid() {
        let arena = Arena::new();

        let result = Expr::from_str(&arena, r#""1234""#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_constant() {
        let arena = Arena::new();

        let result = Expr::from_str(&arena, r#"{"const": 42}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_constant_with_type() {
        let arena = Arena::new();

        let result = Expr::from_str(&arena, r#"{"type": "u32", "const": 42}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_constant_with_extra_fields() {
        let arena = Arena::new();

        let result = Expr::from_str(
            &arena,
            r#"{"type": "u32", "const": 42, "sig": "() -> Unit"}"#,
        );

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_call() {
        let arena = Arena::new();

        let result = Expr::from_str(&arena, r#"{"fn": "func", "args": ["arg1", "arg2"]}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_args_without_fn() {
        let arena = Arena::new();

        let result = Expr::from_str(&arena, r#"{"args": ["arg1", "arg2"]}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_call_without_args() {
        let arena = Arena::new();

        let result = Expr::from_str(&arena, r#"{"fn": "func"}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_signature() {
        let arena = Arena::new();

        let result = Expr::from_str(&arena, r#"{"sig": "<T: Int>(a: T) -> T"}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_invalid_multiple() {
        let arena = Arena::new();

        let result = Expr::from_str(&arena, r#"{"sig": "<T: Int>(a: T) -> T", "fn": "func"}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_invalid() {
        let arena = Arena::new();

        let result = Expr::from_str(&arena, r#"{"unknown": "key"}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_empty() {
        let arena = Arena::new();

        let result = Expr::from_str(&arena, r"{}");

        assert_debug_snapshot!(result);
    }
}

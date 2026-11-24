use super::expr::Expr;

/// An [`Expr`] restricted to primitive literals and compound data constructors.
///
/// Every node in a `Value` tree is a literal, struct, dictionary, tuple, or list without type
/// annotations, variable references, calls, or special forms.
#[derive(Debug)]
pub struct Value<'heap>(Expr<'heap>);

impl<'heap> Value<'heap> {
    /// Constructs a [`Value`] from an [`Expr`] known to contain only value nodes.
    ///
    /// Every node in `expr` must be a literal, struct, dictionary, tuple, list, or error
    /// placeholder, and none may carry a type annotation.
    #[must_use]
    pub fn new_unchecked(expr: Expr<'heap>) -> Self {
        // Unchecked to avoid re-walking trees produced by value-only parsers; violating the subset
        // breaks downstream value invariants rather than memory safety.
        #[cfg(debug_assertions)]
        Self::debug_assert_integrity(&expr);

        Self(expr)
    }

    /// Consumes this value and returns its underlying [`Expr`].
    #[must_use]
    pub const fn into_expr(self) -> Expr<'heap> {
        self.0
    }

    #[cfg(debug_assertions)]
    fn debug_assert_integrity(expr: &Expr<'_>) {
        use super::expr::ExprKind;
        use crate::node::expr::{DictExpr, ListExpr, LiteralExpr, StructExpr, TupleExpr};

        match &expr.kind {
            ExprKind::Struct(StructExpr {
                id: _,
                span: _,
                entries,
                r#type,
            }) => {
                assert!(r#type.is_none(), "values may not have a type");
                for entry in entries {
                    Self::debug_assert_integrity(&entry.value);
                }
            }
            ExprKind::Dict(DictExpr {
                id: _,
                span: _,
                entries,
                r#type,
            }) => {
                assert!(r#type.is_none(), "values may not have a type");
                for entry in entries {
                    Self::debug_assert_integrity(&entry.key);
                    Self::debug_assert_integrity(&entry.value);
                }
            }
            ExprKind::Tuple(TupleExpr {
                id: _,
                span: _,
                elements,
                r#type,
            }) => {
                assert!(r#type.is_none(), "values may not have a type");
                for element in elements {
                    Self::debug_assert_integrity(&element.value);
                }
            }
            ExprKind::List(ListExpr {
                id: _,
                span: _,
                elements,
                r#type,
            }) => {
                assert!(r#type.is_none(), "values may not have a type");
                for element in elements {
                    Self::debug_assert_integrity(&element.value);
                }
            }
            ExprKind::Literal(LiteralExpr {
                id: _,
                span: _,
                kind: _,
                r#type,
            }) => {
                assert!(r#type.is_none(), "values may not have a type");
            }
            ExprKind::Dummy => {}
            ExprKind::Call(_)
            | ExprKind::Path(_)
            | ExprKind::Let(_)
            | ExprKind::Type(_)
            | ExprKind::NewType(_)
            | ExprKind::Input(_)
            | ExprKind::Closure(_)
            | ExprKind::If(_)
            | ExprKind::Field(_)
            | ExprKind::Index(_)
            | ExprKind::As(_)
            | ExprKind::Underscore => {
                panic!("expected value expressions (struct, dict, tuple, list, or a literal)");
            }
        }
    }
}

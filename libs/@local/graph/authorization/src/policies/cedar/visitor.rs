use alloc::collections::BTreeMap;
use core::{error::Error, fmt};
use std::sync::Arc;

use cedar_policy_core::ast;
use error_stack::{Report, ResultExt, bail};
use smol_str::SmolStr;

#[derive(Debug, derive_more::Display)]
pub(crate) enum CedarExpressionParseError {
    #[display("unexpected expression: expected {expected}, got {got}")]
    UnexpectedExpression {
        expected: String,
        got: UnexpectedCedarExpression,
    },
    #[display("parsing the expression failed")]
    ParseError,
}

impl CedarExpressionParseError {
    pub(crate) fn unexpected_expr_err(
        visitor: &impl CedarExpressionVisitor,
        kind: UnexpectedCedarExpression,
    ) -> Self {
        struct Displayer<'v, V: CedarExpressionVisitor>(&'v V);

        impl<V: CedarExpressionVisitor> fmt::Display for Displayer<'_, V> {
            fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
                self.0.expecting(fmt)
            }
        }

        Self::UnexpectedExpression {
            expected: Displayer(visitor).to_string(),
            got: kind,
        }
    }
}

impl Error for CedarExpressionParseError {}

#[derive(Debug, derive_more::Display)]
pub(crate) enum UnexpectedCedarExpression {
    // Literals
    #[display("ID `{_0}`")]
    EntityUID(Arc<ast::EntityUID>),
    #[display("boolean `{_0}`")]
    Bool(bool),
    #[display("integral `{_0}`")]
    Integral(i64),
    #[display("string `\"{_0}\"`")]
    String(SmolStr),

    // Variables
    #[display("principal variable")]
    PrincipalVariable,
    #[display("resource variable")]
    ResourceVariable,
    #[display("action variable")]
    ActionVariable,
    #[display("context variable")]
    ContextVariable,
    #[display("unknown `{_0}`")]
    Unknown(SmolStr),

    // Slots
    #[display("principal slot")]
    PrincipalSlot,
    #[display("resource slot")]
    ResourceSlot,
    #[display("unknown slot")]
    UnknownSlot,

    // Unary operators
    #[display("`isEmpty` method call `{_0}.isEmpty()`")]
    IsEmpty(Arc<ast::Expr>),
    #[display("`!` unary operator `!{_0}`")]
    Not(Arc<ast::Expr>),
    #[display("`-` unary operator `-{_0}`")]
    Neg(Arc<ast::Expr>),

    // Binary operators
    #[display("`&&` binary operator `{_0} && {_1}`")]
    And(Arc<ast::Expr>, Arc<ast::Expr>),
    #[display("`||` binary operator `{_0} || {_1}`")]
    Or(Arc<ast::Expr>, Arc<ast::Expr>),
    #[display("`==` binary operator `{_0} == {_1}`")]
    Eq(Arc<ast::Expr>, Arc<ast::Expr>),
    #[display("`<` binary operator `{_0} < {_1}`")]
    Less(Arc<ast::Expr>, Arc<ast::Expr>),
    #[display("`<=` binary operator `{_0} <= {_1}`")]
    LessEq(Arc<ast::Expr>, Arc<ast::Expr>),
    #[display("`+` binary operator `{_0} + {_1}`")]
    Add(Arc<ast::Expr>, Arc<ast::Expr>),
    #[display("`-` binary operator `{_0} - {_1}`")]
    Sub(Arc<ast::Expr>, Arc<ast::Expr>),
    #[display("`*` binary operator `{_0} * {_1}`")]
    Mul(Arc<ast::Expr>, Arc<ast::Expr>),
    #[display("`in` binary operator `{_0} in {_1}`")]
    In(Arc<ast::Expr>, Arc<ast::Expr>),
    #[display("`contains` binary operator `{_0}.contains({_1})`")]
    Contains(Arc<ast::Expr>, Arc<ast::Expr>),
    #[display("`containsAll` binary operator `{_0}.containsAll({_1})`")]
    ContainsAll(Arc<ast::Expr>, Arc<ast::Expr>),
    #[display("`containsAny` binary operator `{_0}.containsAny({_1})`")]
    ContainsAny(Arc<ast::Expr>, Arc<ast::Expr>),
    #[display("`getTag` binary operator `{_0}.getTag({_1})`")]
    GetTag(Arc<ast::Expr>, Arc<ast::Expr>),
    #[display("`hasTag` binary operator `{_0}.hasTag({_1})`")]
    HasTag(Arc<ast::Expr>, Arc<ast::Expr>),
    #[display("`is` binary operator `{_0} is {_1}`")]
    Is(Arc<ast::Expr>, ast::EntityType),
    #[display("`like` binary operator `{_0} like {_1}`")]
    Like(Arc<ast::Expr>, ast::Pattern),

    // Extension functions
    #[display("extension function `{_0}`")]
    ExtensionFunctionApp(ast::Name, Arc<Vec<ast::Expr>>),

    // Ternary operators
    #[display("`if` ternary operator `if {_0} then {_1} else {_2}`")]
    If(Arc<ast::Expr>, Arc<ast::Expr>, Arc<ast::Expr>),

    // Sets
    #[display("set")]
    Set(Arc<Vec<ast::Expr>>),

    // Records
    #[display("record")]
    Record(Arc<BTreeMap<SmolStr, ast::Expr>>),
    #[display("`getAttr` binary operator `{_0}.getAttr({_1})`")]
    GetAttr(Arc<ast::Expr>, SmolStr),
    #[display("`hasAttr` binary operator `{_0}.hasAttr({_1})`")]
    HasAttr(Arc<ast::Expr>, SmolStr),
}

impl From<ast::Expr> for UnexpectedCedarExpression {
    fn from(expr: ast::Expr) -> Self {
        match expr.into_expr_kind() {
            ast::ExprKind::Lit(literal) => match literal {
                ast::Literal::Bool(bool) => Self::Bool(bool),
                ast::Literal::Long(long) => Self::Integral(long),
                ast::Literal::String(string) => Self::String(string),
                ast::Literal::EntityUID(entity_uid) => Self::EntityUID(entity_uid),
            },
            ast::ExprKind::Var(var) => match var {
                ast::Var::Principal => Self::PrincipalVariable,
                ast::Var::Resource => Self::ResourceVariable,
                ast::Var::Action => Self::ActionVariable,
                ast::Var::Context => Self::ContextVariable,
            },
            ast::ExprKind::Slot(slot_id) => {
                if slot_id.is_principal() {
                    Self::PrincipalSlot
                } else if slot_id.is_resource() {
                    Self::ResourceSlot
                } else {
                    Self::UnknownSlot
                }
            }
            ast::ExprKind::Unknown(unknown) => Self::Unknown(unknown.name),
            ast::ExprKind::If {
                test_expr,
                then_expr,
                else_expr,
            } => Self::If(test_expr, then_expr, else_expr),
            ast::ExprKind::And { left, right } => Self::And(left, right),
            ast::ExprKind::Or { left, right } => Self::Or(left, right),
            ast::ExprKind::UnaryApp { op, arg } => match op {
                ast::UnaryOp::Not => Self::Not(arg),
                ast::UnaryOp::Neg => Self::Neg(arg),
                ast::UnaryOp::IsEmpty => Self::IsEmpty(arg),
            },
            ast::ExprKind::BinaryApp { op, arg1, arg2 } => match op {
                ast::BinaryOp::Eq => Self::Eq(arg1, arg2),
                ast::BinaryOp::Less => Self::Less(arg1, arg2),
                ast::BinaryOp::LessEq => Self::LessEq(arg1, arg2),
                ast::BinaryOp::Add => Self::Add(arg1, arg2),
                ast::BinaryOp::Sub => Self::Sub(arg1, arg2),
                ast::BinaryOp::Mul => Self::Mul(arg1, arg2),
                ast::BinaryOp::In => Self::In(arg1, arg2),
                ast::BinaryOp::Contains => Self::Contains(arg1, arg2),
                ast::BinaryOp::ContainsAll => Self::ContainsAll(arg1, arg2),
                ast::BinaryOp::ContainsAny => Self::ContainsAny(arg1, arg2),
                ast::BinaryOp::GetTag => Self::GetTag(arg1, arg2),
                ast::BinaryOp::HasTag => Self::HasTag(arg1, arg2),
            },
            ast::ExprKind::ExtensionFunctionApp { fn_name, args } => {
                Self::ExtensionFunctionApp(fn_name, args)
            }
            ast::ExprKind::GetAttr { expr, attr } => Self::GetAttr(expr, attr),
            ast::ExprKind::HasAttr { expr, attr } => Self::HasAttr(expr, attr),
            ast::ExprKind::Like { expr, pattern } => Self::Like(expr, pattern),
            ast::ExprKind::Is { expr, entity_type } => Self::Is(expr, entity_type),
            ast::ExprKind::Set(exprs) => Self::Set(exprs),
            ast::ExprKind::Record(btree_map) => Self::Record(btree_map),
        }
    }
}

pub(crate) mod visitor_helpers {
    use super::*;

    pub(crate) trait ComposableValue: Sized {
        fn make_all(filters: Vec<Self>) -> Self;
        fn make_any(filters: Vec<Self>) -> Self;
        fn make_not(filter: Self) -> Self;

        fn extend_all(filters: &mut Vec<Self>, filter: Self);
        fn extend_any(filters: &mut Vec<Self>, filter: Self);
    }

    pub(crate) fn visit_bool<T: ComposableValue>(bool: bool) -> T {
        if bool {
            T::make_all(Vec::new())
        } else {
            T::make_any(Vec::new())
        }
    }

    pub(crate) fn visit_and<T: ComposableValue, E: Error + Send + Sync + 'static>(
        visitor: &impl CedarExpressionVisitor<Value = T, Error = E>,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<T, E>> {
        let left = visitor.visit_expr(lhs)?;
        let right = visitor.visit_expr(rhs)?;

        Some(left.and_then(|left| {
            right.map(|right| {
                let mut all_filters = Vec::new();

                T::extend_all(&mut all_filters, left);
                T::extend_all(&mut all_filters, right);

                if all_filters.len() == 1 {
                    all_filters.pop().expect("should have exactly one filter")
                } else {
                    T::make_all(all_filters)
                }
            })
        }))
    }

    pub(crate) fn visit_or<T: ComposableValue, E: Error + Send + Sync + 'static>(
        visitor: &impl CedarExpressionVisitor<Value = T, Error = E>,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<T, E>> {
        let left = visitor.visit_expr(lhs)?;
        let right = visitor.visit_expr(rhs)?;

        Some(left.and_then(|left| {
            right.map(|right| {
                let mut any_filters = Vec::new();

                T::extend_any(&mut any_filters, left);
                T::extend_any(&mut any_filters, right);

                if any_filters.len() == 1 {
                    any_filters.pop().expect("should have exactly one filter")
                } else {
                    T::make_any(any_filters)
                }
            })
        }))
    }

    pub(crate) fn visit_not<T: ComposableValue, E: Error + Send + Sync + 'static>(
        visitor: &impl CedarExpressionVisitor<Value = T, Error = E>,
        expr: &ast::Expr,
    ) -> Option<Result<T, E>> {
        Some(visitor.visit_expr(expr)?.map(T::make_not))
    }
}

pub(crate) trait CedarExpressionVisitor: Sized {
    type Value;
    type Error;

    fn expecting(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result;

    fn visit_expr(&self, expr: &ast::Expr) -> Option<Result<Self::Value, Self::Error>> {
        self.visit_expr_kind(expr.expr_kind())
    }

    fn visit_expr_kind(&self, kind: &ast::ExprKind) -> Option<Result<Self::Value, Self::Error>> {
        match kind {
            ast::ExprKind::Lit(literal) => match literal {
                ast::Literal::EntityUID(euid) => self.visit_euid(euid),
                ast::Literal::Bool(bool) => self.visit_bool(*bool),
                ast::Literal::Long(long) => self.visit_long(*long),
                ast::Literal::String(string) => self.visit_string(string),
            },
            ast::ExprKind::Var(var) => match var {
                ast::Var::Principal => self.visit_principal_variable(),
                ast::Var::Resource => self.visit_resource_variable(),
                ast::Var::Action => self.visit_action_variable(),
                ast::Var::Context => self.visit_context_variable(),
            },
            ast::ExprKind::Unknown(unknown) => self.visit_unknown(&unknown.name),
            ast::ExprKind::Slot(slot) => {
                if slot.is_principal() {
                    self.visit_principal_slot()
                } else if slot.is_resource() {
                    self.visit_resource_slot()
                } else {
                    None
                }
            }
            ast::ExprKind::If {
                test_expr,
                then_expr,
                else_expr,
            } => self.visit_if(test_expr, then_expr, else_expr),
            ast::ExprKind::And { left, right } => self.visit_and(left, right),
            ast::ExprKind::Or { left, right } => self.visit_or(left, right),
            ast::ExprKind::UnaryApp { op, arg } => match op {
                ast::UnaryOp::IsEmpty => self.visit_is_empty(arg),
                ast::UnaryOp::Not => self.visit_not(arg),
                ast::UnaryOp::Neg => self.visit_neg(arg),
            },
            ast::ExprKind::BinaryApp { op, arg1, arg2 } => match op {
                ast::BinaryOp::Eq => self.visit_eq(arg1, arg2),
                ast::BinaryOp::Less => self.visit_less(arg1, arg2),
                ast::BinaryOp::LessEq => self.visit_less_eq(arg1, arg2),
                ast::BinaryOp::Add => self.visit_add(arg1, arg2),
                ast::BinaryOp::Sub => self.visit_sub(arg1, arg2),
                ast::BinaryOp::Mul => self.visit_mul(arg1, arg2),
                ast::BinaryOp::In => self.visit_in(arg1, arg2),
                ast::BinaryOp::Contains => self.visit_contains(arg1, arg2),
                ast::BinaryOp::ContainsAll => self.visit_contains_all(arg1, arg2),
                ast::BinaryOp::ContainsAny => self.visit_contains_any(arg1, arg2),
                ast::BinaryOp::GetTag => self.visit_get_tag(arg1, arg2),
                ast::BinaryOp::HasTag => self.visit_has_tag(arg1, arg2),
            },
            ast::ExprKind::ExtensionFunctionApp { fn_name, args } => {
                self.visit_extension_function_app(fn_name, args)
            }
            ast::ExprKind::GetAttr { expr, attr } => self.visit_get_attr(expr, attr),
            ast::ExprKind::HasAttr { expr, attr } => self.visit_has_attr(expr, attr),
            ast::ExprKind::Like { expr, pattern } => self.visit_like(expr, pattern),
            ast::ExprKind::Is { expr, entity_type } => self.visit_is(expr, entity_type),
            ast::ExprKind::Set(set) => self.visit_set(set),
            ast::ExprKind::Record(record) => self.visit_record(record),
        }
    }

    fn visit_euid(&self, euid: &ast::EntityUID) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_bool(&self, bool: bool) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_long(&self, long: i64) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_string(&self, string: &str) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_principal_variable(&self) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_resource_variable(&self) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_action_variable(&self) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_context_variable(&self) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_unknown(&self, name: &str) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_principal_slot(&self) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_resource_slot(&self) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_is_empty(&self, arg: &ast::Expr) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_not(&self, arg: &ast::Expr) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_neg(&self, arg: &ast::Expr) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_and(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_or(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_eq(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_less(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_less_eq(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_add(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_sub(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_mul(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_in(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_contains(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_contains_all(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_contains_any(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_get_tag(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_has_tag(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_set(&self, set: &[ast::Expr]) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_record(
        &self,
        record: &BTreeMap<SmolStr, ast::Expr>,
    ) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_extension_function_app(
        &self,
        fn_name: &ast::Name,
        args: &[ast::Expr],
    ) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_get_attr(
        &self,
        expr: &ast::Expr,
        attr: &str,
    ) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_has_attr(
        &self,
        expr: &ast::Expr,
        attr: &str,
    ) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_like(
        &self,
        expr: &ast::Expr,
        pattern: &ast::Pattern,
    ) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_is(
        &self,
        expr: &ast::Expr,
        entity_type: &ast::EntityType,
    ) -> Option<Result<Self::Value, Self::Error>> {
        None
    }

    fn visit_if(
        &self,
        test_expr: &ast::Expr,
        then_expr: &ast::Expr,
        else_expr: &ast::Expr,
    ) -> Option<Result<Self::Value, Self::Error>> {
        None
    }
}

pub(crate) trait CedarExpressionParser: Sized {
    fn parse_expr<V: CedarExpressionVisitor>(
        &self,
        expr: &ast::Expr,
        visitor: &V,
    ) -> Result<V::Value, Report<CedarExpressionParseError>>;
}

struct SimpleParser;

impl CedarExpressionParser for SimpleParser {
    fn parse_expr<V: CedarExpressionVisitor>(
        &self,
        expr: &ast::Expr,
        visitor: &V,
    ) -> Result<V::Value, Report<CedarExpressionParseError>>
    where
        Result<V::Value, V::Error>: ResultExt,
    {
        if let Some(value) = visitor.visit_expr(expr) {
            value.change_context(CedarExpressionParseError::ParseError)
        } else {
            Err(Report::new(CedarExpressionParseError::unexpected_expr_err(
                visitor,
                expr.clone().into(),
            )))
        }
    }
}

// pub struct FallbackParser<P> {
//     pub fallback: P,
// }

// impl<P> CedarExpressionParser for FallbackParser<P>
// where
//     P: CedarExpressionParser,
// {
//     fn parse_expr<V: CedarExpressionVisitor>(
//         &self,
//         expr: &ast::Expr,
//         visitor: &V,
//     ) -> Result<V::Value, Report<CedarExpressionParseError>> {
//         if let Some(value) = visitor
//             .visit_expr(expr)
//             .change_context(CedarExpressionParseError::ParseError)?
//         {
//             Ok(value)
//         } else {
//             self.fallback.parse_expr(expr, visitor)
//         }
//     }
// }

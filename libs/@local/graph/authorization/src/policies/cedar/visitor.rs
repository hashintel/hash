use alloc::{collections::BTreeMap, sync::Arc};
use core::error::Error;

use cedar_policy_core::ast;
use smol_str::SmolStr;

#[derive(Debug, derive_more::Display)]
pub(crate) enum CedarExpressionParseError {
    #[display("parsing the expression failed")]
    ParseError,
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
    #[expect(
        clippy::rc_buffer,
        reason = "This alignts with the representation in `Expr`"
    )]
    ExtensionFunctionApp(ast::Name, Arc<Vec<ast::Expr>>),

    // Ternary operators
    #[display("`if` ternary operator `if {_0} then {_1} else {_2}`")]
    If(Arc<ast::Expr>, Arc<ast::Expr>, Arc<ast::Expr>),

    // Sets
    #[display("set")]
    #[expect(
        clippy::rc_buffer,
        reason = "This alignts with the representation in `Expr`"
    )]
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

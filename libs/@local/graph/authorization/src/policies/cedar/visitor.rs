use alloc::collections::BTreeMap;
use core::{error::Error, fmt};

use cedar_policy_core::ast;
use error_stack::{Report, ResultExt as _};
use smol_str::SmolStr;

pub(crate) trait CedarExpressionVisitorError: Error + Send + Sync + 'static {
    fn unexpected_expression() -> Self;
}

#[derive(Debug, derive_more::Display)]
pub(crate) enum UnexpectedCedarExpression {
    // Literals
    #[display("ID `{_0}`")]
    EntityUID(ast::EntityUID),
    #[display("boolean `{_0}`")]
    Bool(bool),
    #[display("integral `{_0}`")]
    Integral(i64),
    #[display("string `\"{_0}\"`")]
    String(String),

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
    Unknown(String),

    // Slots
    #[display("principal slot")]
    PrincipalSlot,
    #[display("resource slot")]
    ResourceSlot,
    #[display("unknown slot")]
    UnknownSlot,

    // Unary operators
    #[display("`isEmpty` method call `{_0}.isEmpty()`")]
    IsEmpty(ast::Expr),
    #[display("`!` unary operator `!{_0}`")]
    Not(ast::Expr),
    #[display("`-` unary operator `-{_0}`")]
    Neg(ast::Expr),

    // Binary operators
    #[display("`&&` binary operator `{_0} && {_1}`")]
    And(ast::Expr, ast::Expr),
    #[display("`||` binary operator `{_0} || {_1}`")]
    Or(ast::Expr, ast::Expr),
    #[display("`==` binary operator `{_0} == {_1}`")]
    Eq(ast::Expr, ast::Expr),
    #[display("`<` binary operator `{_0} < {_1}`")]
    Less(ast::Expr, ast::Expr),
    #[display("`<=` binary operator `{_0} <= {_1}`")]
    LessEq(ast::Expr, ast::Expr),
    #[display("`+` binary operator `{_0} + {_1}`")]
    Add(ast::Expr, ast::Expr),
    #[display("`-` binary operator `{_0} - {_1}`")]
    Sub(ast::Expr, ast::Expr),
    #[display("`*` binary operator `{_0} * {_1}`")]
    Mul(ast::Expr, ast::Expr),
    #[display("`in` binary operator `{_0} in {_1}`")]
    In(ast::Expr, ast::Expr),
    #[display("`contains` binary operator `{_0}.contains({_1})`")]
    Contains(ast::Expr, ast::Expr),
    #[display("`containsAll` binary operator `{_0}.containsAll({_1})`")]
    ContainsAll(ast::Expr, ast::Expr),
    #[display("`containsAny` binary operator `{_0}.containsAny({_1})`")]
    ContainsAny(ast::Expr, ast::Expr),
    #[display("`getTag` binary operator `{_0}.getTag({_1})`")]
    GetTag(ast::Expr, ast::Expr),
    #[display("`hasTag` binary operator `{_0}.hasTag({_1})`")]
    HasTag(ast::Expr, ast::Expr),
    #[display("`is` binary operator `{_0} is {_1}`")]
    Is(ast::Expr, ast::EntityType),
    #[display("`like` binary operator `{_0} like {_1}`")]
    Like(ast::Expr, ast::Pattern),

    // Extension functions
    #[display("extension function `{_0}`")]
    ExtensionFunctionApp(ast::Name, Vec<ast::Expr>),

    // Ternary operators
    #[display("`if` ternary operator `if {_0} then {_1} else {_2}`")]
    If(ast::Expr, ast::Expr, ast::Expr),

    // Sets
    #[display("set")]
    Set(Vec<ast::Expr>),

    // Records
    #[display("record")]
    Record(BTreeMap<SmolStr, ast::Expr>),
    #[display("`getAttr` binary operator `{_0}.getAttr({_1})`")]
    GetAttr(ast::Expr, String),
    #[display("`hasAttr` binary operator `{_0}.hasAttr({_1})`")]
    HasAttr(ast::Expr, String),
}

#[derive(Debug, derive_more::Display)]
#[display("expected {expected}, got {kind}")]
pub(crate) struct VisitCedarExpressionError {
    expected: String,
    kind: UnexpectedCedarExpression,
}

impl VisitCedarExpressionError {
    pub(crate) fn new(
        visitor: &impl CedarExpressionVisitor,
        kind: UnexpectedCedarExpression,
    ) -> Self {
        struct Displayer<'v, V: CedarExpressionVisitor>(&'v V);

        impl<V: CedarExpressionVisitor> fmt::Display for Displayer<'_, V> {
            fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
                self.0.expecting(fmt)
            }
        }

        Self {
            expected: Displayer(visitor).to_string(),
            kind,
        }
    }
}

impl Error for VisitCedarExpressionError {}

pub(crate) trait CedarExpressionVisitor: Sized {
    type Error: CedarExpressionVisitorError;
    type Value;

    fn expecting(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result;

    fn visit_expr(&self, expr: &ast::Expr) -> Result<Self::Value, Report<Self::Error>> {
        self.visit_expr_kind(expr.expr_kind())
    }

    fn visit_expr_kind(&self, kind: &ast::ExprKind) -> Result<Self::Value, Report<Self::Error>> {
        match kind {
            ast::ExprKind::Lit(literal) => self.visit_literal(literal),
            ast::ExprKind::Var(var) => self.visit_variable(*var),
            ast::ExprKind::Unknown(unknown) => self.visit_unknown(&unknown.name),
            ast::ExprKind::Slot(slot) => self.visit_slot(*slot),
            ast::ExprKind::If {
                test_expr,
                then_expr,
                else_expr,
            } => self.visit_if(test_expr, then_expr, else_expr),
            ast::ExprKind::And { left, right } => self.visit_and(left, right),
            ast::ExprKind::Or { left, right } => self.visit_or(left, right),
            ast::ExprKind::UnaryApp { op, arg } => self.visit_unary_operator(*op, arg),
            ast::ExprKind::BinaryApp { op, arg1, arg2 } => {
                self.visit_binary_operator(*op, arg1, arg2)
            }
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

    fn visit_literal(&self, literal: &ast::Literal) -> Result<Self::Value, Report<Self::Error>> {
        match literal {
            ast::Literal::EntityUID(euid) => self.visit_euid(euid),
            ast::Literal::Bool(bool) => self.visit_bool(*bool),
            ast::Literal::Long(long) => self.visit_long(*long),
            ast::Literal::String(string) => self.visit_string(string),
        }
    }

    fn visit_euid(&self, euid: &ast::EntityUID) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::EntityUID(euid.clone()),
        )))
        .change_context(Self::Error::unexpected_expression())
    }

    fn visit_bool(&self, bool: bool) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::Bool(bool),
        )))
        .change_context(Self::Error::unexpected_expression())
    }

    fn visit_long(&self, long: i64) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::Integral(long),
        )))
        .change_context(Self::Error::unexpected_expression())
    }

    fn visit_string(&self, string: &str) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::String(string.to_owned()),
        )))
        .change_context(Self::Error::unexpected_expression())
    }

    fn visit_variable(&self, var: ast::Var) -> Result<Self::Value, Report<Self::Error>> {
        match var {
            ast::Var::Principal => self.visit_principal_variable(),
            ast::Var::Resource => self.visit_resource_variable(),
            ast::Var::Action => self.visit_action_variable(),
            ast::Var::Context => self.visit_context_variable(),
        }
    }

    fn visit_principal_variable(&self) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::PrincipalVariable,
        )))
        .change_context(Self::Error::unexpected_expression())
    }

    fn visit_resource_variable(&self) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::ResourceVariable,
        )))
        .change_context(Self::Error::unexpected_expression())
    }

    fn visit_action_variable(&self) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::ActionVariable,
        )))
        .change_context(Self::Error::unexpected_expression())
    }

    fn visit_context_variable(&self) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::ContextVariable,
        )))
        .change_context(Self::Error::unexpected_expression())
    }

    fn visit_unknown(&self, name: &str) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::Unknown(name.to_owned()),
        )))
        .change_context(Self::Error::unexpected_expression())
    }

    fn visit_slot(&self, slot: ast::SlotId) -> Result<Self::Value, Report<Self::Error>> {
        if slot.is_principal() {
            self.visit_principal_slot()
        } else if slot.is_resource() {
            self.visit_resource_slot()
        } else {
            Err(Report::new(VisitCedarExpressionError::new(
                self,
                UnexpectedCedarExpression::UnknownSlot,
            )))
            .change_context(Self::Error::unexpected_expression())
        }
    }

    fn visit_principal_slot(&self) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::PrincipalSlot,
        )))
        .change_context(Self::Error::unexpected_expression())
    }

    fn visit_resource_slot(&self) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::ResourceSlot,
        )))
        .change_context(Self::Error::unexpected_expression())
    }

    fn visit_unary_operator(
        &self,
        op: ast::UnaryOp,
        arg: &ast::Expr,
    ) -> Result<Self::Value, Report<Self::Error>> {
        match op {
            ast::UnaryOp::IsEmpty => self.visit_is_empty(arg),
            ast::UnaryOp::Not => self.visit_not(arg),
            ast::UnaryOp::Neg => self.visit_neg(arg),
        }
    }

    fn visit_is_empty(&self, arg: &ast::Expr) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::IsEmpty(arg.clone()),
        )))
        .change_context(Self::Error::unexpected_expression())
    }

    fn visit_not(&self, arg: &ast::Expr) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::Not(arg.clone()),
        )))
        .change_context(Self::Error::unexpected_expression())
    }

    fn visit_neg(&self, arg: &ast::Expr) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::Neg(arg.clone()),
        )))
        .change_context(Self::Error::unexpected_expression())
    }

    fn visit_and(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::And(lhs.clone(), rhs.clone()),
        )))
        .change_context(Self::Error::unexpected_expression())
    }

    fn visit_or(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::Or(lhs.clone(), rhs.clone()),
        )))
        .change_context(Self::Error::unexpected_expression())
    }

    fn visit_binary_operator(
        &self,
        op: ast::BinaryOp,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<Self::Value, Report<Self::Error>> {
        match op {
            ast::BinaryOp::Eq => self.visit_eq(lhs, rhs),
            ast::BinaryOp::Less => self.visit_less(lhs, rhs),
            ast::BinaryOp::LessEq => self.visit_less_eq(lhs, rhs),
            ast::BinaryOp::Add => self.visit_add(lhs, rhs),
            ast::BinaryOp::Sub => self.visit_sub(lhs, rhs),
            ast::BinaryOp::Mul => self.visit_mul(lhs, rhs),
            ast::BinaryOp::In => self.visit_in(lhs, rhs),
            ast::BinaryOp::Contains => self.visit_contains(lhs, rhs),
            ast::BinaryOp::ContainsAll => self.visit_contains_all(lhs, rhs),
            ast::BinaryOp::ContainsAny => self.visit_contains_any(lhs, rhs),
            ast::BinaryOp::GetTag => self.visit_get_tag(lhs, rhs),
            ast::BinaryOp::HasTag => self.visit_has_tag(lhs, rhs),
        }
    }

    fn visit_eq(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::Eq(lhs.clone(), rhs.clone()),
        ))
        .change_context(Self::Error::unexpected_expression()))
    }

    fn visit_less(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::Less(lhs.clone(), rhs.clone()),
        ))
        .change_context(Self::Error::unexpected_expression()))
    }

    fn visit_less_eq(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::LessEq(lhs.clone(), rhs.clone()),
        ))
        .change_context(Self::Error::unexpected_expression()))
    }

    fn visit_add(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::Add(lhs.clone(), rhs.clone()),
        ))
        .change_context(Self::Error::unexpected_expression()))
    }

    fn visit_sub(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::Sub(lhs.clone(), rhs.clone()),
        ))
        .change_context(Self::Error::unexpected_expression()))
    }

    fn visit_mul(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::Mul(lhs.clone(), rhs.clone()),
        ))
        .change_context(Self::Error::unexpected_expression()))
    }

    fn visit_in(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::In(lhs.clone(), rhs.clone()),
        ))
        .change_context(Self::Error::unexpected_expression()))
    }

    fn visit_contains(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::Contains(lhs.clone(), rhs.clone()),
        ))
        .change_context(Self::Error::unexpected_expression()))
    }

    fn visit_contains_all(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::ContainsAll(lhs.clone(), rhs.clone()),
        ))
        .change_context(Self::Error::unexpected_expression()))
    }

    fn visit_contains_any(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::ContainsAny(lhs.clone(), rhs.clone()),
        ))
        .change_context(Self::Error::unexpected_expression()))
    }

    fn visit_get_tag(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::GetTag(lhs.clone(), rhs.clone()),
        ))
        .change_context(Self::Error::unexpected_expression()))
    }

    fn visit_has_tag(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::HasTag(lhs.clone(), rhs.clone()),
        ))
        .change_context(Self::Error::unexpected_expression()))
    }

    fn visit_set(&self, set: &[ast::Expr]) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::Set(set.to_vec()),
        ))
        .change_context(Self::Error::unexpected_expression()))
    }

    fn visit_record(
        &self,
        record: &BTreeMap<SmolStr, ast::Expr>,
    ) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::Record(record.clone()),
        ))
        .change_context(Self::Error::unexpected_expression()))
    }

    fn visit_extension_function_app(
        &self,
        fn_name: &ast::Name,
        args: &[ast::Expr],
    ) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::ExtensionFunctionApp(fn_name.clone(), args.to_vec()),
        ))
        .change_context(Self::Error::unexpected_expression()))
    }

    fn visit_get_attr(
        &self,
        expr: &ast::Expr,
        attr: &str,
    ) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::GetAttr(expr.clone(), attr.to_owned()),
        ))
        .change_context(Self::Error::unexpected_expression()))
    }

    fn visit_has_attr(
        &self,
        expr: &ast::Expr,
        attr: &str,
    ) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::HasAttr(expr.clone(), attr.to_owned()),
        ))
        .change_context(Self::Error::unexpected_expression()))
    }

    fn visit_like(
        &self,
        expr: &ast::Expr,
        pattern: &ast::Pattern,
    ) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::Like(expr.clone(), pattern.clone()),
        ))
        .change_context(Self::Error::unexpected_expression()))
    }

    fn visit_is(
        &self,
        expr: &ast::Expr,
        entity_type: &ast::EntityType,
    ) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::Is(expr.clone(), entity_type.clone()),
        ))
        .change_context(Self::Error::unexpected_expression()))
    }

    fn visit_if(
        &self,
        test_expr: &ast::Expr,
        then_expr: &ast::Expr,
        else_expr: &ast::Expr,
    ) -> Result<Self::Value, Report<Self::Error>> {
        Err(Report::new(VisitCedarExpressionError::new(
            self,
            UnexpectedCedarExpression::If(test_expr.clone(), then_expr.clone(), else_expr.clone()),
        ))
        .change_context(Self::Error::unexpected_expression()))
    }
}

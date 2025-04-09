pub mod error;

use core::{
    fmt::{self, Display},
    mem,
};

use self::error::{
    InvalidTypeExpressionKind, SpecialFormExpanderDiagnostic, invalid_argument_length,
    invalid_type_expression, labeled_arguments_not_supported, unknown_special_form_generics,
    unknown_special_form_length, unknown_special_form_name,
};
use crate::{
    heap::Heap,
    node::{
        expr::{CallExpr, Expr, ExprKind, IfExpr, IsExpr, StructExpr, TupleExpr},
        path::Path,
        r#type::{Type, TypeKind},
    },
    visit::{Visitor, walk_expr},
};

mod paths {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, enum_iterator::Sequence)]
enum SpecialFormKind {
    If,
    Is,
    Let,
    Type,
    Newtype,
    Use,
    Fn,
    Input,
    Access,
    Index,
}

impl SpecialFormKind {
    fn as_str(&self) -> &'static str {
        match self {
            Self::If => "if",
            Self::Is => "is",
            Self::Let => "let",
            Self::Type => "type",
            Self::Newtype => "newtype",
            Self::Use => "use",
            Self::Fn => "fn",
            Self::Input => "input",
            Self::Access => "access",
            Self::Index => "index",
        }
    }

    fn from_str(name: &str) -> Option<Self> {
        match name {
            "if" => Some(Self::If),
            "is" => Some(Self::Is),
            "let" => Some(Self::Let),
            "type" => Some(Self::Type),
            "newtype" => Some(Self::Newtype),
            "use" => Some(Self::Use),
            "fn" => Some(Self::Fn),
            "input" => Some(Self::Input),
            "access" => Some(Self::Access),
            "index" => Some(Self::Index),
            _ => None,
        }
    }
}

impl Display for SpecialFormKind {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(self.as_str())
    }
}

enum UnknownHint {
    Length,   // Either too long or too short
    Name,     // Unknown name
    Generics, // Path makes use of generics
}

pub struct SpecialFormExpander<'heap> {
    heap: &'heap Heap,
    diagnostics: Vec<SpecialFormExpanderDiagnostic>,
}

impl<'heap> SpecialFormExpander<'heap> {
    pub const fn new(heap: &'heap Heap) -> Self {
        Self {
            heap,
            diagnostics: Vec::new(),
        }
    }

    fn lower_expr_to_type_call(&mut self, expr: CallExpr<'heap>) -> Option<Type<'heap>> {
        todo!()
    }

    fn lower_expr_to_type_struct(&mut self, expr: StructExpr<'heap>) -> Option<Type<'heap>> {
        todo!()
    }

    fn lower_expr_to_type_tuple(&mut self, expr: TupleExpr<'heap>) -> Option<Type<'heap>> {
        todo!()
    }

    fn lower_expr_to_type(&mut self, expr: &mut Expr<'heap>) -> Option<Type<'heap>> {
        let kind = mem::replace(&mut expr.kind, ExprKind::Dummy);

        match kind {
            ExprKind::Call(call_expr) => self.lower_expr_to_type_call(call_expr),
            ExprKind::Struct(struct_expr) => self.lower_expr_to_type_struct(struct_expr),
            ExprKind::Tuple(tuple_expr) => self.lower_expr_to_type_tuple(tuple_expr),
            ExprKind::Path(path) => Some(Type {
                id: expr.id,
                span: expr.span,
                kind: TypeKind::Path(path),
            }),
            kind @ (ExprKind::Dict(_)
            | ExprKind::List(_)
            | ExprKind::Literal(_)
            | ExprKind::Let(_)
            | ExprKind::Type(_)
            | ExprKind::NewType(_)
            | ExprKind::Use(_)
            | ExprKind::Input(_)
            | ExprKind::Closure(_)
            | ExprKind::If(_)
            | ExprKind::Field(_)
            | ExprKind::Index(_)
            | ExprKind::Is(_)
            | ExprKind::Dummy) => {
                let kind_name = match kind {
                    ExprKind::Dict(_) => InvalidTypeExpressionKind::Dict,
                    ExprKind::List(_) => InvalidTypeExpressionKind::List,
                    ExprKind::Literal(_) => InvalidTypeExpressionKind::Literal,
                    ExprKind::Let(_) => InvalidTypeExpressionKind::Let,
                    ExprKind::Type(_) => InvalidTypeExpressionKind::Type,
                    ExprKind::NewType(_) => InvalidTypeExpressionKind::NewType,
                    ExprKind::Use(_) => InvalidTypeExpressionKind::Use,
                    ExprKind::Input(_) => InvalidTypeExpressionKind::Input,
                    ExprKind::Closure(_) => InvalidTypeExpressionKind::Closure,
                    ExprKind::If(_) => InvalidTypeExpressionKind::If,
                    ExprKind::Field(_) => InvalidTypeExpressionKind::Field,
                    ExprKind::Index(_) => InvalidTypeExpressionKind::Index,
                    ExprKind::Is(_) => InvalidTypeExpressionKind::Is,
                    ExprKind::Dummy => InvalidTypeExpressionKind::Dummy,
                    _ => unreachable!(),
                };

                self.diagnostics
                    .push(invalid_type_expression(expr.span, kind_name));
                None
            }
        }
    }

    fn lower_if_2(&self, call: &mut CallExpr<'heap>) -> ExprKind<'heap> {
        // Implementation for if/2 special form
        // The `if/2` form takes the form (if test then) and has no else branch.

        // does not allocate if not pushed to (Vec that is)
        let arguments = mem::replace(&mut call.arguments, self.heap.vec(None));

        let [test, then] = arguments
            .try_into()
            .expect("The caller should've verified the length of the arguments");

        ExprKind::If(IfExpr {
            id: call.id,
            span: call.span,
            test: test.value,
            then: then.value,
            r#else: None,
        })
    }

    fn lower_if_3(&self, call: &mut CallExpr<'heap>) -> ExprKind<'heap> {
        // Implementation for if/3 special form
        // The `if/3` form takes the form (if test then else) and has an else branch.

        // does not allocate if not pushed to (Vec that is)
        let arguments = mem::replace(&mut call.arguments, self.heap.vec(None));

        let [test, then, r#else] = arguments
            .try_into()
            .expect("The caller should've verified the length of the arguments");

        ExprKind::If(IfExpr {
            id: call.id,
            span: call.span,
            test: test.value,
            then: then.value,
            r#else: Some(r#else.value),
        })
    }

    fn lower_if(&mut self, call: &mut CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        // Implementation for if special form
        // There are 2 forms of `if`, there's `if/2` and `if/3`

        let kind = if call.arguments.len() == 2 {
            self.lower_if_2(call)
        } else if call.arguments.len() == 3 {
            self.lower_if_3(call)
        } else {
            self.error_argument_length(call, SpecialFormKind::If, &[2, 3]);
            return None;
        };

        Some(kind)
    }

    fn lower_is(&mut self, call: &mut CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        // Implementation for is special form

        // There only exists `is/2`
        if call.arguments.len() != 2 {
            self.error_argument_length(call, SpecialFormKind::Is, &[2]);
            return None;
        }

        let arguments = mem::replace(&mut call.arguments, self.heap.vec(None));

        let [value, mut r#type] = arguments.try_into().unwrap_or_else(|_| unreachable!());

        let r#type = self.lower_expr_to_type(&mut r#type.value)?;

        Some(ExprKind::Is(IsExpr {
            id: call.id,
            span: call.span,
            value: value.value,
            r#type: self.heap.boxed(r#type),
        }))
    }

    fn lower_let(&mut self, call: &mut CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        // Implementation for let special form
        // There are 2 forms of `let`: `let/3` and `let/4`
        todo!()
    }

    fn lower_type(&mut self, call: &mut CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        // Implementation for type special form
        todo!()
    }

    fn lower_newtype(&mut self, call: &mut CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        // Implementation for newtype special form
        todo!()
    }

    fn lower_use(&mut self, call: &mut CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        // Implementation for use special form
        todo!()
    }

    fn lower_fn(&mut self, call: &mut CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        // Implementation for fn special form
        todo!()
    }

    fn lower_input(&mut self, call: &mut CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        // Implementation for input special form
        todo!()
    }

    fn lower_access(&mut self, call: &mut CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        // Implementation for access special form
        todo!()
    }

    fn lower_index(&mut self, call: &mut CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        // Implementation for index special form
        todo!()
    }

    fn error_argument_length(
        &mut self,
        call: &CallExpr<'heap>,
        name: SpecialFormKind,
        expected: &[usize],
    ) {
        self.diagnostics.push(invalid_argument_length(
            call.span,
            name,
            call.arguments.len(),
            expected,
        ));
    }

    fn error_labelled_arguments(&mut self, call: &CallExpr<'heap>) {
        self.diagnostics
            .push(labeled_arguments_not_supported(call.span));
    }

    fn error_unknown_special_form(&mut self, path: &Path<'_>, hint: UnknownHint) {
        match hint {
            UnknownHint::Length => {
                self.diagnostics
                    .push(unknown_special_form_length(path.span, path));
            }
            UnknownHint::Name => {
                self.diagnostics
                    .push(unknown_special_form_name(path.span, path));
            }
            UnknownHint::Generics => {
                let mut arguments = Vec::new();

                for segment in &path.segments {
                    arguments.extend(&segment.arguments);
                }

                self.diagnostics
                    .push(unknown_special_form_generics(&arguments));
            }
        }
    }
}

impl<'heap> Visitor<'heap> for SpecialFormExpander<'heap> {
    fn visit_expr(&mut self, expr: &mut Expr<'heap>) {
        // First we walk the whole expression tree, and only then do we expand ourselves.
        walk_expr(self, expr);

        let ExprKind::Call(call) = &mut expr.kind else {
            return;
        };

        let Some(ExprKind::Path(path)) = call.arguments.first().map(|arg| &arg.value.kind) else {
            return;
        };

        if !path.starts_with_absolute_path(["kernel", "special_form"]) {
            return;
        }

        if !call.labeled_arguments.is_empty() {
            self.error_labelled_arguments(call);
        }

        if path.segments.len() != 3 {
            // Special form path is always exactly three segments long
            self.error_unknown_special_form(path, UnknownHint::Length);

            // We consider this "fatal", in the sense that any further error reporting would be
            // redundant.
            return;
        }

        if path
            .segments
            .iter()
            .any(|segment| !segment.arguments.is_empty())
        {
            self.error_unknown_special_form(path, UnknownHint::Generics);
        }

        let function = &path.segments[2].name;

        let Some(special_form) = SpecialFormKind::from_str(function.value.as_str()) else {
            self.error_unknown_special_form(path, UnknownHint::Name);
            return;
        };

        let kind = match special_form {
            SpecialFormKind::If => self.lower_if(call),
            SpecialFormKind::Is => self.lower_is(call),
            SpecialFormKind::Let => self.lower_let(call),
            SpecialFormKind::Type => self.lower_type(call),
            SpecialFormKind::Newtype => self.lower_newtype(call),
            SpecialFormKind::Use => self.lower_use(call),
            SpecialFormKind::Fn => self.lower_fn(call),
            SpecialFormKind::Input => self.lower_input(call),
            SpecialFormKind::Access => self.lower_access(call),
            SpecialFormKind::Index => self.lower_index(call),
        };

        if let Some(kind) = kind {
            *expr = Expr {
                id: expr.id,
                span: expr.span,
                kind,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use enum_iterator::all;

    use super::*;

    #[test]
    fn special_form_name_bidirectional() {
        // Verify that for every variant, from_str(as_str(variant)) == Some(variant)
        for variant in all::<SpecialFormKind>() {
            let name = variant.as_str();
            let parsed = SpecialFormKind::from_str(name);

            assert_eq!(parsed, Some(variant));
        }
    }
}

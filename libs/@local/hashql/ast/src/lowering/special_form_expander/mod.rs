pub mod error;

use core::{
    fmt::{self, Display},
    mem,
};

use hashql_core::{span::SpanId, symbol::Ident};

use self::error::{
    InvalidTypeExpressionKind, SpecialFormExpanderDiagnostic, invalid_argument_length,
    invalid_let_name_not_path, invalid_let_name_qualified_path, invalid_type_call_function,
    invalid_type_expression, labeled_arguments_not_supported, unknown_special_form_generics,
    unknown_special_form_length, unknown_special_form_name, unsupported_type_constructor_function,
};
use crate::{
    heap::{self, Heap},
    node::{
        expr::{
            CallExpr, Expr, ExprKind, IfExpr, IsExpr, LetExpr, NewTypeExpr, StructExpr, TupleExpr,
            TypeExpr, UseExpr, call::Argument, r#use::UseKind,
        },
        id::NodeId,
        path::Path,
        r#type::{
            IntersectionType, StructField, StructType, TupleField, TupleType, Type, TypeKind,
            UnionType,
        },
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
    const fn as_str(self) -> &'static str {
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

    pub fn take_diagnostics(&mut self) -> Vec<SpecialFormExpanderDiagnostic> {
        mem::take(&mut self.diagnostics)
    }

    fn lower_expr_to_type_call(&mut self, expr: CallExpr<'heap>) -> Option<Type<'heap>> {
        const fn create_intersection_type<'heap>(
            id: NodeId,
            span: SpanId,
            types: heap::Vec<'heap, Type<'heap>>,
        ) -> TypeKind<'heap> {
            TypeKind::Intersection(IntersectionType { id, span, types })
        }

        const fn create_union_type<'heap>(
            id: NodeId,
            span: SpanId,
            types: heap::Vec<'heap, Type<'heap>>,
        ) -> TypeKind<'heap> {
            TypeKind::Union(UnionType { id, span, types })
        }

        let ExprKind::Path(path) = expr.function.kind else {
            self.diagnostics
                .push(invalid_type_call_function(expr.function.span));
            return None;
        };

        let constructor = if path.matches_absolute_path(["math", "bit_and"]) {
            // The `&` operator, which is internally overloaded for types to create intersections
            create_intersection_type
        } else if path.matches_absolute_path(["math", "bit_or"]) {
            // The `|` operator, which is internally overloaded for types to create unions
            create_union_type
        } else {
            self.diagnostics
                .push(unsupported_type_constructor_function(expr.function.span));
            return None;
        };

        let mut types = self.heap.vec(Some(expr.arguments.len()));

        let arguments_len = expr.arguments.len();
        for argument in expr.arguments {
            let Some(r#type) = self.lower_expr_to_type(*argument.value) else {
                continue;
            };

            types.push(r#type);
        }

        if types.len() != arguments_len {
            // An error occurred downstream, propagate said error
            return None;
        }

        Some(Type {
            id: expr.id,
            span: expr.span,
            kind: constructor(expr.id, expr.span, types),
        })
    }

    fn lower_expr_to_type_struct(&mut self, expr: StructExpr<'heap>) -> Option<Type<'heap>> {
        let mut fields = self.heap.vec(Some(expr.entries.len()));

        let entries_len = expr.entries.len();
        for entry in expr.entries {
            let Some(r#type) = self.lower_expr_to_type(*entry.value) else {
                continue;
            };

            fields.push(StructField {
                id: entry.id,
                span: entry.span,
                name: entry.key,
                r#type,
            });
        }

        if fields.len() != entries_len {
            // Downstream an error happened so we're propagating the error
            return None;
        }

        Some(Type {
            id: expr.id,
            span: expr.span,
            kind: TypeKind::Struct(StructType {
                id: expr.id,
                span: expr.span,
                fields,
            }),
        })
    }

    fn lower_expr_to_type_tuple(&mut self, expr: TupleExpr<'heap>) -> Option<Type<'heap>> {
        let mut fields = self.heap.vec(Some(expr.elements.len()));

        let elements_len = expr.elements.len();
        for element in expr.elements {
            let Some(r#type) = self.lower_expr_to_type(*element.value) else {
                continue;
            };

            fields.push(TupleField {
                id: element.id,
                span: element.span,
                r#type,
            });
        }

        if fields.len() != elements_len {
            // Downstream an error happened, so we're propagating the error
            return None;
        }

        Some(Type {
            id: expr.id,
            span: expr.span,
            kind: TypeKind::Tuple(TupleType {
                id: expr.id,
                span: expr.span,
                fields,
            }),
        })
    }

    fn lower_expr_to_type_path(
        &mut self,
        id: NodeId,
        span: SpanId,
        path: Path<'heap>,
    ) -> Type<'heap> {
        if path.matches_absolute_path(["kernel", "type", "Never"]) {
            return Type {
                id,
                span,
                kind: TypeKind::Never,
            };
        }

        if path.matches_absolute_path(["kernel", "type", "Unknown"]) {
            return Type {
                id,
                span,
                kind: TypeKind::Unknown,
            };
        }

        Type {
            id,
            span,
            kind: TypeKind::Path(path),
        }
    }

    fn lower_expr_to_type(&mut self, expr: Expr<'heap>) -> Option<Type<'heap>> {
        match expr.kind {
            ExprKind::Call(call_expr) => self.lower_expr_to_type_call(call_expr),
            ExprKind::Struct(struct_expr) => self.lower_expr_to_type_struct(struct_expr),
            ExprKind::Tuple(tuple_expr) => self.lower_expr_to_type_tuple(tuple_expr),
            ExprKind::Path(path) => Some(self.lower_expr_to_type_path(expr.id, expr.span, path)),
            ExprKind::Underscore => Some(Type {
                id: expr.id,
                span: expr.span,
                kind: TypeKind::Infer,
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

    /// Lowers an if/2 special form to an `IfExpr` with no else branch.
    ///
    /// The if/2 form has the syntax: `(if condition then-expr)`
    /// and is transformed into an if expression with no else branch.
    fn lower_if_2(call: CallExpr<'heap>) -> ExprKind<'heap> {
        let [test, then] = call
            .arguments
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

    /// Lowers an if/3 special form to an `IfExpr` with an else branch.
    ///
    /// The if/3 form has the syntax: `(if condition then-expr else-expr)`
    /// and is transformed into a complete if-then-else expression.
    fn lower_if_3(call: CallExpr<'heap>) -> ExprKind<'heap> {
        let [test, then, r#else] = call
            .arguments
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

    /// Lowers an if special form to the appropriate `IfExpr` variant.
    ///
    /// There are two forms of the `if` special form:
    /// - if/2: `(if condition then-expr)` - no else branch
    /// - if/3: `(if condition then-expr else-expr)` - with else branch
    ///
    /// This function validates the argument count and delegates to the appropriate
    /// specialized lowering function.
    fn lower_if(&mut self, call: CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        if call.arguments.len() == 2 {
            Some(Self::lower_if_2(call))
        } else if call.arguments.len() == 3 {
            Some(Self::lower_if_3(call))
        } else {
            self.diagnostics.push(invalid_argument_length(
                call.span,
                SpecialFormKind::If,
                &call.arguments,
                &[2, 3],
            ));

            None
        }
    }

    /// Lowers an is/2 special form to an `IsExpr`.
    ///
    /// The is/2 form has the syntax: `(is value type-expr)`
    /// and is transformed into a type assertion expression. This validates
    /// that `value` conforms to the type specified by `type-expr`.
    ///
    /// The function first checks that exactly 2 arguments are provided,
    /// then attempts to convert the second argument into a valid type expression.
    fn lower_is(&mut self, call: CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        // There only exists `is/2`
        if call.arguments.len() != 2 {
            self.diagnostics.push(invalid_argument_length(
                call.span,
                SpecialFormKind::Is,
                &call.arguments,
                &[2],
            ));

            return None;
        }

        let [value, r#type] = call.arguments.try_into().unwrap_or_else(|_| unreachable!());

        let r#type = self.lower_expr_to_type(*r#type.value)?;

        Some(ExprKind::Is(IsExpr {
            id: call.id,
            span: call.span,
            value: value.value,
            r#type: self.heap.boxed(r#type),
        }))
    }

    fn lower_argument_to_path(&mut self, argument: Argument<'heap>) -> Option<Path<'heap>> {
        let ExprKind::Path(path) = argument.value.kind else {
            self.diagnostics
                .push(invalid_let_name_not_path(argument.value.span));

            return None;
        };

        Some(path)
    }

    fn lower_argument_to_ident(&mut self, argument: Argument<'heap>) -> Option<Ident> {
        let path = self.lower_argument_to_path(argument)?;
        let span = path.span;

        let Some(name) = path.into_ident() else {
            self.diagnostics.push(invalid_let_name_qualified_path(span));

            return None;
        };

        Some(name)
    }

    /// Lowers a let/3 special form to a `LetExpr` without type annotation.
    ///
    /// The let/3 form has the syntax: `(let name value body)`
    /// and is transformed into a let expression with no explicit type annotation.
    fn lower_let_3(&mut self, call: CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        let [name, value, body] = call
            .arguments
            .try_into()
            .expect("The caller should've verified the length of the arguments");

        let name = self.lower_argument_to_ident(name)?;

        Some(ExprKind::Let(LetExpr {
            id: call.id,
            span: call.span,
            name,
            value: value.value,
            r#type: None,
            body: body.value,
        }))
    }

    /// Lowers a let/4 special form to a `LetExpr` with an explicit type annotation.
    ///
    /// The let/4 form has the syntax: `(let name type value body)`
    /// and is transformed into a let expression with an explicit type annotation.
    fn lower_let_4(&mut self, call: CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        let [name, r#type, value, body] = call
            .arguments
            .try_into()
            .expect("The caller should've verified the length of the arguments");

        let (name, r#type) = Option::zip(
            self.lower_argument_to_ident(name),
            self.lower_expr_to_type(*r#type.value),
        )?;

        Some(ExprKind::Let(LetExpr {
            id: call.id,
            span: call.span,
            name,
            value: value.value,
            r#type: Some(self.heap.boxed(r#type)),
            body: body.value,
        }))
    }

    /// Lowers a `let` special form to the appropriate `LetExpr` variant.
    ///
    /// There are two forms of the `let` special form:
    /// - let/3: `(let name value body)` - no type annotation
    /// - let/4: `(let name type value body)` - with type annotation
    ///
    /// This function validates the argument count and delegates to the appropriate
    /// specialized lowering function.
    fn lower_let(&mut self, call: CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        if call.arguments.len() == 3 {
            self.lower_let_3(call)
        } else if call.arguments.len() == 4 {
            self.lower_let_4(call)
        } else {
            self.diagnostics.push(invalid_argument_length(
                call.span,
                SpecialFormKind::Let,
                &call.arguments,
                &[3, 4],
            ));

            None
        }
    }

    /// Lowers a type/3 special form to a `TypeExpr`.
    ///
    /// The type/3 form has the syntax: `(type name type-expr body)`
    /// and is transformed into a type expression that defines a type alias.
    fn lower_type(&mut self, call: CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        if call.arguments.len() != 3 {
            self.diagnostics.push(invalid_argument_length(
                call.span,
                SpecialFormKind::Type,
                &call.arguments,
                &[3],
            ));

            return None;
        }

        let [name, value, body] = call.arguments.try_into().unwrap_or_else(|_| unreachable!());

        let (name, value) = Option::zip(
            self.lower_argument_to_ident(name),
            self.lower_expr_to_type(*value.value),
        )?;

        Some(ExprKind::Type(TypeExpr {
            id: call.id,
            span: call.span,
            name,
            value: self.heap.boxed(value),
            body: body.value,
        }))
    }

    /// Lowers a newtype/3 special form to a `NewTypeExpr`.
    ///
    /// The newtype/3 form has the syntax: `(newtype name type-expr body)`
    /// and is transformed into a newtype expression that defines a new type
    /// with the structure of the provided type expression.
    fn lower_newtype(&mut self, call: CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        if call.arguments.len() != 3 {
            self.diagnostics.push(invalid_argument_length(
                call.span,
                SpecialFormKind::Newtype,
                &call.arguments,
                &[3],
            ));

            return None;
        }

        let [name, value, body] = call.arguments.try_into().unwrap_or_else(|_| unreachable!());

        let (name, value) = Option::zip(
            self.lower_argument_to_ident(name),
            self.lower_expr_to_type(*value.value),
        )?;

        Some(ExprKind::NewType(NewTypeExpr {
            id: call.id,
            span: call.span,
            name,
            value: self.heap.boxed(value),
            body: body.value,
        }))
    }

    fn lower_use_imports(&mut self, argument: Argument<'heap>) -> Option<UseKind<'heap>> {
        // imports can have 3 forms:
        // `*` (symbol)
        //
        todo!()
    }

    fn lower_use(&mut self, call: CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        // Implementation for use special form
        // There's only one version: use/4
        if call.arguments.len() != 3 {
            self.diagnostics.push(invalid_argument_length(
                call.span,
                SpecialFormKind::Use,
                &call.arguments,
                &[4],
            ));
            return None;
        }

        let [path, imports, body] = call.arguments.try_into().unwrap_or_else(|_| unreachable!());

        let (path, kind) = Option::zip(
            self.lower_argument_to_path(path),
            self.lower_use_imports(imports),
        )?;

        if path.has_generic_arguments() {
            todo!("error out")
        }

        Some(ExprKind::Use(UseExpr {
            id: call.id,
            span: call.span,
            path,
            kind,
            body: body.value,
        }))
    }

    fn lower_fn(&mut self, _call: CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        // Implementation for fn special form
        todo!()
    }

    fn lower_input(&mut self, _call: CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        // Implementation for input special form
        todo!()
    }

    fn lower_access(&mut self, _call: CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        // Implementation for access special form
        todo!()
    }

    fn lower_index(&mut self, _call: CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        // Implementation for index special form
        todo!()
    }
}

impl<'heap> Visitor<'heap> for SpecialFormExpander<'heap> {
    fn visit_expr(&mut self, expr: &mut Expr<'heap>) {
        // First we walk the whole expression tree, and only then do we expand ourselves.
        walk_expr(self, expr);

        let ExprKind::Call(call) = &mut expr.kind else {
            return;
        };

        let ExprKind::Path(path) = &call.function.kind else {
            return;
        };

        // We're not checking for arguments, as these will result in an error later
        if !path.starts_with_absolute_path(["kernel", "special_form"], false) {
            return;
        }

        // Anything below here means that we're dealing with a special form, therefore anytime we
        // error out we replace the kind with a dummy expression. This allows us to continue
        // processing the rest of the expression tree during the different phases of lowering.

        let ExprKind::Call(call) = mem::replace(&mut expr.kind, ExprKind::Dummy) else {
            // We're verified before that this is a call expression
            unreachable!()
        };

        let ExprKind::Path(path) = &call.function.kind else {
            // We're verified before that this is a path expression
            unreachable!()
        };

        if !call.labeled_arguments.is_empty() {
            self.diagnostics.push(labeled_arguments_not_supported(
                call.span,
                &call.labeled_arguments,
            ));

            return;
        }

        if path.segments.len() != 3 {
            // Special form path is always exactly three segments long
            self.diagnostics
                .push(unknown_special_form_length(path.span, path));

            return;
        }

        if path.has_generic_arguments() {
            let mut arguments = Vec::new();

            for segment in &path.segments {
                arguments.extend(&segment.arguments);
            }

            self.diagnostics
                .push(unknown_special_form_generics(&arguments));

            return;
        }

        let function = &path.segments[2].name;

        let Some(special_form) = SpecialFormKind::from_str(function.value.as_str()) else {
            self.diagnostics
                .push(unknown_special_form_name(path.span, path));

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
            expr.kind = kind;
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

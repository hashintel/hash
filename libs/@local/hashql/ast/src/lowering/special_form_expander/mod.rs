pub mod error;

use core::{
    fmt::{self, Display},
    mem,
};

use hashql_core::{
    collections::{FastHashMap, fast_hash_map_with_capacity},
    heap::{self, Heap},
    span::SpanId,
    symbol::{Ident, IdentKind},
    value::Primitive,
};
use hashql_diagnostics::DiagnosticIssues;

use self::error::{
    BindingMode, InvalidTypeExpressionKind, SpecialFormExpanderDiagnosticIssues,
    duplicate_closure_generic, duplicate_closure_parameter, duplicate_generic_constraint,
    field_index_out_of_bounds, field_literal_type_annotation, fn_generics_with_type_annotation,
    fn_params_with_type_annotation, invalid_argument_length, invalid_binding_name_not_path,
    invalid_field_literal_type, invalid_fn_generic_param, invalid_fn_generics_expression,
    invalid_fn_params_expression, invalid_generic_argument_path, invalid_generic_argument_type,
    invalid_let_name_qualified_path, invalid_path_in_use_binding, invalid_type_call_function,
    invalid_type_expression, invalid_type_name_qualified_path, invalid_use_import,
    labeled_arguments_not_supported, type_with_existing_annotation, unknown_special_form_generics,
    unknown_special_form_length, unknown_special_form_name, unsupported_type_constructor_function,
    use_imports_with_type_annotation, use_path_with_generics,
};
use crate::{
    node::{
        expr::{
            AsExpr, CallExpr, ClosureExpr, Expr, ExprKind, FieldExpr, IfExpr, IndexExpr, InputExpr,
            LetExpr, NewTypeExpr, StructExpr, TupleExpr, TypeExpr, UseExpr,
            call::Argument,
            closure::{ClosureParam, ClosureSignature},
            r#use::{Glob, UseBinding, UseKind},
        },
        generic::{GenericArgument, GenericConstraint, GenericParam, Generics},
        id::NodeId,
        path::{Path, PathSegmentArgument},
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
    As,
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
            Self::As => "as",
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
            "as" => Some(Self::As),
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
    diagnostics: SpecialFormExpanderDiagnosticIssues,
}

impl<'heap> SpecialFormExpander<'heap> {
    pub const fn new(heap: &'heap Heap) -> Self {
        Self {
            heap,
            diagnostics: DiagnosticIssues::new(),
        }
    }

    pub fn take_diagnostics(&mut self) -> SpecialFormExpanderDiagnosticIssues {
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

        let constructor = if path.matches_absolute_path(["core", "bits", "and"]) {
            // The `&` operator, which is internally overloaded for types to create intersections
            create_intersection_type
        } else if path.matches_absolute_path(["core", "bits", "or"]) {
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
        if let Some(type_expr) = &expr.r#type {
            self.diagnostics
                .push(type_with_existing_annotation(type_expr.span));
            return None;
        }

        let entries_len = expr.entries.len();
        let mut fields = self.heap.vec(Some(entries_len));

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
        if let Some(type_expr) = &expr.r#type {
            self.diagnostics
                .push(type_with_existing_annotation(type_expr.span));
            return None;
        }

        let elements_len = expr.elements.len();
        let mut fields = self.heap.vec(Some(elements_len));

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

    fn lower_expr_to_type(&mut self, expr: Expr<'heap>) -> Option<Type<'heap>> {
        match expr.kind {
            ExprKind::Call(call_expr) => self.lower_expr_to_type_call(call_expr),
            ExprKind::Struct(struct_expr) => self.lower_expr_to_type_struct(struct_expr),
            ExprKind::Tuple(tuple_expr) => self.lower_expr_to_type_tuple(tuple_expr),
            ExprKind::Path(path) => Some(Type {
                id: expr.id,
                span: expr.span,
                kind: TypeKind::Path(path),
            }),
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
            | ExprKind::As(_)
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
                    ExprKind::As(_) => InvalidTypeExpressionKind::As,
                    ExprKind::Dummy => InvalidTypeExpressionKind::Dummy,
                    ExprKind::Call(_)
                    | ExprKind::Struct(_)
                    | ExprKind::Tuple(_)
                    | ExprKind::Path(_)
                    | ExprKind::Underscore => unreachable!(),
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

    /// Lowers an as/2 special form to an `AsExpr`.
    ///
    /// The as/2 form has the syntax: `(as value type-expr)`
    /// and is transformed into a type assertion expression. This validates
    /// that `value` conforms to the type specified by `type-expr`.
    ///
    /// The function first checks that exactly 2 arguments are provided,
    /// then attempts to convert the second argument into a valid type expression.
    fn lower_as(&mut self, call: CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        if call.arguments.len() != 2 {
            self.diagnostics.push(invalid_argument_length(
                call.span,
                SpecialFormKind::As,
                &call.arguments,
                &[2],
            ));

            return None;
        }

        let [value, r#type] = call.arguments.try_into().unwrap_or_else(|_| unreachable!());

        let r#type = self.lower_expr_to_type(*r#type.value)?;

        Some(ExprKind::As(AsExpr {
            id: call.id,
            span: call.span,
            value: value.value,
            r#type: self.heap.boxed(r#type),
        }))
    }

    /// Attempts to extract a `Path` from an argument.
    ///
    /// This function is used by various special form lowering functions to extract
    /// path expressions from arguments. It checks if the argument contains a path
    /// expression and returns it if present, otherwise it adds a diagnostic and
    /// returns `None`.
    ///
    /// The `mode` parameter is used for generating appropriate error diagnostics.
    fn lower_argument_to_path(
        &mut self,
        mode: BindingMode,
        argument: Argument<'heap>,
    ) -> Option<Path<'heap>> {
        let ExprKind::Path(path) = argument.value.kind else {
            self.diagnostics
                .push(invalid_binding_name_not_path(argument.value.span, mode));

            return None;
        };

        Some(path)
    }

    /// Attempts to extract an identifier from an argument.
    ///
    /// This function validates that the argument contains a simple path expression that
    /// can be converted to an identifier. It first extracts a path using `lower_argument_to_path`
    /// and then ensures the path is a simple identifier (not a qualified path).
    ///
    /// The `mode` parameter is used for generating appropriate error diagnostics.
    fn lower_argument_to_ident(
        &mut self,
        mode: BindingMode,
        argument: Argument<'heap>,
    ) -> Option<Ident<'heap>> {
        let path = self.lower_argument_to_path(mode, argument)?;
        let span = path.span;

        let Some(name) = path.into_ident() else {
            self.diagnostics
                .push(invalid_let_name_qualified_path(span, mode));

            return None;
        };

        Some(name)
    }

    /// Attempts to extract a field identifier from an argument.
    ///
    /// This function handles both named field access (using identifiers) and indexed field access
    /// (using integer literals). For literals, it validates that they are integers without type
    /// annotations and within usize bounds. Otherwise, it falls back to `lower_argument_to_ident`
    /// for named field access.
    ///
    /// The `mode` parameter is used for generating appropriate error diagnostics.
    fn lower_argument_to_field(
        &mut self,
        mode: BindingMode,
        argument: Argument<'heap>,
    ) -> Option<Ident<'heap>> {
        if let ExprKind::Literal(literal) = &argument.value.kind {
            if let Some(r#type) = &literal.r#type {
                self.diagnostics
                    .push(field_literal_type_annotation(r#type.span));
            }

            let Primitive::Integer(integer) = literal.kind else {
                self.diagnostics
                    .push(invalid_field_literal_type(literal.span));
                return None;
            };

            if integer.as_usize().is_none() {
                self.diagnostics
                    .push(field_index_out_of_bounds(literal.span));
                return None;
            }

            return Some(Ident {
                span: literal.span,
                value: integer.as_symbol(),
                kind: IdentKind::Lexical,
            });
        }

        self.lower_argument_to_ident(mode, argument)
    }

    fn lower_argument_to_generic_ident(
        &mut self,
        mode: BindingMode,
        argument: Argument<'heap>,
    ) -> Option<(Ident<'heap>, heap::Vec<'heap, PathSegmentArgument<'heap>>)> {
        let path = self.lower_argument_to_path(mode, argument)?;
        let span = path.span;

        let Ok(name) = path.into_generic_ident() else {
            self.diagnostics
                .push(invalid_type_name_qualified_path(span, mode));

            return None;
        };

        Some(name)
    }

    fn lower_path_segment_arguments_to_constraints(
        &mut self,
        arguments: heap::Vec<'heap, PathSegmentArgument<'heap>>,
    ) -> Option<heap::Vec<'heap, GenericConstraint<'heap>>> {
        let mut constraints = self.heap.vec(Some(arguments.len()));

        let mut seen = fast_hash_map_with_capacity(arguments.len());

        for argument in arguments {
            match argument {
                PathSegmentArgument::Argument(GenericArgument {
                    id,
                    span,
                    ref r#type,
                }) if let Type {
                    kind: TypeKind::Path(path),
                    ..
                } = r#type.as_ref()
                    && let Some(&ident) = path.as_ident() =>
                {
                    if let Err(error) = seen.try_insert(ident.value, ident.span) {
                        self.diagnostics.push(duplicate_generic_constraint(
                            ident.span,
                            ident.value.as_str(),
                            *error.entry.get(),
                        ));

                        continue;
                    }

                    constraints.push(GenericConstraint {
                        id,
                        span,
                        name: ident,
                        bound: None,
                    });
                }
                // Specialized errors for paths, to properly guide the user
                PathSegmentArgument::Argument(GenericArgument { ref r#type, .. })
                    if let Type {
                        kind: TypeKind::Path(path),
                        ..
                    } = r#type.as_ref() =>
                {
                    self.diagnostics
                        .push(invalid_generic_argument_path(path.span));

                    return None;
                }
                PathSegmentArgument::Argument(generic_argument) => {
                    self.diagnostics
                        .push(invalid_generic_argument_type(generic_argument.r#type.span));

                    return None;
                }
                PathSegmentArgument::Constraint(generic_constraint) => {
                    if let Err(error) =
                        seen.try_insert(generic_constraint.name.value, generic_constraint.name.span)
                    {
                        self.diagnostics.push(duplicate_generic_constraint(
                            generic_constraint.span,
                            generic_constraint.name.value.as_str(),
                            *error.entry.get(),
                        ));

                        continue;
                    }

                    constraints.push(generic_constraint);
                }
            }
        }

        Some(constraints)
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

        let name = self.lower_argument_to_ident(BindingMode::Let, name)?;

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
            self.lower_argument_to_ident(BindingMode::Let, name),
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

        let ((name, arguments), value) = Option::zip(
            self.lower_argument_to_generic_ident(BindingMode::Type, name),
            self.lower_expr_to_type(*value.value),
        )?;

        let constraints = self.lower_path_segment_arguments_to_constraints(arguments)?;

        Some(ExprKind::Type(TypeExpr {
            id: call.id,
            span: call.span,

            name,
            constraints,

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

        let ((name, arguments), value) = Option::zip(
            self.lower_argument_to_generic_ident(BindingMode::Newtype, name),
            self.lower_expr_to_type(*value.value),
        )?;

        let constraints = self.lower_path_segment_arguments_to_constraints(arguments)?;

        Some(ExprKind::NewType(NewTypeExpr {
            id: call.id,
            span: call.span,

            name,
            constraints,

            value: self.heap.boxed(value),
            body: body.value,
        }))
    }

    /// Processes a struct expression for use imports.
    ///
    /// Struct-style imports have the form `{key: value, ...}` where each key represents the
    /// name to bind and each value is either an underscore (to use the same name) or
    /// an identifier (to use as alias).
    ///
    /// Returns a `UseKind::Named` with the appropriate bindings if successful.
    fn lower_use_imports_struct(&mut self, r#struct: StructExpr<'heap>) -> Option<UseKind<'heap>> {
        // {key: value}, each value must be a value must be an underscore *or* ident
        if let Some(type_expr) = &r#struct.r#type {
            self.diagnostics
                .push(use_imports_with_type_annotation(type_expr.span));
            return None;
        }

        let entries_len = r#struct.entries.len();
        let mut bindings = self.heap.vec(Some(entries_len));

        for entry in r#struct.entries {
            let path = match entry.value.kind {
                ExprKind::Path(path) => path,
                ExprKind::Underscore => {
                    bindings.push(UseBinding {
                        id: entry.id,
                        span: entry.span,
                        name: entry.key,
                        alias: None,
                    });

                    continue;
                }
                ExprKind::Call(_)
                | ExprKind::Struct(_)
                | ExprKind::Dict(_)
                | ExprKind::Tuple(_)
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
                | ExprKind::As(_)
                | ExprKind::Dummy => {
                    self.diagnostics.push(invalid_use_import(entry.value.span));
                    continue;
                }
            };

            let path_span = path.span;
            let Some(alias) = path.into_ident() else {
                self.diagnostics
                    .push(invalid_path_in_use_binding(path_span));
                continue;
            };

            bindings.push(UseBinding {
                id: entry.id,
                span: entry.span,
                name: entry.key,
                alias: Some(alias),
            });
        }

        if bindings.len() != entries_len {
            // error occurred downstream, propagate said error
            return None;
        }

        Some(UseKind::Named(bindings))
    }

    /// Processes a tuple expression for use imports.
    ///
    /// Tuple-style imports have the form `(path1, path2, ...)` where each path
    /// should be a simple identifier. These imports use the original name without aliasing.
    ///
    /// Returns a `UseKind::Named` with the appropriate bindings if successful.
    fn lower_use_imports_tuple(&mut self, tuple: TupleExpr<'heap>) -> Option<UseKind<'heap>> {
        if let Some(type_expr) = &tuple.r#type {
            self.diagnostics
                .push(use_imports_with_type_annotation(type_expr.span));
            return None;
        }

        let elements_len = tuple.elements.len();
        let mut bindings = self.heap.vec(Some(elements_len));

        for element in tuple.elements {
            let ExprKind::Path(path) = element.value.kind else {
                self.diagnostics
                    .push(invalid_use_import(element.value.span));
                continue;
            };

            let path_span = path.span;
            let Some(name) = path.into_ident() else {
                self.diagnostics
                    .push(invalid_path_in_use_binding(path_span));
                continue;
            };

            bindings.push(UseBinding {
                id: element.id,
                span: element.span,
                name,
                alias: None,
            });
        }

        if bindings.len() != elements_len {
            // error occurred downstream, propagate said error
            return None;
        }

        Some(UseKind::Named(bindings))
    }

    /// Processes use imports in different forms.
    ///
    /// This function handles three forms of imports:
    /// - `*` (symbol) - Import all items (glob import)
    /// - Struct-style imports - Named imports with potential aliases
    /// - Tuple-style imports - Named imports without aliases
    ///
    /// Returns the appropriate `UseKind` variant based on the import form.
    fn lower_use_imports(&mut self, argument: Argument<'heap>) -> Option<UseKind<'heap>> {
        match argument.value.kind {
            ExprKind::Path(path) => {
                let path_id = path.id;

                let path_span = path.span;
                if let Some(ident) = path.into_ident() {
                    if ident.value.as_str() == "*" {
                        return Some(UseKind::Glob(Glob {
                            id: path_id,
                            span: ident.span,
                        }));
                    }

                    self.diagnostics.push(invalid_use_import(ident.span));
                    return None;
                }

                self.diagnostics
                    .push(invalid_path_in_use_binding(path_span));
                None
            }
            ExprKind::Struct(r#struct) => self.lower_use_imports_struct(r#struct),
            ExprKind::Tuple(tuple) => self.lower_use_imports_tuple(tuple),
            ExprKind::Call(_)
            | ExprKind::Dict(_)
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
            | ExprKind::As(_)
            | ExprKind::Underscore
            | ExprKind::Dummy => {
                self.diagnostics
                    .push(invalid_use_import(argument.value.span));
                None
            }
        }
    }

    /// Lowers a use/3 special form to a `UseExpr`.
    ///
    /// The use/3 form has the syntax: `(use path imports body)`
    /// where path is the module path to import from, imports specifies
    /// what to import, and body is the expression in which the imports are available.
    ///
    /// This function verifies the argument count and structure, then processes
    /// the path and imports to create a `UseExpr`.
    fn lower_use(&mut self, call: CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        if call.arguments.len() != 3 {
            self.diagnostics.push(invalid_argument_length(
                call.span,
                SpecialFormKind::Use,
                &call.arguments,
                &[3],
            ));
            return None;
        }

        let [path, imports, body] = call.arguments.try_into().unwrap_or_else(|_| unreachable!());

        let (path, kind) = Option::zip(
            self.lower_argument_to_path(BindingMode::Use, path),
            self.lower_use_imports(imports),
        )?;

        if path.has_generic_arguments() {
            self.diagnostics
                .push(use_path_with_generics(path.span, &path));

            return None;
        }

        Some(ExprKind::Use(UseExpr {
            id: call.id,
            span: call.span,
            path,
            kind,
            body: body.value,
        }))
    }

    /// Processes a tuple expression for function generic parameters.
    ///
    /// This function extracts generic parameter names from a tuple expression
    /// with the form `(param1, param2, ...)` where each element is a path
    /// that can be converted to an identifier.
    ///
    /// Returns a `Generics` instance containing the generic parameters with no bounds.
    fn lower_fn_generics_tuple(&mut self, tuple: TupleExpr<'heap>) -> Option<Generics<'heap>> {
        if let Some(type_expr) = &tuple.r#type {
            self.diagnostics
                .push(fn_generics_with_type_annotation(type_expr.span));
            return None;
        }

        let elements_len = tuple.elements.len();
        let mut params = self.heap.vec(Some(elements_len));

        for element in tuple.elements {
            let ExprKind::Path(path) = element.value.kind else {
                self.diagnostics
                    .push(invalid_fn_generics_expression(element.value.span));
                continue;
            };

            let path_span = path.span;
            let Some(name) = path.into_ident() else {
                self.diagnostics.push(invalid_fn_generic_param(path_span));
                continue;
            };

            params.push(GenericParam {
                id: element.id,
                span: element.span,
                name,
                bound: None,
            });
        }

        if params.len() != elements_len {
            // Downstream an error happened which we catch
            return None;
        }

        Some(Generics {
            id: tuple.id,
            span: tuple.span,
            params,
        })
    }

    /// Processes a struct expression for function generic parameters with bounds.
    ///
    /// This function extracts generic parameters from a struct expression with the form
    /// `(param1: bound1, param2: _, ...)` where each key is a parameter name and each
    /// value is either an underscore (for no bound) or a type expression (for a bound).
    ///
    /// Returns a `Generics` instance containing the generic parameters with their bounds.
    fn lower_fn_generics_struct(&mut self, r#struct: StructExpr<'heap>) -> Option<Generics<'heap>> {
        if let Some(type_expr) = &r#struct.r#type {
            self.diagnostics
                .push(fn_generics_with_type_annotation(type_expr.span));
            return None;
        }

        let entries_len = r#struct.entries.len();
        let mut params = self.heap.vec(Some(entries_len));

        for entry in r#struct.entries {
            let bound = if matches!(entry.value.kind, ExprKind::Underscore) {
                None
            } else if let Some(bound) = self.lower_expr_to_type(*entry.value) {
                Some(self.heap.boxed(bound))
            } else {
                continue;
            };

            params.push(GenericParam {
                id: entry.id,
                span: entry.span,
                name: entry.key,
                bound,
            });
        }

        if params.len() != entries_len {
            // Downstream an error happened which we catch
            return None;
        }

        Some(Generics {
            id: r#struct.id,
            span: r#struct.span,
            params,
        })
    }

    /// Processes an argument for function generic parameters.
    ///
    /// This function handles two forms of generic parameter declarations:
    /// - Tuple form: Simple parameters without bounds
    /// - Struct form: Parameters with optional type bounds
    ///
    /// Returns a `Generics` instance if successful.
    fn lower_fn_generics(&mut self, argument: Argument<'heap>) -> Option<Generics<'heap>> {
        match argument.value.kind {
            ExprKind::Tuple(tuple) => self.lower_fn_generics_tuple(tuple),
            ExprKind::Struct(r#struct) => self.lower_fn_generics_struct(r#struct),
            ExprKind::Call(_)
            | ExprKind::Dict(_)
            | ExprKind::List(_)
            | ExprKind::Literal(_)
            | ExprKind::Path(_)
            | ExprKind::Let(_)
            | ExprKind::Type(_)
            | ExprKind::NewType(_)
            | ExprKind::Use(_)
            | ExprKind::Input(_)
            | ExprKind::Closure(_)
            | ExprKind::If(_)
            | ExprKind::Field(_)
            | ExprKind::Index(_)
            | ExprKind::As(_)
            | ExprKind::Underscore
            | ExprKind::Dummy => {
                self.diagnostics
                    .push(invalid_fn_generics_expression(argument.value.span));
                None
            }
        }
    }

    /// Processes a struct expression for function parameters.
    ///
    /// This function extracts parameter names and type bounds from a struct expression
    /// with the form `(param1: type1, param2: type2, ...)` where each key is a parameter name
    /// and each value is a type expression representing the parameter type.
    ///
    /// Returns a vector of `ClosureParam` instances if successful.
    fn lower_fn_parameters(
        &mut self,
        argument: Argument<'heap>,
    ) -> Option<heap::Vec<'heap, ClosureParam<'heap>>> {
        let ExprKind::Struct(r#struct) = argument.value.kind else {
            self.diagnostics
                .push(invalid_fn_params_expression(argument.value.span));
            return None;
        };

        if let Some(type_expr) = &r#struct.r#type {
            self.diagnostics
                .push(fn_params_with_type_annotation(type_expr.span));
            return None;
        }

        let entries_len = r#struct.entries.len();
        let mut params = self.heap.vec(Some(entries_len));

        for entry in r#struct.entries {
            let Some(bound) = self.lower_expr_to_type(*entry.value) else {
                continue;
            };

            params.push(ClosureParam {
                id: entry.id,
                span: entry.span,
                name: entry.key,
                bound: self.heap.boxed(bound),
            });
        }

        if params.len() != entries_len {
            // downstream we've received an error, propagate said error
            return None;
        }

        Some(params)
    }

    /// Lowers a fn/4 special form to a `ClosureExpr`.
    ///
    /// The fn/4 form has the syntax: `(fn generics params return-type body)`
    /// where:
    /// - `generics` defines type parameters
    /// - `params` defines function parameters and their types
    /// - `return-type` specifies the function return type
    /// - `body` is the function implementation
    ///
    /// This function processes the arguments to create a function expression.
    fn lower_fn(&mut self, call: CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        if call.arguments.len() != 4 {
            self.diagnostics.push(invalid_argument_length(
                call.span,
                SpecialFormKind::Fn,
                &call.arguments,
                &[4],
            ));

            return None;
        }

        let [generics, params, return_type, body] =
            call.arguments.try_into().unwrap_or_else(|_| unreachable!());

        let ((generics, params), return_type) = self
            .lower_fn_generics(generics)
            .zip(self.lower_fn_parameters(params))
            .zip(self.lower_expr_to_type(*return_type.value))?;

        let mut seen = FastHashMap::with_capacity_and_hasher(
            generics.params.len().max(params.len()),
            foldhash::fast::RandomState::default(),
        );

        for param in &generics.params {
            if let Err(error) = seen.try_insert(param.name.value, param.name.span) {
                self.diagnostics.push(duplicate_closure_generic(
                    param.name.span,
                    param.name.value.as_str(),
                    *error.entry.get(),
                ));
            }
        }

        seen.clear();

        for param in &params {
            if let Err(error) = seen.try_insert(param.name.value, param.name.span) {
                self.diagnostics.push(duplicate_closure_parameter(
                    param.name.span,
                    param.name.value.as_str(),
                    *error.entry.get(),
                ));
            }
        }

        let signature = ClosureSignature {
            id: NodeId::PLACEHOLDER,
            // TODO: ideally we'd like to merge the span of `generics`, `params`, and `return_type`
            // into one.
            span: call.span,
            generics,
            inputs: params,
            output: self.heap.boxed(return_type),
        };

        Some(ExprKind::Closure(ClosureExpr {
            id: call.id,
            span: call.span,
            signature: self.heap.boxed(signature),
            body: body.value,
        }))
    }

    /// Lowers an input/2 special form to an `InputExpr` without a default value.
    ///
    /// The input/2 form has the syntax: `(input name type)`
    /// and is transformed into an input expression that defines a required input.
    fn lower_input_2(&mut self, call: CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        let [name, r#type] = call
            .arguments
            .try_into()
            .expect("The caller should've verified the length of the arguments");

        let (name, r#type) = Option::zip(
            self.lower_argument_to_ident(BindingMode::Input, name),
            self.lower_expr_to_type(*r#type.value),
        )?;

        Some(ExprKind::Input(InputExpr {
            id: call.id,
            span: call.span,
            name,
            r#type: self.heap.boxed(r#type),
            default: None,
        }))
    }

    /// Lowers an input/3 special form to an `InputExpr` with a default value.
    ///
    /// The input/3 form has the syntax: `(input name type default)`
    /// and is transformed into an input expression with a default value.
    fn lower_input_3(&mut self, call: CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        let [name, r#type, default] = call
            .arguments
            .try_into()
            .expect("The caller should've verified the length of the arguments");

        let (name, r#type) = Option::zip(
            self.lower_argument_to_ident(BindingMode::Input, name),
            self.lower_expr_to_type(*r#type.value),
        )?;

        Some(ExprKind::Input(InputExpr {
            id: call.id,
            span: call.span,
            name,
            r#type: self.heap.boxed(r#type),
            default: Some(default.value),
        }))
    }

    /// Lowers an input special form to the appropriate `InputExpr` variant.
    ///
    /// There are two forms of the `input` special form:
    /// - input/2: `(input name type)` - defines a required input
    /// - input/3: `(input name type default)` - defines an input with a default value
    ///
    /// This function validates the argument count and delegates to the appropriate
    /// specialized lowering function.
    fn lower_input(&mut self, call: CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        if call.arguments.len() == 2 {
            self.lower_input_2(call)
        } else if call.arguments.len() == 3 {
            self.lower_input_3(call)
        } else {
            self.diagnostics.push(invalid_argument_length(
                call.span,
                SpecialFormKind::Input,
                &call.arguments,
                &[2, 3],
            ));

            None
        }
    }

    /// Lowers an access/2 special form to a `FieldExpr`.
    ///
    /// The access/2 form has the syntax: `(access object field)`
    /// and is transformed into a field access expression that retrieves
    /// the specified field from the object.
    ///
    /// This is equivalent to the dot notation `object.field` in many languages.
    fn lower_access(&mut self, call: CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        if call.arguments.len() != 2 {
            self.diagnostics.push(invalid_argument_length(
                call.span,
                SpecialFormKind::Access,
                &call.arguments,
                &[2],
            ));

            return None;
        }

        let [body, field] = call.arguments.try_into().unwrap_or_else(|_| unreachable!());

        let field = self.lower_argument_to_field(BindingMode::Access, field)?;

        Some(ExprKind::Field(FieldExpr {
            id: call.id,
            span: call.span,
            value: body.value,
            field,
        }))
    }

    /// Lowers an index/2 special form to an `IndexExpr`.
    ///
    /// The index/2 form has the syntax: `(index collection index)`
    /// and is transformed into an index access expression that retrieves
    /// the element at the specified index from the collection.
    ///
    /// This is equivalent to the bracket notation `collection[index]` in many languages.
    fn lower_index(&mut self, call: CallExpr<'heap>) -> Option<ExprKind<'heap>> {
        if call.arguments.len() != 2 {
            self.diagnostics.push(invalid_argument_length(
                call.span,
                SpecialFormKind::Index,
                &call.arguments,
                &[2],
            ));
            return None;
        }

        let [body, index] = call.arguments.try_into().unwrap_or_else(|_| unreachable!());

        Some(ExprKind::Index(IndexExpr {
            id: call.id,
            span: call.span,
            value: body.value,
            index: index.value,
        }))
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
            SpecialFormKind::As => self.lower_as(call),
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

use core::fmt::Display;
use std::io;

use super::{
    Type, TypeId,
    environment::Environment,
    kind::{
        Apply, ClosureType, Generic, GenericArgument, Infer, IntersectionType, IntrinsicType,
        OpaqueType, Param, PrimitiveType, StructType, TupleType, TypeKind, UnionType,
        generic::{GenericArgumentId, GenericArgumentReference, GenericSubstitution},
        infer::HoleId,
        intrinsic::DictType,
        r#struct::StructField,
    },
};
use crate::{
    collections::FastHashSet,
    intern::Interned,
    pretty::{Doc, Formatter, RenderOptions},
    symbol::sym,
    r#type::kind::intrinsic::ListType,
};

/// Formatting configuration for type pretty-printing.
///
/// Controls how types are rendered, including handling of substitutions,
/// opaque types, and recursive type references.
#[must_use = "pretty options don't do anything unless explicitly applied"]
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct TypeFormatterOptions {
    /// Whether to resolve and display type substitutions inline.
    ///
    /// When `true`, substituted generic arguments and inferred types are shown
    /// as `T«Integer»` where `T` was substituted with `Integer`.
    /// When `false` (default), they render as just their name (e.g., `T`).
    pub resolve_substitutions: bool,

    /// Whether to expand and show the internal representation of opaque types.
    ///
    /// When `true` (default), opaque types show their underlying type (e.g., `UserId(uuid:
    /// String)`).
    /// When `false`, they render as just their name (e.g., `UserId`).
    pub expand_opaque_types: bool,

    /// Whether to display opaque types with fully qualified names.
    ///
    /// When `true` (default), opaque types show their fully qualified path (e.g.,
    /// `::graph::user::UserId`).
    /// When `false`, they render with just their name (e.g., `UserId`).
    pub qualified_opaque_names: bool,

    /// Strategy for detecting and preventing infinite recursion.
    ///
    /// See [`RecursionGuardStrategy`] for available options.
    pub recursion_strategy: RecursionGuardStrategy,
}

impl Default for TypeFormatterOptions {
    fn default() -> Self {
        Self {
            resolve_substitutions: false,
            expand_opaque_types: true,
            qualified_opaque_names: true,
            recursion_strategy: RecursionGuardStrategy::default(),
        }
    }
}

impl TypeFormatterOptions {
    /// Creates a terse formatter configuration for compact type display.
    ///
    /// This preset is useful for user-facing output where brevity is preferred.
    /// Opaque types show minimal information (just unqualified names, no internals),
    /// and substitutions are not resolved.
    pub const fn terse() -> Self {
        Self {
            resolve_substitutions: false,
            expand_opaque_types: false,
            qualified_opaque_names: false,
            recursion_strategy: RecursionGuardStrategy::IdentityTracking,
        }
    }

    /// Sets whether to resolve and display type substitutions.
    ///
    /// When enabled, generic arguments and inference variables show their
    /// resolved values inline using guillemet notation (« »).
    pub const fn with_resolve_substitutions(mut self, resolve_substitutions: bool) -> Self {
        self.resolve_substitutions = resolve_substitutions;
        self
    }

    /// Sets whether to expand and show the internal representation of opaque types.
    ///
    /// When enabled, opaque types display their underlying structural type
    /// (e.g., `UserId(uuid: String)`). When disabled, only the name is shown.
    pub const fn with_expand_opaque_types(mut self, expand: bool) -> Self {
        self.expand_opaque_types = expand;
        self
    }

    /// Sets whether to display opaque types with fully qualified names.
    ///
    /// When enabled, opaque types show their full path (e.g., `::graph::user::UserId`).
    /// When disabled, only the name is shown (e.g., `UserId`).
    pub const fn with_qualified_opaque_names(mut self, qualified: bool) -> Self {
        self.qualified_opaque_names = qualified;
        self
    }

    /// Configures depth-based recursion tracking.
    ///
    /// Uses a simple counter to limit nesting depth. When `max_depth` is `None`,
    /// defaults to 32 levels. This is less precise than identity tracking but
    /// has lower overhead.
    pub fn with_depth_tracking(mut self, max_depth: Option<usize>) -> Self {
        self.recursion_strategy = RecursionGuardStrategy::DepthCounting {
            max_depth: max_depth.unwrap_or(32),
        };
        self
    }

    /// Configures identity-based recursion tracking.
    ///
    /// Tracks exact type identities to detect actual cycles. This is the default
    /// and provides precise cycle detection at the cost of maintaining a set
    /// of visited types.
    pub const fn with_identity_tracking(mut self) -> Self {
        self.recursion_strategy = RecursionGuardStrategy::IdentityTracking;
        self
    }
}

/// Strategy for detecting recursive structures during pretty-printing.
///
/// Determines how the type formatter identifies already-visited values to
/// prevent infinite recursion when formatting cyclic type references.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Default)]
pub enum RecursionGuardStrategy {
    /// Simple depth counter without identity tracking.
    ///
    /// Limits recursion based solely on nesting depth without tracking specific
    /// object identities. Suitable for simpler cases where exact cycle detection
    /// isn't required or desired.
    DepthCounting { max_depth: usize },

    /// Tracks object identity to detect actual cycles.
    ///
    /// Records each visited object's address to precisely identify cycles in
    /// recursive structures. This is the default strategy.
    #[default]
    IdentityTracking,
}

#[derive(Debug)]
enum RecursionGuard<'heap> {
    Depth(usize, usize),
    Reference(FastHashSet<Interned<'heap, TypeKind<'heap>>>),
}

impl<'heap> RecursionGuard<'heap> {
    fn enter(&mut self, kind: Interned<'heap, TypeKind<'heap>>) -> bool {
        match self {
            Self::Depth(depth, max_depth) => {
                if *depth >= *max_depth {
                    false
                } else {
                    *depth += 1;
                    true
                }
            }
            Self::Reference(set) => set.insert(kind),
        }
    }

    fn exit(&mut self, kind: Interned<'heap, TypeKind<'heap>>) {
        match self {
            Self::Depth(depth, _) => *depth -= 1,
            Self::Reference(set) => {
                set.remove(&kind);
            }
        }
    }
}

impl From<RecursionGuardStrategy> for RecursionGuard<'_> {
    fn from(tracking: RecursionGuardStrategy) -> Self {
        match tracking {
            RecursionGuardStrategy::DepthCounting { max_depth } => Self::Depth(0, max_depth),
            RecursionGuardStrategy::IdentityTracking => Self::Reference(FastHashSet::default()),
        }
    }
}

pub(crate) trait FormatType<'fmt, T> {
    fn format_type(&mut self, value: T) -> Doc<'fmt>;
}

/// Pretty-printer for type expressions.
///
/// Converts type system representations into human-readable formatted output
/// with proper handling of recursion, generic arguments, and type substitutions.
pub struct TypeFormatter<'fmt, 'env, 'heap> {
    fmt: &'fmt Formatter<'fmt, 'heap>,
    env: &'env Environment<'heap>,
    guard: RecursionGuard<'heap>,
    generics: Vec<GenericArgumentReference<'heap>>,
    options: TypeFormatterOptions,

    parent_is_lattice: bool,
}

impl<'fmt, 'env, 'heap> TypeFormatter<'fmt, 'env, 'heap> {
    /// Creates a new type formatter with specified options.
    ///
    /// Requires a document [`Formatter`] for building output and an [`Environment`]
    /// for resolving type references and substitutions.
    pub fn new(
        fmt: &'fmt Formatter<'fmt, 'heap>,
        env: &'env Environment<'heap>,
        options: TypeFormatterOptions,
    ) -> Self {
        Self {
            fmt,
            env,
            guard: RecursionGuard::from(options.recursion_strategy),
            generics: Vec::new(),
            options,
            parent_is_lattice: false,
        }
    }

    /// Creates a type formatter with default options.
    ///
    /// Uses identity-based recursion tracking and does not resolve substitutions
    /// or elide opaque types.
    pub fn with_defaults(fmt: &'fmt Formatter<'fmt, 'heap>, env: &'env Environment<'heap>) -> Self {
        Self::new(fmt, env, TypeFormatterOptions::default())
    }

    /// Formats a type identifier into a document.
    ///
    /// This is the primary entry point for formatting types. Returns a [`Doc`]
    /// that can be rendered to various output formats.
    pub fn format(&mut self, value: TypeId) -> Doc<'fmt> {
        self.format_type(value)
    }

    /// Formats a generic argument into a document.
    ///
    /// Generic arguments may include constraints which are displayed as
    /// `T: Constraint` when present.
    pub fn format_generic_argument(&mut self, value: GenericArgument<'heap>) -> Doc<'fmt> {
        self.format_type(value)
    }

    pub(crate) fn render_type<T>(
        &mut self,
        value: T,
        options: RenderOptions,
    ) -> impl Display + use<'fmt, T>
    where
        Self: FormatType<'fmt, T>,
    {
        crate::pretty::render(self.format_type(value), options)
    }

    /// Renders a type to a displayable string.
    ///
    /// Returns an object implementing [`Display`] which can be printed or
    /// formatted. The rendering applies the specified options for width,
    /// colors, etc.
    pub fn render(&mut self, value: TypeId, options: RenderOptions) -> impl Display + use<'fmt> {
        self.render_type(value, options)
    }

    /// Renders a type directly to a writer.
    ///
    /// # Errors
    ///
    /// Returns [`io::Error`] if writing to the output stream fails.
    pub fn render_into(
        &mut self,
        value: TypeId,
        options: RenderOptions,
        write: &mut impl io::Write,
    ) -> Result<(), io::Error> {
        crate::pretty::render_into(&self.format_type(value), options, write)
    }
}

impl AsMut<Self> for TypeFormatter<'_, '_, '_> {
    fn as_mut(&mut self) -> &mut Self {
        self
    }
}

impl<'fmt, 'heap> FormatType<'fmt, TypeKind<'heap>> for TypeFormatter<'fmt, '_, 'heap> {
    fn format_type(&mut self, value: TypeKind<'heap>) -> Doc<'fmt> {
        let prev_parent_is_lattice = self.parent_is_lattice;
        self.parent_is_lattice = matches!(value, TypeKind::Intersection(_) | TypeKind::Union(_));

        let mut doc = match value {
            TypeKind::Opaque(opaque_type) => self.format_type(opaque_type),
            TypeKind::Primitive(primitive_type) => self.format_type(primitive_type),
            TypeKind::Intrinsic(intrinsic_type) => self.format_type(intrinsic_type),
            TypeKind::Struct(struct_type) => self.format_type(struct_type),
            TypeKind::Tuple(tuple_type) => self.format_type(tuple_type),
            TypeKind::Union(union_type) => self.format_type(union_type),
            TypeKind::Intersection(intersection_type) => self.format_type(intersection_type),
            TypeKind::Closure(closure_type) => self.format_type(closure_type),
            TypeKind::Apply(apply) => self.format_type(apply),
            TypeKind::Generic(generic) => self.format_type(generic),
            TypeKind::Param(param) => self.format_type(param),
            TypeKind::Infer(infer) => self.format_type(infer),
            TypeKind::Never => self.fmt.type_name(sym::symbol::exclamation_mark),
            TypeKind::Unknown => self.fmt.type_name(sym::symbol::question_mark),
        };

        if self.parent_is_lattice && prev_parent_is_lattice {
            doc = doc.parens();
        }
        self.parent_is_lattice = prev_parent_is_lattice;

        doc
    }
}

impl<'fmt, 'heap> FormatType<'fmt, Interned<'heap, TypeKind<'heap>>>
    for TypeFormatter<'fmt, '_, 'heap>
{
    fn format_type(&mut self, value: Interned<'heap, TypeKind<'heap>>) -> Doc<'fmt> {
        if !self.guard.enter(value) {
            return self.fmt.comment_str("...");
        }

        let doc = self.format_type(*value);

        self.guard.exit(value);
        doc
    }
}

impl<'fmt, 'heap> FormatType<'fmt, Type<'heap>> for TypeFormatter<'fmt, '_, 'heap> {
    fn format_type(&mut self, value: Type<'heap>) -> Doc<'fmt> {
        // The value is actually interned
        self.format_type(Interned::new_unchecked(value.kind))
    }
}

impl<'fmt> FormatType<'fmt, TypeId> for TypeFormatter<'fmt, '_, '_> {
    fn format_type(&mut self, value: TypeId) -> Doc<'fmt> {
        self.format_type(self.env.r#type(value))
    }
}

fn format_opaque<'fmt, 'heap>(
    formatter: &mut TypeFormatter<'fmt, '_, 'heap>,
    OpaqueType { name, repr }: OpaqueType<'heap>,
    generics: Option<Doc<'fmt>>,
) -> Doc<'fmt> {
    let type_name = if formatter.options.qualified_opaque_names {
        formatter.fmt.type_name(name)
    } else {
        let name = name.unwrap();

        let (_, name) = name.rsplit_once("::").unwrap_or(("", name));
        formatter.fmt.type_name_str(name)
    };

    let mut doc = type_name;

    if let Some(generics) = generics {
        doc = doc.append(generics);
    }

    if formatter.options.expand_opaque_types {
        let repr_ty = formatter.env.r#type(repr);
        let mut inner = formatter.format_type(repr);

        if !matches!(repr_ty.kind, TypeKind::Struct(_) | TypeKind::Tuple(_)) {
            inner = formatter.fmt.parens(inner);
        }

        doc = doc.append(inner);
    }

    doc
}

impl<'fmt, 'heap> FormatType<'fmt, OpaqueType<'heap>> for TypeFormatter<'fmt, '_, 'heap> {
    fn format_type(&mut self, value: OpaqueType<'heap>) -> Doc<'fmt> {
        format_opaque(self, value, None)
    }
}

impl<'fmt> FormatType<'fmt, PrimitiveType> for TypeFormatter<'fmt, '_, '_> {
    fn format_type(&mut self, value: PrimitiveType) -> Doc<'fmt> {
        match value {
            PrimitiveType::Number => self.fmt.type_name(sym::lexical::Number),
            PrimitiveType::Integer => self.fmt.type_name(sym::lexical::Integer),
            PrimitiveType::String => self.fmt.type_name(sym::lexical::String),
            PrimitiveType::Null => self.fmt.type_name(sym::lexical::Null),
            PrimitiveType::Boolean => self.fmt.type_name(sym::lexical::Boolean),
        }
    }
}

impl<'fmt> FormatType<'fmt, ListType> for TypeFormatter<'fmt, '_, '_> {
    fn format_type(&mut self, ListType { element }: ListType) -> Doc<'fmt> {
        self.fmt
            .type_name(sym::lexical::List)
            .append(self.fmt.angles(self.format_type(element)))
    }
}

impl<'fmt> FormatType<'fmt, DictType> for TypeFormatter<'fmt, '_, '_> {
    fn format_type(&mut self, DictType { key, value }: DictType) -> Doc<'fmt> {
        self.fmt.type_name(sym::lexical::Dict).append(
            self.fmt.angles(
                self.fmt
                    .comma_sep([self.format_type(key), self.format_type(value)]),
            ),
        )
    }
}

impl<'fmt> FormatType<'fmt, IntrinsicType> for TypeFormatter<'fmt, '_, '_> {
    fn format_type(&mut self, value: IntrinsicType) -> Doc<'fmt> {
        match value {
            IntrinsicType::List(list) => self.format_type(list),
            IntrinsicType::Dict(dict) => self.format_type(dict),
        }
    }
}

impl<'fmt, 'heap> FormatType<'fmt, StructType<'heap>> for TypeFormatter<'fmt, '_, 'heap> {
    fn format_type(&mut self, StructType { fields }: StructType<'heap>) -> Doc<'fmt> {
        self.fmt.r#struct(
            fields.iter().map(|&StructField { name, value }| {
                (self.fmt.field(name), self.format_type(value))
            }),
        )
    }
}

impl<'fmt, 'heap> FormatType<'fmt, TupleType<'heap>> for TypeFormatter<'fmt, '_, 'heap> {
    fn format_type(&mut self, TupleType { fields }: TupleType<'heap>) -> Doc<'fmt> {
        self.fmt
            .tuple(fields.into_iter().map(|&element| self.format_type(element)))
    }
}

impl<'fmt, 'heap> FormatType<'fmt, UnionType<'heap>> for TypeFormatter<'fmt, '_, 'heap> {
    fn format_type(&mut self, UnionType { variants }: UnionType<'heap>) -> Doc<'fmt> {
        self.fmt
            .union(
                variants
                    .into_iter()
                    .map(|&element| self.format_type(element)),
            )
            .group()
    }
}

impl<'fmt, 'heap> FormatType<'fmt, IntersectionType<'heap>> for TypeFormatter<'fmt, '_, 'heap> {
    fn format_type(&mut self, IntersectionType { variants }: IntersectionType<'heap>) -> Doc<'fmt> {
        self.fmt
            .intersection(
                variants
                    .into_iter()
                    .map(|&element| self.format_type(element)),
            )
            .group()
    }
}

impl<'fmt, 'heap> FormatType<'fmt, ClosureType<'heap>> for TypeFormatter<'fmt, '_, 'heap> {
    fn format_type(&mut self, ClosureType { params, returns }: ClosureType<'heap>) -> Doc<'fmt> {
        let returns_type = self.env.r#type(returns);
        let returns_doc = self.format_type(returns);

        // Wrap union/intersection return types in parentheses for clarity
        // Group them so they stay compact
        let returns_doc = match returns_type.kind {
            TypeKind::Union(_) | TypeKind::Intersection(_) => self.fmt.parens(returns_doc.group()),
            TypeKind::Opaque(_)
            | TypeKind::Primitive(_)
            | TypeKind::Intrinsic(_)
            | TypeKind::Struct(_)
            | TypeKind::Tuple(_)
            | TypeKind::Closure(_)
            | TypeKind::Apply(_)
            | TypeKind::Generic(_)
            | TypeKind::Param(_)
            | TypeKind::Infer(_)
            | TypeKind::Never
            | TypeKind::Unknown => returns_doc,
        };

        self.fmt.closure_type(
            params.into_iter().map(|&element| self.format_type(element)),
            returns_doc,
        )
    }
}

impl<'fmt> FormatType<'fmt, GenericArgumentId> for TypeFormatter<'fmt, '_, '_> {
    fn format_type(&mut self, value: GenericArgumentId) -> Doc<'fmt> {
        let reference = self.generics.iter().find(|reference| reference.id == value);

        if let Some(reference) = reference {
            self.fmt
                .type_name_str(format!("{}?{value}", reference.name))
        } else {
            self.fmt.type_name_str(format!("?{value}"))
        }
    }
}

impl<'fmt, 'heap> FormatType<'fmt, Apply<'heap>> for TypeFormatter<'fmt, '_, 'heap> {
    fn format_type(
        &mut self,
        Apply {
            base,
            substitutions,
        }: Apply<'heap>,
    ) -> Doc<'fmt> {
        if substitutions.is_empty() {
            return self.format_type(base);
        }

        let fmt = self.fmt;
        let base = self.format_type(base);
        let substitutions = substitutions
            .iter()
            .map(|&GenericSubstitution { argument, value }| {
                fmt.key_value(self.format_type(argument), "=", self.format_type(value))
            });

        fmt.generic_apply(substitutions, base)
    }
}

impl<'fmt, 'heap> FormatType<'fmt, GenericArgument<'heap>> for TypeFormatter<'fmt, '_, 'heap> {
    fn format_type(
        &mut self,
        GenericArgument {
            id,
            name: _,
            constraint,
        }: GenericArgument<'heap>,
    ) -> Doc<'fmt> {
        if let Some(constraint) = constraint {
            self.fmt
                .field_type(self.format_type(id), self.format_type(constraint))
        } else {
            self.format_type(id)
        }
    }
}

impl<'fmt, 'heap> FormatType<'fmt, Generic<'heap>> for TypeFormatter<'fmt, '_, 'heap> {
    fn format_type(&mut self, Generic { base, arguments }: Generic<'heap>) -> Doc<'fmt> {
        for argument in arguments.iter() {
            self.generics.push(argument.as_reference());
        }

        let fmt = self.fmt;
        let generics =
            fmt.generic_args(arguments.iter().map(|&argument| self.format_type(argument)));

        // specialize on opaques, these are then `A<T, U, V>(..)`
        let doc = if let TypeKind::Opaque(opaque) = *self.env.r#type(base).kind {
            format_opaque(self, opaque, Some(generics))
        } else {
            generics.append(self.format_type(base))
        };

        self.generics
            .truncate(self.generics.len() - arguments.len());
        doc
    }
}

impl<'fmt> FormatType<'fmt, Param> for TypeFormatter<'fmt, '_, '_> {
    fn format_type(&mut self, Param { argument }: Param) -> Doc<'fmt> {
        let mut doc = self.format_type(argument);

        if self.options.resolve_substitutions
            && let Some(substitution) = self.env.substitution.argument(argument)
        {
            doc = doc.append(
                self.fmt
                    .enclosed("\u{ab}", self.format_type(substitution), "\u{bb}"),
            );
        }

        doc
    }
}

impl<'fmt> FormatType<'fmt, HoleId> for TypeFormatter<'fmt, '_, '_> {
    fn format_type(&mut self, value: HoleId) -> Doc<'fmt> {
        self.fmt.type_name_str(format!("_{value}"))
    }
}

impl<'fmt> FormatType<'fmt, Infer> for TypeFormatter<'fmt, '_, '_> {
    fn format_type(&mut self, Infer { hole }: Infer) -> Doc<'fmt> {
        let mut doc = self.format_type(hole);

        if self.options.resolve_substitutions
            && let Some(substitution) = self.env.substitution.infer(hole)
        {
            doc = doc.append(
                self.fmt
                    .enclosed("\u{ab}", self.format_type(substitution), "\u{bb}"),
            );
        }

        doc
    }
}

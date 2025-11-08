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

/// Formatting configuration for pretty-printing.
///
/// Controls layout, wrapping, and recursion handling for document rendering.
#[must_use = "pretty options don't do anything unless explicitly applied"]
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct TypeFormatterOptions {
    /// Spaces per indentation level.
    pub indent: u8,

    /// Whether to resolve substitutions in the document.
    pub resolve_substitutions: bool,

    /// Method used to detect cycles in recursive structures.
    pub recursion_strategy: RecursionGuardStrategy,
}

impl TypeFormatterOptions {
    pub fn with_indent(mut self, indent: u8) -> Self {
        self.indent = indent;
        self
    }

    pub fn with_resolve_substitutions(mut self, resolve_substitutions: bool) -> Self {
        self.resolve_substitutions = resolve_substitutions;
        self
    }

    pub fn with_depth_tracking(mut self, max_depth: Option<usize>) -> Self {
        self.recursion_strategy = RecursionGuardStrategy::DepthCounting {
            max_depth: max_depth.unwrap_or(32),
        };
        self
    }

    pub fn with_identity_tracking(mut self) -> Self {
        self.recursion_strategy = RecursionGuardStrategy::IdentityTracking;
        self
    }
}

impl Default for TypeFormatterOptions {
    fn default() -> Self {
        Self {
            indent: 4,
            resolve_substitutions: false,
            recursion_strategy: RecursionGuardStrategy::default(),
        }
    }
}

/// Strategy for detecting recursive structures during pretty-printing.
///
/// Determines how [`PrettyPrintBoundary`] identifies already-visited values.
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

    fn depth(&self) -> usize {
        match self {
            Self::Depth(depth, _) => *depth,
            Self::Reference(set) => set.len(),
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

pub struct TypeFormatter<'fmt, 'env, 'heap> {
    fmt: &'fmt Formatter<'fmt>,
    env: &'env Environment<'heap>,
    guard: RecursionGuard<'heap>,
    generics: Vec<GenericArgumentReference<'heap>>,
    options: TypeFormatterOptions,
}

impl<'fmt, 'env, 'heap> TypeFormatter<'fmt, 'env, 'heap> {
    pub fn new(
        fmt: &'fmt Formatter<'fmt>,
        env: &'env Environment<'heap>,
        options: TypeFormatterOptions,
    ) -> Self {
        Self {
            fmt,
            env,
            guard: RecursionGuard::from(options.recursion_strategy),
            generics: Vec::new(),
            options,
        }
    }

    pub fn with_defaults(fmt: &'fmt Formatter<'fmt>, env: &'env Environment<'heap>) -> Self {
        Self::new(fmt, env, TypeFormatterOptions::default())
    }

    pub fn format<T>(&mut self, value: T) -> Doc<'fmt>
    where
        Self: FormatType<'fmt, T>,
    {
        self.format_type(value)
    }

    pub fn render<T>(&mut self, value: T, options: RenderOptions) -> impl Display + use<'fmt, T>
    where
        Self: FormatType<'fmt, T>,
    {
        crate::pretty::render(self.format_type(value), options)
    }

    pub fn render_into<T>(
        &mut self,
        value: T,
        options: RenderOptions,
        write: &mut impl io::Write,
    ) -> Result<(), io::Error>
    where
        Self: FormatType<'fmt, T>,
    {
        crate::pretty::render_into(&self.format_type(value), options, write)
    }
}

impl<'fmt, 'env, 'heap: 'fmt> FormatType<'fmt, TypeKind<'heap>>
    for TypeFormatter<'fmt, 'env, 'heap>
{
    fn format_type(&mut self, value: TypeKind<'heap>) -> Doc<'fmt> {
        match value {
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
        }
    }
}

impl<'fmt, 'env, 'heap: 'fmt> FormatType<'fmt, Interned<'heap, TypeKind<'heap>>>
    for TypeFormatter<'fmt, 'env, 'heap>
{
    fn format_type(&mut self, value: Interned<'heap, TypeKind<'heap>>) -> Doc<'fmt> {
        if !self.guard.enter(value) {
            return self.fmt.text_str("...");
        }

        let doc = self.format_type(*value);

        self.guard.exit(value);
        doc
    }
}

impl<'fmt, 'env, 'heap: 'fmt> FormatType<'fmt, Type<'heap>> for TypeFormatter<'fmt, 'env, 'heap> {
    fn format_type(&mut self, value: Type<'heap>) -> Doc<'fmt> {
        // The value is actually interned
        self.format_type(Interned::new_unchecked(value.kind))
    }
}

impl<'fmt, 'env, 'heap: 'fmt> FormatType<'fmt, TypeId> for TypeFormatter<'fmt, 'env, 'heap> {
    fn format_type(&mut self, value: TypeId) -> Doc<'fmt> {
        self.format_type(self.env.r#type(value))
    }
}

impl<'fmt, 'env, 'heap: 'fmt> FormatType<'fmt, OpaqueType<'heap>>
    for TypeFormatter<'fmt, 'env, 'heap>
{
    fn format_type(&mut self, OpaqueType { name, repr }: OpaqueType<'heap>) -> Doc<'fmt> {
        self.fmt
            .type_name(name)
            .append(self.fmt.parens(self.format_type(repr)))
    }
}

impl<'fmt, 'env, 'heap> FormatType<'fmt, PrimitiveType> for TypeFormatter<'fmt, 'env, 'heap> {
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

impl<'fmt, 'env, 'heap: 'fmt> FormatType<'fmt, IntrinsicType> for TypeFormatter<'fmt, 'env, 'heap> {
    fn format_type(&mut self, value: IntrinsicType) -> Doc<'fmt> {
        match value {
            IntrinsicType::List(ListType { element }) => self
                .fmt
                .type_name(sym::lexical::List)
                .append(self.fmt.angles(self.format_type(element))),
            IntrinsicType::Dict(DictType { key, value }) => {
                self.fmt.type_name(sym::lexical::Dict).append(
                    self.fmt.angles(
                        self.fmt
                            .comma_sep([self.format_type(key), self.format_type(value)]),
                    ),
                )
            }
        }
    }
}

impl<'fmt, 'env, 'heap: 'fmt> FormatType<'fmt, StructType<'heap>>
    for TypeFormatter<'fmt, 'env, 'heap>
{
    fn format_type(&mut self, StructType { fields }: StructType<'heap>) -> Doc<'fmt> {
        self.fmt.r#struct(
            fields.into_iter().map(|&StructField { name, value }| {
                (self.fmt.field(name), self.format_type(value))
            }),
        )
    }
}

impl<'fmt, 'env, 'heap: 'fmt> FormatType<'fmt, TupleType<'heap>>
    for TypeFormatter<'fmt, 'env, 'heap>
{
    fn format_type(&mut self, TupleType { fields }: TupleType<'heap>) -> Doc<'fmt> {
        self.fmt
            .tuple(fields.into_iter().map(|&element| self.format_type(element)))
    }
}

impl<'fmt, 'env, 'heap: 'fmt> FormatType<'fmt, UnionType<'heap>>
    for TypeFormatter<'fmt, 'env, 'heap>
{
    fn format_type(&mut self, UnionType { variants }: UnionType<'heap>) -> Doc<'fmt> {
        self.fmt.union(
            variants
                .into_iter()
                .map(|&element| self.format_type(element)),
        )
    }
}

impl<'fmt, 'env, 'heap: 'fmt> FormatType<'fmt, IntersectionType<'heap>>
    for TypeFormatter<'fmt, 'env, 'heap>
{
    fn format_type(&mut self, IntersectionType { variants }: IntersectionType<'heap>) -> Doc<'fmt> {
        self.fmt.intersection(
            variants
                .into_iter()
                .map(|&element| self.format_type(element)),
        )
    }
}

impl<'fmt, 'env, 'heap: 'fmt> FormatType<'fmt, ClosureType<'heap>>
    for TypeFormatter<'fmt, 'env, 'heap>
{
    fn format_type(&mut self, ClosureType { params, returns }: ClosureType<'heap>) -> Doc<'fmt> {
        let returns = self.format_type(returns);

        self.fmt.closure_type(
            params.into_iter().map(|&element| self.format_type(element)),
            returns,
        )
    }
}

impl<'fmt, 'env, 'heap: 'fmt> FormatType<'fmt, GenericArgumentId>
    for TypeFormatter<'fmt, 'env, 'heap>
{
    fn format_type(&mut self, value: GenericArgumentId) -> Doc<'fmt> {
        let reference = self.generics.iter().find(|reference| reference.id == value);

        if let Some(reference) = reference {
            self.fmt.type_name(reference.name)
        } else {
            self.fmt.type_name_owned(format!("?{value}"))
        }
    }
}

impl<'fmt, 'env, 'heap: 'fmt> FormatType<'fmt, Apply<'heap>> for TypeFormatter<'fmt, 'env, 'heap> {
    fn format_type(
        &mut self,
        Apply {
            base,
            substitutions,
        }: Apply<'heap>,
    ) -> Doc<'fmt> {
        let base = self.format_type(base);

        self.fmt
            .generic_args(substitutions.into_iter().map(
                |&GenericSubstitution { argument, value }| {
                    self.fmt
                        .key_value(self.format_type(argument), "=", self.format_type(value))
                },
            ))
            .append(base)
    }
}

impl<'fmt, 'env, 'heap: 'fmt> FormatType<'fmt, GenericArgument<'heap>>
    for TypeFormatter<'fmt, 'env, 'heap>
{
    fn format_type(
        &mut self,
        GenericArgument {
            id,
            name,
            constraint,
        }: GenericArgument<'heap>,
    ) -> Doc<'fmt> {
        if let Some(constraint) = constraint {
            self.fmt
                .key_value(self.format_type(id), ":", self.format_type(constraint))
        } else {
            self.fmt.type_name(name)
        }
    }
}

impl<'fmt, 'env, 'heap: 'fmt> FormatType<'fmt, Generic<'heap>>
    for TypeFormatter<'fmt, 'env, 'heap>
{
    fn format_type(&mut self, Generic { base, arguments }: Generic<'heap>) -> Doc<'fmt> {
        for argument in arguments.into_iter() {
            self.generics.push(argument.as_reference());
        }

        // specialize on opaques, these are then `A<T, U, V>(..)`
        let (prefix, postfix) =
            if let TypeKind::Opaque(OpaqueType { name, repr }) = *self.env.r#type(base).kind {
                (self.fmt.type_name(name), repr)
            } else {
                (self.fmt.nil(), base)
            };

        let doc = prefix
            .append(
                self.fmt.generic_args(
                    arguments
                        .into_iter()
                        .map(|&argument| self.format_type(argument)),
                ),
            )
            .append(self.format_type(postfix));

        self.generics
            .truncate(self.generics.len() - arguments.len());
        doc
    }
}

impl<'fmt, 'env, 'heap: 'fmt> FormatType<'fmt, Param> for TypeFormatter<'fmt, 'env, 'heap> {
    fn format_type(&mut self, Param { argument }: Param) -> Doc<'fmt> {
        let mut doc = self.format_type(argument);

        if self.options.resolve_substitutions
            && let Some(substitution) = self.env.substitution.argument(argument)
        {
            doc = doc.append(self.fmt.braces(self.format_type(substitution)));
        }

        doc
    }
}

impl<'fmt, 'env, 'heap> FormatType<'fmt, HoleId> for TypeFormatter<'fmt, 'env, 'heap> {
    fn format_type(&mut self, value: HoleId) -> Doc<'fmt> {
        self.fmt.type_name_owned(format!("_{value}"))
    }
}

impl<'fmt, 'env, 'heap: 'fmt> FormatType<'fmt, Infer> for TypeFormatter<'fmt, 'env, 'heap> {
    fn format_type(&mut self, Infer { hole }: Infer) -> Doc<'fmt> {
        let mut doc = self.format_type(hole);

        if self.options.resolve_substitutions
            && let Some(substitution) = self.env.substitution.infer(hole)
        {
            doc = doc.append(self.fmt.braces(self.format_type(substitution)));
        }

        doc
    }
}

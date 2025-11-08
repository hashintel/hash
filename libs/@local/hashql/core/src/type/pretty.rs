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

pub(crate) trait FormatType<'env, T> {
    fn format_type(&mut self, value: T) -> Doc<'env>;
}

pub struct TypeFormatter<'env, 'heap> {
    fmt: &'env Formatter<'heap>,
    env: &'env Environment<'heap>,
    guard: RecursionGuard<'heap>,
    generics: Vec<GenericArgumentReference<'heap>>,
    options: TypeFormatterOptions,
}

impl<'env: 'heap, 'heap> TypeFormatter<'env, 'heap> {
    pub fn new(
        formatter: &'env Formatter<'heap>,
        env: &'env Environment<'heap>,
        options: TypeFormatterOptions,
    ) -> Self {
        Self {
            fmt: formatter,
            env,
            guard: RecursionGuard::from(options.recursion_strategy),
            generics: Vec::new(),
            options,
        }
    }

    pub fn with_defaults(formatter: &'env Formatter<'heap>, env: &'env Environment<'heap>) -> Self {
        Self::new(formatter, env, TypeFormatterOptions::default())
    }

    pub fn format<T>(&mut self, value: T) -> Doc<'env>
    where
        Self: FormatType<'env, T>,
    {
        self.format_type(value)
    }

    pub fn render<T>(&mut self, value: T, options: RenderOptions) -> String
    where
        Self: FormatType<'env, T>,
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
        Self: FormatType<'env, T>,
    {
        crate::pretty::render_into(self.format_type(value), options, write)
    }
}

impl<'env: 'heap, 'heap> FormatType<'env, Interned<'heap, TypeKind<'heap>>>
    for TypeFormatter<'env, 'heap>
{
    fn format_type(&mut self, value: Interned<'heap, TypeKind<'heap>>) -> Doc<'env> {
        if !self.guard.enter(value) {
            return self.fmt.text_str("...");
        }

        let doc = match *value {
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

        self.guard.exit(value);
        doc
    }
}

impl<'env: 'heap, 'heap> FormatType<'env, Type<'heap>> for TypeFormatter<'env, 'heap> {
    fn format_type(&mut self, value: Type<'heap>) -> Doc<'env> {
        // The value is actually interned
        self.format_type(Interned::new_unchecked(value.kind))
    }
}

impl<'env: 'heap, 'heap> FormatType<'env, TypeId> for TypeFormatter<'env, 'heap> {
    fn format_type(&mut self, value: TypeId) -> Doc<'env> {
        self.format_type(self.env.r#type(value))
    }
}

impl<'env: 'heap, 'heap> FormatType<'env, OpaqueType<'heap>> for TypeFormatter<'env, 'heap> {
    fn format_type(&mut self, OpaqueType { name, repr }: OpaqueType<'heap>) -> Doc<'env> {
        self.fmt
            .type_name(name)
            .append(self.fmt.parens(self.format_type(repr)))
    }
}

impl<'env: 'heap, 'heap> FormatType<'env, PrimitiveType> for TypeFormatter<'env, 'heap> {
    fn format_type(&mut self, value: PrimitiveType) -> Doc<'env> {
        match value {
            PrimitiveType::Number => self.fmt.type_name(sym::lexical::Number),
            PrimitiveType::Integer => self.fmt.type_name(sym::lexical::Integer),
            PrimitiveType::String => self.fmt.type_name(sym::lexical::String),
            PrimitiveType::Null => self.fmt.type_name(sym::lexical::Null),
            PrimitiveType::Boolean => self.fmt.type_name(sym::lexical::Boolean),
        }
    }
}

impl<'env: 'heap, 'heap> FormatType<'env, IntrinsicType> for TypeFormatter<'env, 'heap> {
    fn format_type(&mut self, value: IntrinsicType) -> Doc<'env> {
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

impl<'env: 'heap, 'heap> FormatType<'env, StructType<'heap>> for TypeFormatter<'env, 'heap> {
    fn format_type(&mut self, StructType { fields }: StructType<'heap>) -> Doc<'env> {
        self.fmt.r#struct(
            fields.into_iter().map(|&StructField { name, value }| {
                (self.fmt.field(name), self.format_type(value))
            }),
        )
    }
}

impl<'env: 'heap, 'heap> FormatType<'env, TupleType<'heap>> for TypeFormatter<'env, 'heap> {
    fn format_type(&mut self, TupleType { fields }: TupleType<'heap>) -> Doc<'env> {
        self.fmt
            .tuple(fields.into_iter().map(|&element| self.format_type(element)))
    }
}

impl<'env: 'heap, 'heap> FormatType<'env, UnionType<'heap>> for TypeFormatter<'env, 'heap> {
    fn format_type(&mut self, UnionType { variants }: UnionType<'heap>) -> Doc<'env> {
        self.fmt.union(
            variants
                .into_iter()
                .map(|&element| self.format_type(element)),
        )
    }
}

impl<'env: 'heap, 'heap> FormatType<'env, IntersectionType<'heap>> for TypeFormatter<'env, 'heap> {
    fn format_type(&mut self, IntersectionType { variants }: IntersectionType<'heap>) -> Doc<'env> {
        self.fmt.intersection(
            variants
                .into_iter()
                .map(|&element| self.format_type(element)),
        )
    }
}

impl<'env: 'heap, 'heap> FormatType<'env, ClosureType<'heap>> for TypeFormatter<'env, 'heap> {
    fn format_type(&mut self, ClosureType { params, returns }: ClosureType<'heap>) -> Doc<'env> {
        let returns = self.format_type(returns);

        self.fmt.closure_type(
            params.into_iter().map(|&element| self.format_type(element)),
            returns,
        )
    }
}

impl<'env: 'heap, 'heap> FormatType<'env, GenericArgumentId> for TypeFormatter<'env, 'heap> {
    fn format_type(&mut self, value: GenericArgumentId) -> Doc<'env> {
        let reference = self.generics.iter().find(|reference| reference.id == value);

        if let Some(reference) = reference {
            self.fmt.type_name(reference.name)
        } else {
            self.fmt.type_name_owned(format!("?{value}"))
        }
    }
}

impl<'env: 'heap, 'heap> FormatType<'env, Apply<'heap>> for TypeFormatter<'env, 'heap> {
    fn format_type(
        &mut self,
        Apply {
            base,
            substitutions,
        }: Apply<'heap>,
    ) -> Doc<'env> {
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

impl<'env: 'heap, 'heap> FormatType<'env, GenericArgument<'heap>> for TypeFormatter<'env, 'heap> {
    fn format_type(
        &mut self,
        GenericArgument {
            id,
            name,
            constraint,
        }: GenericArgument<'heap>,
    ) -> Doc<'env> {
        if let Some(constraint) = constraint {
            self.fmt
                .key_value(self.format_type(id), ":", self.format_type(constraint))
        } else {
            self.fmt.type_name(name)
        }
    }
}

impl<'env: 'heap, 'heap> FormatType<'env, Generic<'heap>> for TypeFormatter<'env, 'heap> {
    fn format_type(&mut self, Generic { base, arguments }: Generic<'heap>) -> Doc<'env> {
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

impl<'env: 'heap, 'heap> FormatType<'env, Param> for TypeFormatter<'env, 'heap> {
    fn format_type(&mut self, Param { argument }: Param) -> Doc<'env> {
        let mut doc = self.format_type(argument);

        if self.options.resolve_substitutions
            && let Some(substitution) = self.env.substitution.argument(argument)
        {
            doc = doc.append(self.fmt.braces(self.format_type(substitution)));
        }

        doc
    }
}

impl<'env: 'heap, 'heap> FormatType<'env, HoleId> for TypeFormatter<'env, 'heap> {
    fn format_type(&mut self, value: HoleId) -> Doc<'env> {
        self.fmt.type_name_owned(format!("_{value}"))
    }
}

impl<'env: 'heap, 'heap> FormatType<'env, Infer> for TypeFormatter<'env, 'heap> {
    fn format_type(&mut self, Infer { hole }: Infer) -> Doc<'env> {
        let mut doc = self.format_type(hole);

        if self.options.resolve_substitutions
            && let Some(substitution) = self.env.substitution.infer(hole)
        {
            doc = doc.append(self.fmt.braces(self.format_type(substitution)));
        }

        doc
    }
}

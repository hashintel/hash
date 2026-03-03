//! Hierarchical AST node formatter.
//!
//! Provides a structured, hierarchical text representation of AST nodes with detailed information
//! about each node's properties, identifiers, and relationships. This format is designed for
//! debugging, testing, and visual inspection of parsed structures.
//!
//! ## Format
//!
//! Each node is formatted as:
//! ```text
//! <node_type>#<id>@<span> (<properties>)
//! ```
//!
//! Where:
//! - `node_type` is the type of the AST node
//! - `id` is the unique node identifier
//! - `span` is the source code span
//! - `properties` are additional node-specific properties
//!
//! Child nodes are indented with 2 spaces beneath their parent.

use core::fmt::{self, Display, Formatter, FormattingOptions};

use hashql_core::{span::SpanId, value};

use crate::node::{
    expr::{
        AsExpr, CallExpr, ClosureExpr, DictExpr, Expr, ExprKind, FieldExpr, IfExpr, IndexExpr,
        InputExpr, LetExpr, ListExpr, LiteralExpr, NewTypeExpr, StructExpr, TupleExpr, TypeExpr,
        UseExpr,
        call::{Argument, LabeledArgument},
        closure::{ClosureParam, ClosureSignature},
        dict::DictEntry,
        list::ListElement,
        r#struct::StructEntry,
        tuple::TupleElement,
        r#use::{Glob, UseBinding, UseKind},
    },
    generic::{GenericArgument, GenericConstraint, GenericParam, Generics},
    id::NodeId,
    path::{Path, PathSegment, PathSegmentArgument},
    r#type::{
        IntersectionType, StructField, StructType, TupleField, TupleType, Type, TypeKind, UnionType,
    },
};

fn write_indent(fmt: &mut Formatter, depth: usize) -> fmt::Result {
    for _ in 0..depth {
        fmt.write_str("  ")?;
    }

    Ok(())
}

fn write_header(
    fmt: &mut Formatter,
    depth: usize,
    name: &str,
    id: Option<NodeId>,
    span: Option<SpanId>,
    properties: Option<&str>,
) -> fmt::Result {
    write_indent(fmt, depth)?;
    fmt.write_str(name)?;

    if let Some(id) = id {
        fmt.write_str("#")?;
        Display::fmt(&id, fmt)?;
    }

    if let Some(span) = span {
        fmt.write_str("@")?;
        Display::fmt(&span, fmt)?;
    }

    if let Some(properties) = properties {
        fmt.write_str(" (")?;
        fmt.write_str(properties)?;
        fmt.write_str(")")?;
    }

    fmt.write_str("\n")?;

    Ok(())
}

/// Dumps syntax nodes into a hierarchical tree representation.
///
/// Implementors provide a structured textual dump of themselves and their children,
/// displaying node type, IDs, spans, and properties in a consistent format.
///
/// The resulting format facilitates debugging, testing, and detailed inspection of
/// the syntax tree structure.
pub trait SyntaxDump {
    /// Writes a formatted dump of this node and its children to the formatter.
    ///
    /// # Errors
    ///
    /// If formatting fails.
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result;

    fn syntax_dump_to_string(&self) -> String {
        let mut buffer = String::new();

        self.syntax_dump(
            &mut Formatter::new(&mut buffer, FormattingOptions::new()),
            0,
        )
        .expect("Should be able to format into underlying buffer");

        buffer
    }
}

macro_rules! impl_syntax_dump {
    (@dump child; $this:ident; $fmt:ident; $depth:ident; ?$field:ident $($rest:tt)*) => {
        if let Some(field) = &$this.$field {
            field.syntax_dump($fmt, $depth + 1)?;
        }

        impl_syntax_dump!(@dump child; $this; $fmt; $depth; $($rest)*);
    };

    (@dump child; $this:ident; $fmt:ident; $depth:ident; []$field:ident $($rest:tt)*) => {
        for field in &$this.$field {
            field.syntax_dump($fmt, $depth + 1)?;
        }

        impl_syntax_dump!(@dump child; $this; $fmt; $depth; $($rest)*);
    };

    (@dump child; $this:ident; $fmt:ident; $depth:ident; $field:ident $($rest:tt)*) => {
        $this.$field.syntax_dump($fmt, $depth + 1)?;

        impl_syntax_dump!(@dump child; $this; $fmt; $depth; $($rest)*);
    };

    (@dump child; $this:ident; $fmt:ident; $depth:ident;) => {};

    (struct $name:ident($($properties:ident),*); $($fields:tt)*) => {
        #[expect(clippy::allow_attributes)]
        #[allow(unused_mut)]
        impl SyntaxDump for $name<'_> {
            fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
                let Self { id, span, .. } = self;

                let mut properties = Vec::<String>::new();
                $(
                    properties.push(format!("{}: {}", stringify!($properties), self.$properties));
                )*

                let properties = if properties.is_empty() {
                    None
                } else {
                    Some(properties.join(", "))
                };

                write_header(fmt, depth, stringify!($name), Some(*id), Some(*span), properties.as_deref())?;

                impl_syntax_dump!(@dump child; self; fmt; depth; $($fields)*);

                Ok(())
            }
        }
    };
}

#[rustfmt::skip]
impl_syntax_dump!(struct Type(); kind);

impl SyntaxDump for TypeKind<'_> {
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
        match self {
            TypeKind::Infer => write_header(fmt, depth, "TypeKind", None, None, Some("Infer")),
            TypeKind::Path(path) => {
                write_header(fmt, depth, "TypeKind", None, None, Some("Path"))?;

                path.syntax_dump(fmt, depth + 1)
            }
            TypeKind::Tuple(tuple_type) => {
                write_header(fmt, depth, "TypeKind", None, None, Some("Tuple"))?;

                tuple_type.syntax_dump(fmt, depth + 1)
            }
            TypeKind::Struct(struct_type) => {
                write_header(fmt, depth, "TypeKind", None, None, Some("Struct"))?;

                struct_type.syntax_dump(fmt, depth + 1)
            }
            TypeKind::Union(union_type) => {
                write_header(fmt, depth, "TypeKind", None, None, Some("Union"))?;

                union_type.syntax_dump(fmt, depth + 1)
            }
            TypeKind::Intersection(intersection_type) => {
                write_header(fmt, depth, "TypeKind", None, None, Some("Intersection"))?;

                intersection_type.syntax_dump(fmt, depth + 1)
            }
            TypeKind::Dummy => write_header(fmt, depth, "TypeKind", None, None, Some("Dummy")),
        }
    }
}

impl_syntax_dump!(struct TupleType(); []fields);
#[rustfmt::skip]
impl_syntax_dump!(struct TupleField(); r#type);

impl_syntax_dump!(struct StructType(); []fields);
#[rustfmt::skip]
impl_syntax_dump!(struct StructField(name); r#type);

impl_syntax_dump!(struct UnionType(); []types);
impl_syntax_dump!(struct IntersectionType(); []types);

impl_syntax_dump!(struct Path(rooted); []segments);
impl_syntax_dump!(struct PathSegment(name); []arguments);

impl SyntaxDump for PathSegmentArgument<'_> {
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
        match self {
            PathSegmentArgument::Argument(generic_argument) => {
                write_header(
                    fmt,
                    depth,
                    "PathSegmentArgument",
                    None,
                    None,
                    Some("GenericArgument"),
                )?;

                generic_argument.syntax_dump(fmt, depth + 1)
            }
            PathSegmentArgument::Constraint(generic_constraint) => {
                write_header(
                    fmt,
                    depth,
                    "PathSegmentArgument",
                    None,
                    None,
                    Some("GenericConstraint"),
                )?;

                generic_constraint.syntax_dump(fmt, depth + 1)
            }
        }
    }
}

#[rustfmt::skip]
impl_syntax_dump!(struct GenericArgument(); r#type);
#[rustfmt::skip]
impl_syntax_dump!(struct GenericConstraint(name); ?bound);
#[rustfmt::skip]
impl_syntax_dump!(struct GenericParam(name); ?bound);
impl_syntax_dump!(struct Generics(); []params);

#[rustfmt::skip]
impl_syntax_dump!(struct Argument(); value);
#[rustfmt::skip]
impl_syntax_dump!(struct LabeledArgument(label); value);
impl_syntax_dump!(struct CallExpr(); function []arguments []labeled_arguments);

#[rustfmt::skip]
impl_syntax_dump!(struct StructEntry(key); value);
impl_syntax_dump!(struct StructExpr(); []entries ?r#type);

#[rustfmt::skip]
impl_syntax_dump!(struct DictEntry(); key value);
impl_syntax_dump!(struct DictExpr(); []entries ?r#type);

#[rustfmt::skip]
impl_syntax_dump!(struct TupleElement(); value);
impl_syntax_dump!(struct TupleExpr(); []elements ?r#type);

#[rustfmt::skip]
impl_syntax_dump!(struct ListElement(); value);
impl_syntax_dump!(struct ListExpr(); []elements ?r#type);

impl SyntaxDump for value::Float<'_> {
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
        write_header(
            fmt,
            depth,
            "Float",
            None,
            None,
            Some(&format!("{}", self.as_symbol())),
        )
    }
}

impl SyntaxDump for value::Integer<'_> {
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
        write_header(
            fmt,
            depth,
            "Integer",
            None,
            None,
            Some(&format!("{}", self.as_symbol())),
        )
    }
}

impl SyntaxDump for value::String<'_> {
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
        write_header(
            fmt,
            depth,
            "String",
            None,
            None,
            Some(&format!("{}", self.as_symbol())),
        )
    }
}

impl SyntaxDump for value::Primitive<'_> {
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
        match self {
            Self::Null => write_header(fmt, depth, "Primitive", None, None, Some("Null")),
            Self::Boolean(true) => write_header(fmt, depth, "Primitive", None, None, Some("True")),
            Self::Boolean(false) => {
                write_header(fmt, depth, "Primitive", None, None, Some("False"))
            }
            Self::Float(float) => {
                write_header(fmt, depth, "Primitive", None, None, Some("Float"))?;

                float.syntax_dump(fmt, depth + 1)
            }
            Self::Integer(integer) => {
                write_header(fmt, depth, "Primitive", None, None, Some("Integer"))?;

                integer.syntax_dump(fmt, depth + 1)
            }
            Self::String(string) => {
                write_header(fmt, depth, "Primitive", None, None, Some("String"))?;

                string.syntax_dump(fmt, depth + 1)
            }
        }
    }
}

#[rustfmt::skip]
impl_syntax_dump!(struct LiteralExpr(); kind ?r#type);

impl_syntax_dump!(struct LetExpr(name); value ?r#type body);

impl_syntax_dump!(struct TypeExpr(name); []constraints value body);

impl_syntax_dump!(struct NewTypeExpr(name); []constraints value body);

impl SyntaxDump for UseBinding<'_> {
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
        let Self {
            id,
            span,
            name,
            alias,
        } = self;

        let mut properties = vec![format!("name: {name}")];
        if let Some(alias) = alias {
            properties.push(format!("alias: {alias}"));
        }

        write_header(
            fmt,
            depth,
            "UseBinding",
            Some(*id),
            Some(*span),
            Some(&properties.join(", ")),
        )
    }
}

impl SyntaxDump for Glob {
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
        let Self { id, span } = self;

        write_header(fmt, depth, "Glob", Some(*id), Some(*span), None)
    }
}

impl SyntaxDump for UseKind<'_> {
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
        match self {
            UseKind::Named(bindings) => {
                write_header(fmt, depth, "UseKind", None, None, Some("Named"))?;

                for binding in bindings {
                    binding.syntax_dump(fmt, depth + 1)?;
                }

                Ok(())
            }
            UseKind::Glob(glob) => {
                write_header(fmt, depth, "UseKind", None, None, Some("Glob"))?;

                glob.syntax_dump(fmt, depth + 1)
            }
        }
    }
}

impl_syntax_dump!(struct UseExpr(); path kind body);

impl_syntax_dump!(struct InputExpr(name); r#type ?default);

#[rustfmt::skip]
impl_syntax_dump!(struct ClosureParam(name); bound);
impl_syntax_dump!(struct ClosureSignature(); generics []inputs output);
impl_syntax_dump!(struct ClosureExpr(); signature body);

#[rustfmt::skip]
impl_syntax_dump!(struct IfExpr(); test then ?r#else);

impl_syntax_dump!(struct AsExpr(); value r#type);

#[rustfmt::skip]
impl_syntax_dump!(struct FieldExpr(field); value);

impl_syntax_dump!(struct IndexExpr(); value index);

impl SyntaxDump for ExprKind<'_> {
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
        match self {
            Self::Call(call_expr) => {
                write_header(fmt, depth, "ExprKind", None, None, Some("Call"))?;

                call_expr.syntax_dump(fmt, depth + 1)
            }
            Self::Struct(struct_expr) => {
                write_header(fmt, depth, "ExprKind", None, None, Some("Struct"))?;

                struct_expr.syntax_dump(fmt, depth + 1)
            }
            Self::Dict(dict_expr) => {
                write_header(fmt, depth, "ExprKind", None, None, Some("Dict"))?;

                dict_expr.syntax_dump(fmt, depth + 1)
            }
            Self::Tuple(tuple_expr) => {
                write_header(fmt, depth, "ExprKind", None, None, Some("Tuple"))?;

                tuple_expr.syntax_dump(fmt, depth + 1)
            }
            Self::List(list_expr) => {
                write_header(fmt, depth, "ExprKind", None, None, Some("List"))?;

                list_expr.syntax_dump(fmt, depth + 1)
            }
            Self::Literal(literal_expr) => {
                write_header(fmt, depth, "ExprKind", None, None, Some("Literal"))?;

                literal_expr.syntax_dump(fmt, depth + 1)
            }
            Self::Path(path) => {
                write_header(fmt, depth, "ExprKind", None, None, Some("Path"))?;

                path.syntax_dump(fmt, depth + 1)
            }
            Self::Let(let_expr) => {
                write_header(fmt, depth, "ExprKind", None, None, Some("Let"))?;

                let_expr.syntax_dump(fmt, depth + 1)
            }
            Self::Type(type_expr) => {
                write_header(fmt, depth, "ExprKind", None, None, Some("Type"))?;

                type_expr.syntax_dump(fmt, depth + 1)
            }
            Self::NewType(new_type_expr) => {
                write_header(fmt, depth, "ExprKind", None, None, Some("NewType"))?;

                new_type_expr.syntax_dump(fmt, depth + 1)
            }
            Self::Use(use_expr) => {
                write_header(fmt, depth, "ExprKind", None, None, Some("Use"))?;

                use_expr.syntax_dump(fmt, depth + 1)
            }
            Self::Input(input_expr) => {
                write_header(fmt, depth, "ExprKind", None, None, Some("Input"))?;

                input_expr.syntax_dump(fmt, depth + 1)
            }
            Self::Closure(closure_expr) => {
                write_header(fmt, depth, "ExprKind", None, None, Some("Closure"))?;

                closure_expr.syntax_dump(fmt, depth + 1)
            }
            Self::If(if_expr) => {
                write_header(fmt, depth, "ExprKind", None, None, Some("If"))?;

                if_expr.syntax_dump(fmt, depth + 1)
            }
            Self::As(as_expr) => {
                write_header(fmt, depth, "ExprKind", None, None, Some("As"))?;

                as_expr.syntax_dump(fmt, depth + 1)
            }
            Self::Field(field_expr) => {
                write_header(fmt, depth, "ExprKind", None, None, Some("Field"))?;

                field_expr.syntax_dump(fmt, depth + 1)
            }
            Self::Index(index_expr) => {
                write_header(fmt, depth, "ExprKind", None, None, Some("Index"))?;

                index_expr.syntax_dump(fmt, depth + 1)
            }
            Self::Underscore => {
                write_header(fmt, depth, "ExprKind", None, None, Some("Underscore"))
            }
            Self::Dummy => write_header(fmt, depth, "ExprKind", None, None, Some("Dummy")),
        }
    }
}

impl SyntaxDump for Expr<'_> {
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
        let Self { id, span, kind } = self;

        write_header(fmt, depth, "Expr", Some(*id), Some(*span), None)?;

        kind.syntax_dump(fmt, depth + 1)
    }
}

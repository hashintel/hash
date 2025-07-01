use alloc::borrow::Cow;
use core::fmt::Debug;

use hashql_core::{
    span::SpanId,
    symbol::Ident,
    value::{FieldAccessError, IndexAccessError},
};
use hashql_diagnostics::{
    Diagnostic,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    color::{AnsiColor, Color},
    help::Help,
    label::Label,
    note::Note,
    severity::Severity,
};
use hashql_hir::node::{operation::binary::BinOp, variable::QualifiedVariable};

use super::{FilterCompilerContext, convert::ConversionError};

pub type GraphReadCompilerDiagnostic = Diagnostic<GraphReadCompilerDiagnosticCategory, SpanId>;

const VALUE_PARAMETER_CONVERSION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "value-parameter-conversion",
    name: "Cannot convert value to graph parameter",
};

const PATH_CONVERSION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "path-conversion",
    name: "Cannot query against complex object",
};

const QUALIFIED_VARIABLE_UNSUPPORTED: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "qualified-variable-unsupported",
    name: "Qualified variables not supported",
};

const TYPE_CONSTRUCTOR_UNSUPPORTED: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "type-constructor-unsupported",
    name: "Type constructors not supported as values",
};

const BINARY_OPERATION_UNSUPPORTED: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "binary-operation-unsupported",
    name: "Binary operations not supported in this context",
};

const PATH_INDEXING_UNSUPPORTED: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "path-indexing-unsupported",
    name: "Indexing through traversal paths not supported",
};

const FIELD_ACCESS_INTERNAL_ERROR: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "field-access-internal-error",
    name: "Internal error during field access",
};

const INDEX_ACCESS_INTERNAL_ERROR: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "index-access-internal-error",
    name: "Internal error during index access",
};

const PATH_TRAVERSAL_INTERNAL_ERROR: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "path-traversal-internal-error",
    name: "Internal error during path traversal",
};

const CALL_UNSUPPORTED: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "call-unsupported",
    name: "Function calls not supported",
};

const CLOSURE_UNSUPPORTED: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "closure-unsupported",
    name: "Closures not supported",
};

const NESTED_GRAPH_READ_UNSUPPORTED: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "nested-graph-read-unsupported",
    name: "Nested graph read operations not supported",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum GraphReadCompilerDiagnosticCategory {
    ValueParameterConversion,
    PathConversion,
    QualifiedVariableUnsupported,
    TypeConstructorUnsupported,
    BinaryOperationUnsupported,
    PathIndexingUnsupported,
    FieldAccessInternalError,
    IndexAccessInternalError,
    PathTraversalInternalError,
    CallUnsupported,
    ClosureUnsupported,
    NestedGraphReadUnsupported,
}

impl DiagnosticCategory for GraphReadCompilerDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("graph-read-compiler")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Graph Read Compiler")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::ValueParameterConversion => Some(&VALUE_PARAMETER_CONVERSION),
            Self::PathConversion => Some(&PATH_CONVERSION),
            Self::QualifiedVariableUnsupported => Some(&QUALIFIED_VARIABLE_UNSUPPORTED),
            Self::TypeConstructorUnsupported => Some(&TYPE_CONSTRUCTOR_UNSUPPORTED),
            Self::BinaryOperationUnsupported => Some(&BINARY_OPERATION_UNSUPPORTED),
            Self::PathIndexingUnsupported => Some(&PATH_INDEXING_UNSUPPORTED),
            Self::FieldAccessInternalError => Some(&FIELD_ACCESS_INTERNAL_ERROR),
            Self::IndexAccessInternalError => Some(&INDEX_ACCESS_INTERNAL_ERROR),
            Self::PathTraversalInternalError => Some(&PATH_TRAVERSAL_INTERNAL_ERROR),
            Self::CallUnsupported => Some(&CALL_UNSUPPORTED),
            Self::ClosureUnsupported => Some(&CLOSURE_UNSUPPORTED),
            Self::NestedGraphReadUnsupported => Some(&NESTED_GRAPH_READ_UNSUPPORTED),
        }
    }
}

// TODO: test once https://linear.app/hash/issue/H-4603/enable-dict-literal-construct lands
pub(super) fn value_parameter_conversion_error(
    context: FilterCompilerContext,
    value_span: SpanId,
    error: ConversionError,
) -> GraphReadCompilerDiagnostic {
    let mut diagnostic = Diagnostic::new(
        GraphReadCompilerDiagnosticCategory::ValueParameterConversion,
        Severity::Error,
    );

    diagnostic.labels.push(Label::new(
        value_span,
        format!("Cannot convert value to graph parameter: {error}"),
    ));

    diagnostic.labels.push(
        Label::new(context.span, "... within this filter expression")
            .with_order(-1)
            .with_color(Color::Ansi(AnsiColor::Blue)),
    );

    diagnostic.add_help(Help::new(
        "Graph parameters require valid JSON-compatible values. Dictionary keys must be strings, \
         as non-string keys cannot be properly serialized. Ensure all object keys in your data \
         are strings.",
    ));

    diagnostic.add_note(Note::new(
        "This error may indicate a data modeling issue. Entities should be JSON-compliant with \
         string keys. If you're seeing this error, the data structure you're trying to convert is \
         not serializable into JSON.",
    ));

    diagnostic
}

pub(super) fn path_conversion_error(
    context: FilterCompilerContext,
    path_span: SpanId,
) -> GraphReadCompilerDiagnostic {
    let mut diagnostic = Diagnostic::new(
        GraphReadCompilerDiagnosticCategory::PathConversion,
        Severity::Error,
    );

    diagnostic.labels.push(Label::new(
        path_span,
        "Cannot query against this complex object",
    ));

    diagnostic.labels.push(
        Label::new(context.span, "... within this filter expression")
            .with_order(-1)
            .with_color(Color::Ansi(AnsiColor::Blue)),
    );

    diagnostic.add_help(Help::new(
        "Filter expressions can only query against simple scalar properties that map to database \
         columns, not complex objects. Use individual properties of the object instead (e.g., \
         `entity.id.entity_uuid` instead of `entity.id`).",
    ));

    diagnostic.add_note(Note::new(
        "This is a temporary limitation of the current query compiler. Support for querying \
         against complex objects in filter expressions is being tracked in \
         https://linear.app/hash/issue/H-4911/hashql-allow-for-querying-against-complex-objects.",
    ));

    diagnostic
}

// In *theory* there's no way to hit this, as any value that's a qualified variable has already been
// resolved to a type-constructor, or intrinsic. This is just here as a sanity check until the
// proper module system lands.
#[coverage(off)]
pub(super) fn qualified_variable_unsupported(
    context: FilterCompilerContext,
    variable: &QualifiedVariable,
) -> GraphReadCompilerDiagnostic {
    let mut diagnostic = Diagnostic::new(
        GraphReadCompilerDiagnosticCategory::QualifiedVariableUnsupported,
        Severity::Error,
    );

    diagnostic.labels.push(Label::new(
        variable.span,
        format!(
            "Qualified variable `{}` not supported here",
            variable.name()
        ),
    ));

    diagnostic.labels.push(
        Label::new(context.span, "... within this filter expression")
            .with_order(-1)
            .with_color(Color::Ansi(AnsiColor::Blue)),
    );

    diagnostic.add_help(Help::new(format!(
        "Qualified variables like `{}` are not currently supported in filter expressions. Use \
         local variables or direct parameter references instead.",
        variable.name()
    )));

    diagnostic.add_note(Note::new(
        "Qualified variables are not yet supported. Implementation of a proper module system is \
         being tracked in https://linear.app/hash/issue/H-4912/hashql-implement-modules.",
    ));

    diagnostic
}

pub(super) fn type_constructor_unsupported(
    context: FilterCompilerContext,
    span: SpanId,
) -> GraphReadCompilerDiagnostic {
    let mut diagnostic = Diagnostic::new(
        GraphReadCompilerDiagnosticCategory::TypeConstructorUnsupported,
        Severity::Error,
    );

    diagnostic.labels.push(Label::new(
        span,
        Cow::Borrowed("Cannot use constructor as value here"),
    ));

    diagnostic.labels.push(
        Label::new(context.span, "... within this filter expression")
            .with_order(-1)
            .with_color(Color::Ansi(AnsiColor::Blue)),
    );

    diagnostic.add_help(Help::new(
        "Constructor functions cannot currently be used as first-class values in filter \
         expressions. You can still call constructors to create values (e.g., `SomeType(x)`), but \
         you cannot use the constructor itself in comparisons or pass it as an argument within \
         filter contexts.",
    ));

    diagnostic.add_note(Note::new(
        "This is a current limitation of the filter expression compiler. Constructors work as \
         first-class values elsewhere in the language, and support for this in filter expressions \
         is being tracked in https://linear.app/hash/issue/H-4913/hashql-implement-vm.",
    ));

    diagnostic
}

pub(super) fn binary_operation_unsupported(
    context: FilterCompilerContext,
    op: BinOp,
) -> GraphReadCompilerDiagnostic {
    let mut diagnostic = Diagnostic::new(
        GraphReadCompilerDiagnosticCategory::BinaryOperationUnsupported,
        Severity::Error,
    );

    diagnostic.labels.push(Label::new(
        op.span,
        format!("Operation `{}` not supported here", op.kind.as_str()),
    ));

    diagnostic.labels.push(
        Label::new(context.span, "... within this filter expression")
            .with_order(-1)
            .with_color(Color::Ansi(AnsiColor::Blue)),
    );

    diagnostic.add_help(Help::new(format!(
        "The `{0}` operation can only be used at the top level of filter conditions, not as an \
         operand in other operations. For example, `(a {0} b) == c` is not allowed, but `(a {0} \
         b) && (c == d)` is valid.",
        op.kind.as_str(),
    )));

    diagnostic.add_note(Note::new(
        "This is an intentional current limitation to keep expressions simple, but there are \
         plans to remove this restriction in the future to allow more complex expressions. \
         Progress on this enhancement is tracked in \
         https://linear.app/hash/issue/H-4911/hashql-allow-for-querying-against-complex-objects.",
    ));

    diagnostic
}

// TODO: requires https://linear.app/hash/issue/H-4603/enable-dict-literal-construct or
// https://linear.app/hash/issue/H-4870/implement-properties-traversal-primitive
pub(super) fn path_indexing_unsupported(
    context: FilterCompilerContext,
    expr_span: SpanId,
    index_span: SpanId,
) -> GraphReadCompilerDiagnostic {
    let mut diagnostic = Diagnostic::new(
        GraphReadCompilerDiagnosticCategory::PathIndexingUnsupported,
        Severity::Error,
    );

    diagnostic
        .labels
        .push(Label::new(index_span, "Cannot use computed value as index"));

    diagnostic.labels.push(
        Label::new(expr_span, "... when indexing this value")
            .with_order(-1)
            .with_color(Color::Ansi(AnsiColor::Yellow)),
    );

    diagnostic.labels.push(
        Label::new(context.span, "... within this filter expression")
            .with_order(-2)
            .with_color(Color::Ansi(AnsiColor::Blue)),
    );

    diagnostic.add_help(Help::new(
        "Dynamic indexing using database values is not currently supported in filter expressions. \
         Use a literal value like `[\"key\"]` or `[0]` instead of computed values like \
         `[entity.id]`. This limitation exists because such operations are complex to translate \
         into database queries.",
    ));

    diagnostic.add_note(Note::new(
        "This is a temporary limitation of the database query compiler. Support for dynamic \
         indexing using computed values in filter expressions is being tracked in \
         https://linear.app/hash/issue/H-4914/hashql-support-indexing-into-collections-based-on-query-paths.",
    ));

    diagnostic
}

#[coverage(off)]
pub(crate) fn field_access_internal_error(
    expr_span: SpanId,
    field: &Ident,
    error: &FieldAccessError,
) -> GraphReadCompilerDiagnostic {
    let mut diagnostic = Diagnostic::new(
        GraphReadCompilerDiagnosticCategory::FieldAccessInternalError,
        Severity::Bug,
    );

    diagnostic.labels.push(
        Label::new(
            field.span,
            format!("Field access for `{field}` failed unexpectedly"),
        )
        .with_color(Color::Ansi(AnsiColor::Red)),
    );

    diagnostic.labels.push(
        Label::new(expr_span, "... on this value")
            .with_order(-1)
            .with_color(Color::Ansi(AnsiColor::Yellow)),
    );

    diagnostic.add_help(Help::new(
        "This is an internal compiler error. The field access should have been validated by the \
         type checker, but the operation failed during compilation. Please report this as a bug \
         with the code that triggered this error.",
    ));

    diagnostic.add_note(Note::new(
        "This error indicates a bug in the type checker or compiler. The field access was \
         expected to succeed based on type information, but failed during evaluation.",
    ));

    diagnostic.add_note(Note::new(format!("Internal error that occurred: {error}")));

    diagnostic
}

#[coverage(off)]
pub(crate) fn index_access_internal_error(
    expr_span: SpanId,
    index_span: SpanId,
    error: &IndexAccessError,
) -> GraphReadCompilerDiagnostic {
    let mut diagnostic = Diagnostic::new(
        GraphReadCompilerDiagnosticCategory::IndexAccessInternalError,
        Severity::Bug,
    );

    diagnostic.labels.push(
        Label::new(index_span, "Index access failed unexpectedly")
            .with_color(Color::Ansi(AnsiColor::Red)),
    );

    diagnostic.labels.push(
        Label::new(expr_span, "... on this value")
            .with_order(-1)
            .with_color(Color::Ansi(AnsiColor::Yellow)),
    );

    diagnostic.add_help(Help::new(
        "This is an internal compiler error. The index access should have been validated by the \
         type checker, but the operation failed during compilation. Please report this as a bug \
         with the code that triggered this error.",
    ));

    diagnostic.add_note(Note::new(
        "This error indicates a bug in the type checker or compiler. The index access was \
         expected to succeed based on type information, but failed during evaluation.",
    ));

    diagnostic.add_note(Note::new(format!("Internal error that occurred: {error}")));

    diagnostic
}

#[coverage(off)]
pub(crate) fn path_traversal_internal_error<P>(
    expr_span: SpanId,
    access_span: SpanId,
    path: Option<&P>,
) -> GraphReadCompilerDiagnostic
where
    P: Debug,
{
    let mut diagnostic = Diagnostic::new(
        GraphReadCompilerDiagnosticCategory::PathTraversalInternalError,
        Severity::Bug,
    );

    diagnostic.labels.push(
        Label::new(access_span, "Path traversal failed unexpectedly")
            .with_color(Color::Ansi(AnsiColor::Red)),
    );

    diagnostic.labels.push(
        Label::new(expr_span, "... on this value")
            .with_order(-1)
            .with_color(Color::Ansi(AnsiColor::Yellow)),
    );

    diagnostic.add_help(Help::new(
        "This is an internal compiler error. The path traversal should have been validated by the \
         type checker, but failed during compilation. This indicates a mismatch between the type \
         checker's expectations and the actual path structure. Please report this as a bug with \
         the code that triggered this error.",
    ));

    diagnostic.add_note(Note::new(
        "This error suggests that the partial query path code was not properly adjusted to match \
         the type checker's validation. This is a compiler implementation bug.",
    ));

    diagnostic.add_note(Note::new(format!(
        "The path you were trying to access: {path:?}"
    )));

    diagnostic
}

pub(super) fn call_unsupported(
    context: FilterCompilerContext,
    call_span: SpanId,
) -> GraphReadCompilerDiagnostic {
    let mut diagnostic = Diagnostic::new(
        GraphReadCompilerDiagnosticCategory::CallUnsupported,
        Severity::Error,
    );

    diagnostic
        .labels
        .push(Label::new(call_span, "Function call not supported here"));

    diagnostic.labels.push(
        Label::new(context.span, "... within this filter expression")
            .with_order(-1)
            .with_color(Color::Ansi(AnsiColor::Blue)),
    );

    diagnostic.add_help(Help::new(
        "Filter expressions do not currently support function calls. Move the function call \
         outside the filter expression, assign the result to a variable, and use that variable in \
         the filter instead.",
    ));

    diagnostic.add_note(Note::new(
        "Function calls in filter expressions are not yet implemented. This feature may be added \
         in future versions for specific categories of pure functions. Progress is tracked in \
         https://linear.app/hash/issue/H-4913/hashql-implement-vm.",
    ));

    diagnostic
}

pub(super) fn closure_unsupported(
    context: FilterCompilerContext,
    closure_span: SpanId,
) -> GraphReadCompilerDiagnostic {
    let mut diagnostic = Diagnostic::new(
        GraphReadCompilerDiagnosticCategory::ClosureUnsupported,
        Severity::Error,
    );

    diagnostic.labels.push(Label::new(
        closure_span,
        "Closure definition not supported here",
    ));

    diagnostic.labels.push(
        Label::new(context.span, "... within this filter expression")
            .with_order(-1)
            .with_color(Color::Ansi(AnsiColor::Blue)),
    );

    diagnostic.add_help(Help::new(
        "Filter expressions do not currently support closure definitions. Move the closure \
         outside the filter expression, assign the result to a variable, and use that variable in \
         the filter instead.",
    ));

    diagnostic.add_note(Note::new(
        "Closures in filter expressions are not yet implemented. This is a current limitation \
         that is being tracked in https://linear.app/hash/issue/H-4913/hashql-implement-vm.",
    ));

    diagnostic
}

pub(super) fn nested_graph_read_unsupported(
    context: FilterCompilerContext,
    graph_span: SpanId,
) -> GraphReadCompilerDiagnostic {
    let mut diagnostic = Diagnostic::new(
        GraphReadCompilerDiagnosticCategory::NestedGraphReadUnsupported,
        Severity::Error,
    );

    diagnostic.labels.push(Label::new(
        graph_span,
        "Nested graph operation not supported here",
    ));

    diagnostic.labels.push(
        Label::new(context.span, "... within this filter expression")
            .with_order(-1)
            .with_color(Color::Ansi(AnsiColor::Blue)),
    );

    diagnostic.add_help(Help::new(
        "Filter expressions do not currently support nested graph operations. Move the graph \
         operation outside the filter expression, assign the result to a variable, and use that \
         variable in the filter instead.",
    ));

    diagnostic.add_note(Note::new(
        "Nested graph operations in filter expressions are not yet implemented. This is a current \
         limitation that is being tracked in https://linear.app/hash/issue/H-4913/hashql-implement-vm and \
         https://linear.app/hash/issue/H-4915/hashql-hoist-nested-graph-operations-inside-filters.",
    ));

    diagnostic
}

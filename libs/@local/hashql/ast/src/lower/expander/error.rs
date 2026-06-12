use alloc::borrow::Cow;
use core::fmt::{self, Display};

use hashql_core::{
    algorithms::did_you_mean,
    module::{
        ModuleId, ModuleRegistry, Universe,
        error::{ResolutionError, ResolutionSuggestion},
        import::Import,
        item::Item,
        namespace::ModuleNamespace,
    },
    span::{SpanId, Spanned},
    symbol::Symbol,
};
use hashql_diagnostics::{
    Diagnostic, DiagnosticIssues, Label, Patch, Suggestions,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    diagnostic::Message,
    severity::Severity,
};

use crate::node::{
    expr::{
        ExprKind,
        call::{Argument, LabeledArgument},
    },
    path::{Path, PathSegment, PathSegmentArgument},
};

pub(crate) type ExpanderDiagnostic = Diagnostic<ExpanderDiagnosticCategory, SpanId>;

pub(crate) type ExpanderDiagnosticIssues = DiagnosticIssues<ExpanderDiagnosticCategory, SpanId>;

const EMPTY_PATH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "empty-path",
    name: "Empty path",
};

const ABSOLUTE_PATH_MISMATCH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "absolute-path-mismatch",
    name: "Absolute path length mismatch",
};

const GENERIC_ARGUMENTS_IN_MODULE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "generic-arguments-in-module",
    name: "Generic arguments in module path",
};

const UNRESOLVED_VARIABLE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unresolved-variable",
    name: "Unresolved variable",
};

const PACKAGE_NOT_FOUND: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "package-not-found",
    name: "Package not found",
};

const MODULE_NOT_FOUND: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "module-not-found",
    name: "Module not found",
};

const IMPORT_NOT_FOUND: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "import-not-found",
    name: "Import not found",
};

const ITEM_NOT_FOUND: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "item-not-found",
    name: "Item not found",
};

const MODULE_REQUIRED: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "module-required",
    name: "Module required",
};

const AMBIGUOUS_NAME: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "ambiguous-name",
    name: "Ambiguous name",
};

const EMPTY_MODULE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "empty-module",
    name: "Empty module",
};

const INVALID_QUERY_LENGTH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-query-length",
    name: "Invalid query length",
};

const INVALID_BINDING_NAME: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-binding-name",
    name: "Invalid binding name",
};

const LABELED_ARGUMENTS_NOT_SUPPORTED: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "labeled-arguments-not-supported",
    name: "Labeled arguments not supported",
};

const INVALID_ARGUMENT_COUNT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-argument-count",
    name: "Invalid argument count",
};

const INVALID_TYPE_CONSTRUCTOR_CALL: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-type-constructor-call",
    name: "Invalid type constructor call",
};

const TYPE_ANNOTATION_IN_TYPE_POSITION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "type-annotation-in-type-position",
    name: "Type annotation in type position",
};

const INVALID_EXPRESSION_IN_TYPE_POSITION: TerminalDiagnosticCategory =
    TerminalDiagnosticCategory {
        id: "invalid-expression-in-type-position",
        name: "Invalid expression in type position",
    };

const FIELD_LITERAL_TYPE_ANNOTATION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "field-literal-type-annotation",
    name: "Field literal with type annotation",
};

const INVALID_FIELD_LITERAL_TYPE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-field-literal-type",
    name: "Invalid field literal type",
};

const FIELD_INDEX_OUT_OF_BOUNDS: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "field-index-out-of-bounds",
    name: "Field index out of bounds",
};

const INVALID_ACCESS_FIELD: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-access-field",
    name: "Invalid access field",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ExpanderDiagnosticCategory {
    EmptyPath,
    AbsolutePathMismatch,
    GenericArgumentsInModule,
    UnresolvedVariable,
    PackageNotFound,
    ModuleNotFound,
    ImportNotFound,
    ItemNotFound,
    ModuleRequired,
    AmbiguousName,
    EmptyModule,
    InvalidQueryLength,
    InvalidBindingName,
    LabeledArgumentsNotSupported,
    InvalidArgumentCount,
    InvalidTypeConstructorCall,
    TypeAnnotationInTypePosition,
    InvalidExpressionInTypePosition,
    FieldLiteralTypeAnnotation,
    InvalidFieldLiteralType,
    FieldIndexOutOfBounds,
    InvalidAccessField,
}

impl DiagnosticCategory for ExpanderDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("expander")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Expander")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::EmptyPath => Some(&EMPTY_PATH),
            Self::AbsolutePathMismatch => Some(&ABSOLUTE_PATH_MISMATCH),
            Self::GenericArgumentsInModule => Some(&GENERIC_ARGUMENTS_IN_MODULE),
            Self::UnresolvedVariable => Some(&UNRESOLVED_VARIABLE),
            Self::PackageNotFound => Some(&PACKAGE_NOT_FOUND),
            Self::ModuleNotFound => Some(&MODULE_NOT_FOUND),
            Self::ImportNotFound => Some(&IMPORT_NOT_FOUND),
            Self::ItemNotFound => Some(&ITEM_NOT_FOUND),
            Self::ModuleRequired => Some(&MODULE_REQUIRED),
            Self::AmbiguousName => Some(&AMBIGUOUS_NAME),
            Self::EmptyModule => Some(&EMPTY_MODULE),
            Self::InvalidQueryLength => Some(&INVALID_QUERY_LENGTH),
            Self::InvalidBindingName => Some(&INVALID_BINDING_NAME),
            Self::LabeledArgumentsNotSupported => Some(&LABELED_ARGUMENTS_NOT_SUPPORTED),
            Self::InvalidArgumentCount => Some(&INVALID_ARGUMENT_COUNT),
            Self::InvalidTypeConstructorCall => Some(&INVALID_TYPE_CONSTRUCTOR_CALL),
            Self::TypeAnnotationInTypePosition => Some(&TYPE_ANNOTATION_IN_TYPE_POSITION),
            Self::InvalidExpressionInTypePosition => Some(&INVALID_EXPRESSION_IN_TYPE_POSITION),
            Self::FieldLiteralTypeAnnotation => Some(&FIELD_LITERAL_TYPE_ANNOTATION),
            Self::InvalidFieldLiteralType => Some(&INVALID_FIELD_LITERAL_TYPE),
            Self::FieldIndexOutOfBounds => Some(&FIELD_INDEX_OUT_OF_BOUNDS),
            Self::InvalidAccessField => Some(&INVALID_ACCESS_FIELD),
        }
    }
}

/// Formats a user-written path prefix up to (and including) a given depth.
struct FormatUserPath<'a, 'heap> {
    rooted: bool,
    segments: &'a [PathSegment<'heap>],
    up_to: Option<usize>,
}

impl Display for FormatUserPath<'_, '_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.rooted {
            fmt.write_str("::")?;
        }

        let segments = self
            .up_to
            .map_or(self.segments, |depth| &self.segments[..=depth]);

        for (index, segment) in segments.iter().enumerate() {
            if index > 0 {
                fmt.write_str("::")?;
            }

            Display::fmt(&segment.name.value, fmt)?;
        }

        Ok(())
    }
}

/// Formats a canonical absolute path (always `::` prefixed) for an item in the registry.
fn format_absolute_path<'heap>(item: &Item<'heap>, registry: &ModuleRegistry<'heap>) -> String {
    use core::iter;

    let path = item.absolute_path(registry).into_iter().map(Symbol::unwrap);

    iter::once("").chain(path).intersperse("::").collect()
}

struct SpellingSuggestions<'heap, I> {
    name: Spanned<Symbol<'heap>>,
    candidates: I,
    context: &'static str,

    top_n: usize = 5,
    cutoff: Option<f64> = None,
}

impl<'heap, I> SpellingSuggestions<'heap, I> {
    fn emit(self, diagnostic: &mut ExpanderDiagnostic) -> Vec<Symbol<'heap>>
    where
        I: IntoIterator<Item = Symbol<'heap>> + Clone,
    {
        let similar = did_you_mean(
            self.name.value,
            self.candidates,
            Some(self.top_n),
            self.cutoff,
        );

        let len = similar.len();

        let patches: Vec<_> = similar
            .iter()
            .copied()
            .map(|candidate| Patch::new(self.name.span, candidate.as_str().to_owned()))
            .collect();

        let Some(suggestions) = Suggestions::try_from_iter(patches) else {
            debug_assert_eq!(len, 0);
            return similar;
        };

        diagnostic.add_message(Message::help(self.context).with_suggestions(suggestions));
        similar
    }
}

pub(crate) fn empty_path(span: SpanId) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(ExpanderDiagnosticCategory::EmptyPath, Severity::Bug)
        .primary(Label::new(span, "path has no segments"));

    diagnostic.add_message(Message::note(
        "after parsing and lowering, every path must contain at least one segment",
    ));

    diagnostic
}

pub(crate) fn absolute_path_mismatch(
    path_span: SpanId,
    path_length: usize,
    absolute_length: usize,
) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::AbsolutePathMismatch,
        Severity::Bug,
    )
    .primary(Label::new(
        path_span,
        format!("path has {path_length} segments but resolved to only {absolute_length}"),
    ));

    diagnostic.add_message(Message::note(
        "expansion can only prepend omitted ancestors, so the resolved absolute path must be at \
         least as long as the user's path",
    ));

    diagnostic
}

pub(crate) fn generic_arguments_in_module(
    module_segments: &[PathSegment<'_>],
) -> Option<ExpanderDiagnostic> {
    let mut arguments = module_segments
        .iter()
        .flat_map(|segment| &segment.arguments);

    let primary_span = arguments.next().map(PathSegmentArgument::span)?;

    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::GenericArgumentsInModule,
        Severity::Error,
    )
    .primary(Label::new(
        primary_span,
        "generic argument not allowed here",
    ));

    for argument in arguments {
        diagnostic.add_label(Label::new(argument.span(), "neither is this"));
    }

    diagnostic.add_message(Message::help(
        "move the generic arguments to the final segment of the path, or remove them",
    ));

    diagnostic.add_message(Message::note(
        "modules are not generic; only the final item in a path can be parameterized",
    ));

    Some(diagnostic)
}

/// Converts a `ResolutionError` into an expander diagnostic.
pub(crate) fn from_resolution_error<'heap>(
    path: &Path<'heap>,
    namespace: &ModuleNamespace<'_, 'heap>,
    universe: Universe,
    error: ResolutionError<'heap>,
) -> ExpanderDiagnostic {
    match error {
        ResolutionError::InvalidQueryLength { expected } => invalid_query_length(path, expected),
        ResolutionError::ModuleRequired { depth, found } => module_required(path, depth, found),
        ResolutionError::PackageNotFound {
            depth,
            name,
            suggestions,
        } => package_not_found(path, depth, name, &suggestions),
        ResolutionError::ModuleNotFound {
            depth,
            name,
            suggestions,
        } => module_not_found(path, depth, name, &suggestions),
        ResolutionError::ImportNotFound {
            depth,
            name,
            suggestions,
        } => {
            if depth == 0 && path.segments.len() == 1 {
                unresolved_variable(path, name, namespace, universe, &suggestions)
            } else {
                import_not_found(path, depth, name, &suggestions)
            }
        }
        ResolutionError::ItemNotFound {
            depth,
            name,
            suggestions,
        } => item_not_found(path, depth, name, &suggestions),
        ResolutionError::Ambiguous(reference) => ambiguous_name(path, reference.name()),
        ResolutionError::ModuleEmpty { depth } => empty_module(path, depth),
    }
}

fn invalid_query_length(path: &Path<'_>, expected: usize) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::InvalidQueryLength,
        Severity::Error,
    )
    .primary(Label::new(path.span, "path is too short to resolve"));

    diagnostic.add_message(Message::help(format!(
        "provide a path with at least {expected} segments, for example `module::item`",
    )));

    diagnostic
}

fn module_required(path: &Path<'_>, depth: usize, found: Option<Universe>) -> ExpanderDiagnostic {
    let segment = &path.segments[depth];
    let user_path = FormatUserPath {
        rooted: path.rooted,
        segments: &path.segments,
        up_to: Some(depth),
    };

    let primary_message = match found {
        Some(Universe::Value) => format!("`{user_path}` is a value, not a module"),
        Some(Universe::Type) => format!("`{user_path}` is a type, not a module"),
        None => format!("`{user_path}` is not a module"),
    };

    let mut diagnostic =
        Diagnostic::new(ExpanderDiagnosticCategory::ModuleRequired, Severity::Error)
            .primary(Label::new(segment.name.span, primary_message));

    if depth + 1 < path.segments.len() {
        diagnostic.add_label(Label::new(
            path.segments[depth + 1].name.span,
            "cannot access items inside a non-module",
        ));
    }

    let help = match found {
        Some(Universe::Value) => "if you meant to access a field, use `.` instead of `::`",
        Some(Universe::Type) | None => "only modules can contain sub-items accessible via `::`",
    };

    diagnostic.add_message(Message::help(help));

    diagnostic.add_message(Message::note(
        "the `::` separator navigates into modules; values and types do not contain sub-items",
    ));

    diagnostic
}

fn package_not_found<'heap>(
    path: &Path<'heap>,
    depth: usize,
    name: Symbol<'heap>,
    suggestions: &[ResolutionSuggestion<'heap, ModuleId>],
) -> ExpanderDiagnostic {
    let segment = &path.segments[depth];

    let mut diagnostic =
        Diagnostic::new(ExpanderDiagnosticCategory::PackageNotFound, Severity::Error).primary(
            Label::new(segment.name.span, format!("cannot find package `{name}`")),
        );

    diagnostic.add_label(Label::new(path.span, "in this path"));

    let emitted = SpellingSuggestions {
        name: segment.name.symbol(),
        candidates: suggestions.iter().map(|suggestion| suggestion.name),
        context: "a package with a similar name exists",
        ..
    }
    .emit(&mut diagnostic);

    if emitted.is_empty() {
        diagnostic.add_message(Message::help(
            "check the package name, or add it to the project dependencies",
        ));
    }

    diagnostic.add_message(Message::note(
        "absolute paths start from an installed package",
    ));

    diagnostic
}

fn module_not_found<'heap>(
    path: &Path<'heap>,
    depth: usize,
    name: Symbol<'heap>,
    suggestions: &[ResolutionSuggestion<'heap, Item<'heap>>],
) -> ExpanderDiagnostic {
    let segment = &path.segments[depth];
    let parent_path = FormatUserPath {
        rooted: path.rooted,
        segments: &path.segments,
        up_to: (depth > 0).then_some(depth - 1),
    };

    let primary_message = if depth > 0 {
        format!("cannot find module `{name}` in `{parent_path}`")
    } else {
        format!("cannot find module `{name}`")
    };

    let mut diagnostic =
        Diagnostic::new(ExpanderDiagnosticCategory::ModuleNotFound, Severity::Error)
            .primary(Label::new(segment.name.span, primary_message));

    if depth > 0 {
        diagnostic.add_label(Label::new(
            path.segments[depth - 1].name.span,
            "looked in this module",
        ));
    }

    let emitted = SpellingSuggestions {
        name: segment.name.symbol(),
        candidates: suggestions.iter().map(|suggestion| suggestion.name),
        context: "a module with a similar name exists",
        ..
    }
    .emit(&mut diagnostic);

    if emitted.is_empty() {
        diagnostic.add_message(Message::help(
            "check the module name and ensure it is exported from its parent",
        ));
    }

    diagnostic.add_message(Message::note(
        "only exported sub-modules are reachable via `::`",
    ));

    diagnostic
}

fn import_not_found<'heap>(
    path: &Path<'heap>,
    depth: usize,
    name: Symbol<'heap>,
    suggestions: &[ResolutionSuggestion<'heap, Import<'heap>>],
) -> ExpanderDiagnostic {
    let segment = &path.segments[depth];

    let mut diagnostic =
        Diagnostic::new(ExpanderDiagnosticCategory::ImportNotFound, Severity::Error).primary(
            Label::new(segment.name.span, format!("`{name}` is not imported")),
        );

    diagnostic.add_label(Label::new(path.span, "in this path"));

    let emitted = SpellingSuggestions {
        name: segment.name.symbol(),
        candidates: suggestions.iter().map(|suggestion| suggestion.name),
        context: "a similar name is available",
        ..
    }
    .emit(&mut diagnostic);

    if emitted.is_empty() {
        diagnostic.add_message(Message::help(
            "import the name with a `use` statement, or qualify it with a full path",
        ));
    }

    diagnostic
}

fn item_not_found<'heap>(
    path: &Path<'heap>,
    depth: usize,
    name: Symbol<'heap>,
    suggestions: &[ResolutionSuggestion<'heap, Item<'heap>>],
) -> ExpanderDiagnostic {
    let segment = &path.segments[depth];

    let primary_message = if depth > 0 {
        let parent_path = FormatUserPath {
            rooted: path.rooted,
            segments: &path.segments,
            up_to: Some(depth - 1),
        };

        format!("cannot find `{name}` in module `{parent_path}`")
    } else {
        format!("cannot find `{name}` in this scope")
    };

    let mut diagnostic = Diagnostic::new(ExpanderDiagnosticCategory::ItemNotFound, Severity::Error)
        .primary(Label::new(segment.name.span, primary_message));

    if depth > 0 {
        diagnostic.add_label(Label::new(
            path.segments[depth - 1].name.span,
            "looked in this module",
        ));
    }

    let emitted = SpellingSuggestions {
        name: segment.name.symbol(),
        candidates: suggestions.iter().map(|suggestion| suggestion.name),
        context: "a similar item exists in this module",
        ..
    }
    .emit(&mut diagnostic);

    if emitted.is_empty() {
        diagnostic.add_message(Message::help(
            "check the spelling and ensure the item is exported",
        ));
    }

    diagnostic
}

/// A single unqualified name could not be found in scope.
///
/// This is the most common resolution failure. Suggestions are tiered:
///
/// 1. **Local bindings**: names bound by `let`, `fn` parameters, etc.
/// 2. **Imported names**: names brought into scope by `use`
/// 3. **Registry items**: names available in the module registry but not yet imported
///
/// Each tier produces Patches: tiers 1 and 2 replace the identifier with the
/// corrected spelling; tier 3 replaces it with the fully qualified path.
fn unresolved_variable<'heap>(
    path: &Path<'heap>,
    name: Symbol<'heap>,
    namespace: &ModuleNamespace<'_, 'heap>,
    universe: Universe,
    import_suggestions: &[ResolutionSuggestion<'heap, Import<'heap>>],
) -> ExpanderDiagnostic {
    let registry = namespace.registry();
    let locals = namespace.locals(universe);
    let name_span = path.segments[0].name.span;

    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::UnresolvedVariable,
        Severity::Error,
    )
    .primary(Label::new(
        name_span,
        format!("cannot find `{name}` in this scope"),
    ));

    let mut has_suggestions = false;

    // Suggest similar local bindings.
    let emitted = SpellingSuggestions {
        name: Spanned {
            span: name_span,
            value: name,
        },
        candidates: locals.iter().copied(),
        context: "a similar local binding exists",
        ..
    }
    .emit(&mut diagnostic);
    has_suggestions |= !emitted.is_empty();

    // Suggest similar imported names, excluding those already covered by locals.
    let import_candidates: Vec<_> = import_suggestions
        .iter()
        .map(|suggestion| suggestion.name)
        .filter(|suggestion_name| !locals.contains(suggestion_name))
        .collect();

    let emitted = SpellingSuggestions {
        name: Spanned {
            span: name_span,
            value: name,
        },
        candidates: import_candidates.iter().copied(),
        context: "a similar imported name exists",
        ..
    }
    .emit(&mut diagnostic);
    has_suggestions |= !emitted.is_empty();

    // Suggest fully qualified paths for items available elsewhere in the registry.
    let importable: Vec<_> = registry
        .search_by_name(name, universe)
        .into_iter()
        .collect();

    if let Some(suggestions) = Suggestions::try_from_iter(
        importable
            .iter()
            .take(5)
            .map(|item| Patch::new(name_span, format_absolute_path(item, registry))),
    ) {
        has_suggestions = true;
        diagnostic.add_message(
            Message::help("use one of these fully qualified paths").with_suggestions(suggestions),
        );
    }

    if let Some(first) = importable.first() {
        let absolute = format_absolute_path(first, registry);
        let example = if importable.len() > 1 {
            format!("for example, bring it into scope: `use {absolute} in`")
        } else {
            format!("bring it into scope: `use {absolute} in`")
        };
        diagnostic.add_message(Message::help(example));
    }

    let remaining = importable.len().saturating_sub(5);
    if remaining > 0 {
        diagnostic.add_message(Message::note(format!(
            "{remaining} more items with this name exist in other modules",
        )));
    }

    if !has_suggestions {
        diagnostic.add_message(Message::help(
            "check the spelling, or import the name with a `use` statement",
        ));
    }

    diagnostic.add_message(Message::note(
        "this could be a typo, a name used outside its scope, or a missing declaration; if it is \
         a function or type from another module, you may need to import it first",
    ));

    diagnostic
}

fn ambiguous_name(path: &Path<'_>, name: Symbol<'_>) -> ExpanderDiagnostic {
    let name_span = path
        .segments
        .iter()
        .find_map(|segment| (segment.name.value == name).then_some(segment.name.span))
        .unwrap_or(path.span);

    let mut diagnostic =
        Diagnostic::new(ExpanderDiagnosticCategory::AmbiguousName, Severity::Error).primary(
            Label::new(name_span, format!("`{name}` refers to multiple items")),
        );

    diagnostic.add_label(Label::new(path.span, "in this path"));

    diagnostic.add_message(Message::help(
        "use a fully qualified path to specify which item you mean",
    ));

    diagnostic.add_message(Message::note(
        "multiple items with this name are in scope; consider using explicit imports instead of \
         globs to prevent conflicts",
    ));

    diagnostic
}

fn empty_module(path: &Path<'_>, depth: usize) -> ExpanderDiagnostic {
    let segment = &path.segments[depth];
    let user_path = FormatUserPath {
        rooted: path.rooted,
        segments: &path.segments,
        up_to: Some(depth),
    };

    let mut diagnostic = Diagnostic::new(ExpanderDiagnosticCategory::EmptyModule, Severity::Error)
        .primary(Label::new(
            segment.name.span,
            format!("module `{user_path}` has no exported items"),
        ));

    diagnostic.add_label(Label::new(path.span, "in this path"));

    diagnostic.add_message(Message::help(
        "check that the module path is correct, or import a specific item instead of the module",
    ));

    diagnostic
}

/// The first argument to `let` is not a simple identifier.
///
/// The name position requires a plain name like `x` or `count`, not a qualified
/// path, generic expression, or arbitrary expression.
pub(crate) fn invalid_let_binding_name(name: &Argument<'_>) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::InvalidBindingName,
        Severity::Error,
    )
    .primary(Label::new(
        name.value.span,
        "expected a simple identifier for the `let` binding name",
    ));

    diagnostic.add_message(Message::help(
        "write `(let name value body)` with a plain name such as `x`",
    ));

    diagnostic.add_message(Message::note(
        "the first argument to `let` introduces a new local binding and must be a plain \
         identifier without path qualification or generic arguments",
    ));

    diagnostic
}

/// A `let` call was passed labeled arguments.
///
/// `let` only accepts positional arguments in a fixed order.
pub(crate) fn labeled_arguments_in_let(
    labeled_arguments: &[LabeledArgument<'_>],
) -> ExpanderDiagnostic {
    let (first, rest) = labeled_arguments
        .split_first()
        .expect("caller should check that labeled_arguments is non-empty");

    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::LabeledArgumentsNotSupported,
        Severity::Error,
    )
    .primary(Label::new(
        first.span,
        "labeled arguments are not allowed in `let`",
    ));

    for argument in rest {
        diagnostic.add_label(Label::new(
            argument.span,
            "labeled argument not allowed here",
        ));
    }

    diagnostic.add_message(Message::help(
        "pass the arguments positionally: `(let name value body)` or `(let name type value body)`",
    ));

    diagnostic.add_message(Message::note(
        "`let` has a fixed argument order: name, optional type annotation, value, body",
    ));

    diagnostic
}

/// A `let` call was passed the wrong number of arguments.
///
/// `let` accepts either 3 arguments `(let name value body)` or 4 arguments
/// `(let name type value body)`.
pub(crate) fn invalid_let_argument_count(
    call_span: SpanId,
    arguments: &[Argument<'_>],
) -> ExpanderDiagnostic {
    let count = arguments.len();

    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::InvalidArgumentCount,
        Severity::Error,
    )
    .primary(Label::new(
        call_span,
        format!("expected 3 or 4 arguments to `let`, found {count}"),
    ));

    for argument in arguments.iter().skip(4) {
        diagnostic.add_label(Label::new(argument.span, "unexpected argument"));
    }

    diagnostic.add_message(Message::help(
        "use `(let name value body)` or `(let name type value body)`",
    ));

    diagnostic.add_message(Message::note(
        "the arguments are, in order: the binding name, an optional type annotation, the bound \
         value, and the body expression where the name is in scope",
    ));

    diagnostic
}

/// An `as` call was passed labeled arguments.
///
/// `as` only accepts positional arguments.
pub(crate) fn labeled_arguments_in_as(
    labeled_arguments: &[LabeledArgument<'_>],
) -> ExpanderDiagnostic {
    let (first, rest) = labeled_arguments
        .split_first()
        .expect("caller should check that labeled_arguments is non-empty");

    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::LabeledArgumentsNotSupported,
        Severity::Error,
    )
    .primary(Label::new(
        first.span,
        "labeled arguments are not allowed in `as`",
    ));

    for argument in rest {
        diagnostic.add_label(Label::new(
            argument.span,
            "labeled argument not allowed here",
        ));
    }

    diagnostic.add_message(Message::help(
        "pass the arguments positionally: `(as value type)`",
    ));

    diagnostic
}

/// An `as` call was passed the wrong number of arguments.
///
/// `as` accepts exactly 2 arguments: `(as value Type)`.
pub(crate) fn invalid_as_argument_count(
    call_span: SpanId,
    arguments: &[Argument<'_>],
) -> ExpanderDiagnostic {
    let count = arguments.len();

    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::InvalidArgumentCount,
        Severity::Error,
    )
    .primary(Label::new(
        call_span,
        format!("expected 2 arguments to `as`, found {count}"),
    ));

    for argument in arguments.iter().skip(2) {
        diagnostic.add_label(Label::new(argument.span, "unexpected argument"));
    }

    diagnostic.add_message(Message::help("use `(as value type)`"));

    diagnostic.add_message(Message::note(
        "the first argument is the value to cast and the second is the target type",
    ));

    diagnostic
}

/// An `if` call was passed labeled arguments.
///
/// `if` only accepts positional arguments.
pub(crate) fn labeled_arguments_in_if(
    labeled_arguments: &[LabeledArgument<'_>],
) -> ExpanderDiagnostic {
    let (first, rest) = labeled_arguments
        .split_first()
        .expect("caller should check that labeled_arguments is non-empty");

    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::LabeledArgumentsNotSupported,
        Severity::Error,
    )
    .primary(Label::new(
        first.span,
        "labeled arguments are not allowed in `if`",
    ));

    for argument in rest {
        diagnostic.add_label(Label::new(
            argument.span,
            "labeled argument not allowed here",
        ));
    }

    diagnostic.add_message(Message::help(
        "pass the arguments positionally: `(if condition then)` or `(if condition then else)`",
    ));

    diagnostic
}

/// An `if` call was passed the wrong number of arguments.
///
/// `if` accepts either 2 arguments `(if condition then)` or 3 arguments
/// `(if condition then else)`.
pub(crate) fn invalid_if_argument_count(
    call_span: SpanId,
    arguments: &[Argument<'_>],
) -> ExpanderDiagnostic {
    let count = arguments.len();

    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::InvalidArgumentCount,
        Severity::Error,
    )
    .primary(Label::new(
        call_span,
        format!("expected 2 or 3 arguments to `if`, found {count}"),
    ));

    for argument in arguments.iter().skip(3) {
        diagnostic.add_label(Label::new(argument.span, "unexpected argument"));
    }

    diagnostic.add_message(Message::help(
        "use `(if condition then)` or `(if condition then else)`",
    ));

    diagnostic.add_message(Message::note(
        "the arguments are, in order: the condition, the then branch, and an optional else branch",
    ));

    diagnostic
}

/// An `input` call was passed labeled arguments.
pub(crate) fn labeled_arguments_in_input(
    labeled_arguments: &[LabeledArgument<'_>],
) -> ExpanderDiagnostic {
    let (first, rest) = labeled_arguments
        .split_first()
        .expect("caller should check that labeled_arguments is non-empty");

    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::LabeledArgumentsNotSupported,
        Severity::Error,
    )
    .primary(Label::new(
        first.span,
        "labeled arguments are not allowed in `input`",
    ));

    for argument in rest {
        diagnostic.add_label(Label::new(
            argument.span,
            "labeled argument not allowed here",
        ));
    }

    diagnostic.add_message(Message::help(
        "pass the arguments positionally: `(input name type)` or `(input name type default)`",
    ));

    diagnostic
}

/// An `input` call was passed the wrong number of arguments.
///
/// `input` accepts either 2 arguments `(input name Type)` or 3 arguments
/// `(input name Type default)`.
pub(crate) fn invalid_input_argument_count(
    call_span: SpanId,
    arguments: &[Argument<'_>],
) -> ExpanderDiagnostic {
    let count = arguments.len();

    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::InvalidArgumentCount,
        Severity::Error,
    )
    .primary(Label::new(
        call_span,
        format!("expected 2 or 3 arguments to `input`, found {count}"),
    ));

    for argument in arguments.iter().skip(3) {
        diagnostic.add_label(Label::new(argument.span, "unexpected argument"));
    }

    diagnostic.add_message(Message::help(
        "use `(input name type)` or `(input name type default)`",
    ));

    diagnostic.add_message(Message::note(
        "the arguments are, in order: the input name, its type, and an optional default value",
    ));

    diagnostic
}

/// The first argument to `input` is not a simple identifier.
pub(crate) fn invalid_input_binding_name(name: &Argument<'_>) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::InvalidBindingName,
        Severity::Error,
    )
    .primary(Label::new(
        name.value.span,
        "expected a simple identifier for the `input` name",
    ));

    diagnostic.add_message(Message::help(
        "write `(input name type)` with a plain name such as `user_id`",
    ));

    diagnostic.add_message(Message::note(
        "the first argument to `input` declares a named parameter and must be a plain identifier",
    ));

    diagnostic
}

/// An `index` call was passed labeled arguments.
pub(crate) fn labeled_arguments_in_index(
    labeled_arguments: &[LabeledArgument<'_>],
) -> ExpanderDiagnostic {
    let (first, rest) = labeled_arguments
        .split_first()
        .expect("caller should check that labeled_arguments is non-empty");

    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::LabeledArgumentsNotSupported,
        Severity::Error,
    )
    .primary(Label::new(
        first.span,
        "labeled arguments are not allowed in `[]`",
    ));

    for argument in rest {
        diagnostic.add_label(Label::new(
            argument.span,
            "labeled argument not allowed here",
        ));
    }

    diagnostic.add_message(Message::help(
        "pass the arguments positionally: `([] collection index)`",
    ));

    diagnostic
}

/// An `index` call was passed the wrong number of arguments.
///
/// `index` accepts exactly 2 arguments: `([] collection index)`.
pub(crate) fn invalid_index_argument_count(
    call_span: SpanId,
    arguments: &[Argument<'_>],
) -> ExpanderDiagnostic {
    let count = arguments.len();

    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::InvalidArgumentCount,
        Severity::Error,
    )
    .primary(Label::new(
        call_span,
        format!("expected 2 arguments to `[]`, found {count}"),
    ));

    for argument in arguments.iter().skip(2) {
        diagnostic.add_label(Label::new(argument.span, "unexpected argument"));
    }

    diagnostic.add_message(Message::help("use `([] collection index)`"));

    diagnostic.add_message(Message::note(
        "the first argument is the collection and the second is the index",
    ));

    diagnostic
}

/// An `access` call was passed labeled arguments.
pub(crate) fn labeled_arguments_in_access(
    labeled_arguments: &[LabeledArgument<'_>],
) -> ExpanderDiagnostic {
    let (first, rest) = labeled_arguments
        .split_first()
        .expect("caller should check that labeled_arguments is non-empty");

    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::LabeledArgumentsNotSupported,
        Severity::Error,
    )
    .primary(Label::new(
        first.span,
        "labeled arguments are not allowed in `.`",
    ));

    for argument in rest {
        diagnostic.add_label(Label::new(
            argument.span,
            "labeled argument not allowed here",
        ));
    }

    diagnostic.add_message(Message::help(
        "pass the arguments positionally: `(. value field)`",
    ));

    diagnostic
}

/// An `access` call was passed the wrong number of arguments.
///
/// `access` accepts exactly 2 arguments: `(. value field)`.
pub(crate) fn invalid_access_argument_count(
    call_span: SpanId,
    arguments: &[Argument<'_>],
) -> ExpanderDiagnostic {
    let count = arguments.len();

    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::InvalidArgumentCount,
        Severity::Error,
    )
    .primary(Label::new(
        call_span,
        format!("expected 2 arguments to `.`, found {count}"),
    ));

    for argument in arguments.iter().skip(2) {
        diagnostic.add_label(Label::new(argument.span, "unexpected argument"));
    }

    diagnostic.add_message(Message::help("use `(. value field)`"));

    diagnostic.add_message(Message::note(
        "the first argument is the value and the second is the field name or index",
    ));

    diagnostic
}

/// The field argument to `access` is not a valid field identifier or integer index.
pub(crate) fn invalid_access_field(argument: &Argument<'_>) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::InvalidAccessField,
        Severity::Error,
    )
    .primary(Label::new(
        argument.value.span,
        "expected a field name or integer index",
    ));

    diagnostic.add_message(Message::help(
        "use a simple identifier like `name` or an integer like `0` for tuple fields",
    ));

    diagnostic
}

/// A numeric field literal in `access` has a type annotation.
pub(crate) fn field_literal_type_annotation(annotation_span: SpanId) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::FieldLiteralTypeAnnotation,
        Severity::Error,
    )
    .primary(Label::new(
        annotation_span,
        "type annotations are not allowed on field index literals",
    ));

    diagnostic.add_message(Message::help(
        "remove the type annotation and use a plain integer like `0`",
    ));

    diagnostic
}

/// A field literal in `access` is not an integer.
pub(crate) fn invalid_field_literal_type(literal_span: SpanId) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::InvalidFieldLiteralType,
        Severity::Error,
    )
    .primary(Label::new(
        literal_span,
        "expected an integer for field indexing",
    ));

    diagnostic.add_message(Message::help(
        "use an integer index like `0` for tuple field access, or a name like `field` for named \
         field access",
    ));

    diagnostic
}

/// A field index literal is too large.
pub(crate) fn field_index_out_of_bounds(literal_span: SpanId) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::FieldIndexOutOfBounds,
        Severity::Error,
    )
    .primary(Label::new(literal_span, "field index is out of bounds"));

    diagnostic.add_message(Message::help(
        "use a non-negative integer that fits within platform bounds",
    ));

    diagnostic
}

/// A type constructor call was passed labeled arguments.
///
/// Type constructor calls like `(| Int String)` only accept positional operands.
pub(crate) fn labeled_arguments_in_type_call(
    labeled_arguments: &[LabeledArgument<'_>],
) -> ExpanderDiagnostic {
    let (first, rest) = labeled_arguments
        .split_first()
        .expect("caller should check that labeled_arguments is non-empty");

    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::LabeledArgumentsNotSupported,
        Severity::Error,
    )
    .primary(Label::new(
        first.span,
        "labeled arguments are not allowed in type constructor calls",
    ));

    for argument in rest {
        diagnostic.add_label(Label::new(
            argument.span,
            "labeled argument not allowed here",
        ));
    }

    diagnostic.add_message(Message::help(
        "remove the labels and write the operand types positionally, for example `(| Int String)`",
    ));

    diagnostic.add_message(Message::note(
        "type constructors such as `|` (union) and `&` (intersection) take positional type \
         operands",
    ));

    diagnostic
}

/// A call expression in type position resolved to something that is not a
/// type constructor.
///
/// Only type constructors like `|` (union) and `&` (intersection) use call
/// syntax in type position. Other types are referenced directly by path.
pub(crate) fn invalid_type_constructor_call(
    function_span: SpanId,
    call_span: SpanId,
) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::InvalidTypeConstructorCall,
        Severity::Error,
    )
    .primary(Label::new(
        function_span,
        "cannot use this as a type constructor",
    ));

    diagnostic.add_label(Label::new(
        call_span,
        "this call appears in a type position",
    ));

    diagnostic.add_message(Message::help(
        "use a type path directly, or use `(| ...)` / `(& ...)` for unions and intersections",
    ));

    diagnostic.add_message(Message::note(
        "generic type arguments belong on the type path itself, for example `Foo<T>`, not `(Foo \
         T)`",
    ));

    diagnostic
}

/// A type was called like a function in type position, but types are not
/// callable type constructors.
///
/// The user wrote something like `(String Int)` when they probably meant
/// `String<Int>` for generics or just `String` as a plain type reference.
pub(crate) fn type_is_not_callable(
    name: Symbol<'_>,
    function_span: SpanId,
    call_span: SpanId,
) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::InvalidTypeConstructorCall,
        Severity::Error,
    )
    .primary(Label::new(
        function_span,
        format!("`{name}` is a type, not a type constructor"),
    ));

    diagnostic.add_label(Label::new(
        call_span,
        "call syntax is only valid for type constructors like `|` and `&`",
    ));

    diagnostic.add_message(Message::help(format!(
        "use `{name}` directly as a type path, or write `{name}<...>` for generic arguments",
    )));

    diagnostic.add_message(Message::note(
        "only `|` (union) and `&` (intersection) can be called as type constructors in type \
         position",
    ));

    diagnostic
}

/// Whether the aggregate expression is a tuple or a struct.
#[derive(Debug, Copy, Clone)]
pub(crate) enum AggregateKind {
    Tuple,
    Struct,
}

impl Display for AggregateKind {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Tuple => fmt.write_str("tuple"),
            Self::Struct => fmt.write_str("struct"),
        }
    }
}

/// A tuple or struct expression in type position has a redundant type annotation.
///
/// When used as a type, `(Int, String)` already defines a tuple type and
/// `(name: String)` already defines a struct type. Adding an annotation is
/// contradictory.
pub(crate) fn type_annotation_in_type_position(
    annotation_span: SpanId,
    expr_span: SpanId,
    kind: AggregateKind,
) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::TypeAnnotationInTypePosition,
        Severity::Error,
    )
    .primary(Label::new(
        annotation_span,
        "type annotations are not allowed inside a type expression",
    ));

    diagnostic.add_label(Label::new(
        expr_span,
        format!("this {kind} is already being used as a type"),
    ));

    diagnostic.add_message(Message::help("remove the type annotation"));

    let note = match kind {
        AggregateKind::Tuple => "in type position, `(Int, String)` already defines a tuple type",
        AggregateKind::Struct => "in type position, `(name: String)` already defines a struct type",
    };

    diagnostic.add_message(Message::note(note));

    diagnostic
}

const VALID_TYPE_FORMS: &str = "valid type forms are: type paths like `String`, tuple types like \
                                `(Int, String)`, struct types like `(name: String)`, `_` for \
                                inference, unions `(| ...)`, and intersections `(& ...)`";

/// An expression that cannot be used as a type was found in type position.
///
/// Type expressions are a restricted subset of general expressions. Paths,
/// tuples, structs, `_`, unions, and intersections are the valid forms.
///
/// Returns `None` for `Dummy` expressions, which are recovery sentinels from
/// earlier errors.
pub(crate) fn invalid_expression_in_type_position(
    span: SpanId,
    kind: &ExprKind<'_>,
) -> Option<ExpanderDiagnostic> {
    let description = match kind {
        ExprKind::Dict(_) => "a dictionary expression",
        ExprKind::List(_) => "a list expression",
        ExprKind::Literal(_) => "a literal value",
        ExprKind::Let(_) => "a `let` expression",
        ExprKind::Type(_) => "a `type` declaration",
        ExprKind::NewType(_) => "a `newtype` declaration",
        ExprKind::Use(_) => "a `use` expression",
        ExprKind::Input(_) => "an `input` expression",
        ExprKind::Closure(_) => "a closure expression",
        ExprKind::If(_) => "an `if` expression",
        ExprKind::Field(_) => "a field access expression",
        ExprKind::Index(_) => "an index expression",
        ExprKind::As(_) => "an `as` expression",
        ExprKind::Dummy => return None,
        ExprKind::Call(_)
        | ExprKind::Tuple(_)
        | ExprKind::Struct(_)
        | ExprKind::Path(_)
        | ExprKind::Underscore => {
            unreachable!("these expression kinds are valid in type position")
        }
    };

    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::InvalidExpressionInTypePosition,
        Severity::Error,
    )
    .primary(Label::new(
        span,
        format!("cannot use {description} as a type"),
    ));

    diagnostic.add_message(Message::help(
        "replace this with a type path, tuple type, struct type, `_`, `(| ...)`, or `(& ...)`",
    ));

    diagnostic.add_message(Message::note(VALID_TYPE_FORMS));

    Some(diagnostic)
}

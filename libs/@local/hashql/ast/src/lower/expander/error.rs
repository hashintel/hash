use alloc::borrow::Cow;
use core::fmt::{self, Display};

use hashql_core::{
    algorithms::did_you_mean,
    module::{
        ModuleId, ModuleRegistry, Universe,
        error::{KindSet, ResolutionError, ResolutionSuggestion},
        import::Import,
        item::Item,
        namespace::ModuleNamespace,
    },
    span::{SpanId, Spanned},
    symbol::{Symbol, sym},
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

const DUPLICATE_GENERIC_CONSTRAINT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "duplicate-generic-constraint",
    name: "Duplicate generic constraint",
};

const INVALID_GENERIC_ARGUMENT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-generic-argument",
    name: "Invalid generic argument",
};

const FN_GENERICS_TYPE_ANNOTATION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "fn-generics-type-annotation",
    name: "Type annotation on generic parameter list",
};

const INVALID_FN_GENERICS: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-fn-generics",
    name: "Invalid generic parameter list",
};

const INVALID_FN_GENERIC_PARAM: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-fn-generic-param",
    name: "Invalid generic parameter",
};

const FN_PARAMS_TYPE_ANNOTATION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "fn-params-type-annotation",
    name: "Type annotation on parameter list",
};

const INVALID_FN_PARAMS: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-fn-params",
    name: "Invalid parameter list",
};

const DUPLICATE_FN_GENERIC: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "duplicate-fn-generic",
    name: "Duplicate generic parameter",
};

const DUPLICATE_FN_PARAMETER: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "duplicate-fn-parameter",
    name: "Duplicate function parameter",
};

const USE_IMPORTS_TYPE_ANNOTATION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "use-imports-type-annotation",
    name: "Type annotation on use imports",
};

const INVALID_USE_IMPORTS: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-use-imports",
    name: "Invalid use imports",
};

const INVALID_USE_IMPORT_BINDING: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-use-import-binding",
    name: "Invalid use import binding",
};

const INVALID_USE_ALIAS: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-use-alias",
    name: "Invalid use alias",
};

const DUPLICATE_USE_BINDING: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "duplicate-use-binding",
    name: "Duplicate use binding",
};

const INTRINSIC_TYPE_ANNOTATION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "intrinsic-type-annotation",
    name: "Type annotation on intrinsic binding",
};

const INTRINSIC_GENERIC_ARGUMENTS: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "intrinsic-generic-arguments",
    name: "Generic arguments on intrinsic",
};

const INVALID_USE_PATH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-use-path",
    name: "Invalid use path",
};

const USE_PATH_GENERIC_ARGUMENTS: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "use-path-generic-arguments",
    name: "Generic arguments in use path",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ExpanderDiagnosticCategory {
    EmptyPath,
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
    DuplicateGenericConstraint,
    InvalidGenericArgument,
    FnGenericsTypeAnnotation,
    InvalidFnGenerics,
    InvalidFnGenericParam,
    FnParamsTypeAnnotation,
    InvalidFnParams,
    DuplicateFnGeneric,
    DuplicateFnParameter,
    IntrinsicTypeAnnotation,
    IntrinsicGenericArguments,
    UseImportsTypeAnnotation,
    InvalidUseImports,
    InvalidUseImportBinding,
    InvalidUseAlias,
    DuplicateUseBinding,
    InvalidUsePath,
    UsePathGenericArguments,
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
            Self::DuplicateGenericConstraint => Some(&DUPLICATE_GENERIC_CONSTRAINT),
            Self::InvalidGenericArgument => Some(&INVALID_GENERIC_ARGUMENT),
            Self::FnGenericsTypeAnnotation => Some(&FN_GENERICS_TYPE_ANNOTATION),
            Self::InvalidFnGenerics => Some(&INVALID_FN_GENERICS),
            Self::InvalidFnGenericParam => Some(&INVALID_FN_GENERIC_PARAM),
            Self::FnParamsTypeAnnotation => Some(&FN_PARAMS_TYPE_ANNOTATION),
            Self::InvalidFnParams => Some(&INVALID_FN_PARAMS),
            Self::DuplicateFnGeneric => Some(&DUPLICATE_FN_GENERIC),
            Self::DuplicateFnParameter => Some(&DUPLICATE_FN_PARAMETER),
            Self::IntrinsicTypeAnnotation => Some(&INTRINSIC_TYPE_ANNOTATION),
            Self::IntrinsicGenericArguments => Some(&INTRINSIC_GENERIC_ARGUMENTS),
            Self::UseImportsTypeAnnotation => Some(&USE_IMPORTS_TYPE_ANNOTATION),
            Self::InvalidUseImports => Some(&INVALID_USE_IMPORTS),
            Self::InvalidUseImportBinding => Some(&INVALID_USE_IMPORT_BINDING),
            Self::InvalidUseAlias => Some(&INVALID_USE_ALIAS),
            Self::DuplicateUseBinding => Some(&DUPLICATE_USE_BINDING),
            Self::InvalidUsePath => Some(&INVALID_USE_PATH),
            Self::UsePathGenericArguments => Some(&USE_PATH_GENERIC_ARGUMENTS),
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
        I: IntoIterator<Item = Symbol<'heap>, IntoIter: Clone>,
    {
        let similar = did_you_mean(
            self.name.value,
            self.candidates
                .into_iter()
                .filter(|candidate| *candidate != sym::dummy),
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

#[coverage(off)] // An empty path should not be possible to be constructed inside the CST.
pub(crate) fn empty_path(span: SpanId) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(ExpanderDiagnosticCategory::EmptyPath, Severity::Bug)
        .primary(Label::new(span, "path has no segments"));

    diagnostic.add_message(Message::note(
        "after parsing and lowering, every path must contain at least one segment",
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
            expected,
            found,
            suggestions,
        } => {
            if depth == 0 && path.segments.len() == 1 {
                unresolved_variable(path, name, namespace, universe, found, &suggestions)
            } else {
                import_not_found(path, depth, name, expected, found, &suggestions)
            }
        }
        ResolutionError::ItemNotFound {
            depth,
            name,
            expected,
            found,
            suggestions,
        } => item_not_found(path, depth, name, expected, found, &suggestions),
        ResolutionError::Ambiguous(reference) => ambiguous_name(path, reference.name()),
        ResolutionError::ModuleEmpty { depth } => empty_module(path, depth),
    }
}

/// Converts a `ResolutionError` from a `use` import into an expander diagnostic.
///
/// For named imports, the resolution query extends beyond the path by one segment
/// (the binding name). When `depth` points past the path segments, `binding_name`
/// provides the span and name for the error.
pub(crate) fn from_import_resolution_error<'heap>(
    path: &Path<'heap>,
    binding_name: Option<Spanned<Symbol<'heap>>>,
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
            expected,
            found,
            suggestions,
        } => import_not_found(path, depth, name, expected, found, &suggestions),
        ResolutionError::ItemNotFound {
            depth,
            name,
            expected,
            found,
            suggestions,
        } => {
            // For named imports, the item (binding name) is beyond the path segments.
            // Use the binding's span if available, otherwise fall back to the path span.
            if depth >= path.segments.len() {
                binding_name.map_or_else(
                    || {
                        item_not_found(
                            path,
                            depth.min(path.segments.len() - 1),
                            name,
                            expected,
                            found,
                            &suggestions,
                        )
                    },
                    |binding| {
                        item_not_found_at(binding.span, path, name, expected, found, &suggestions)
                    },
                )
            } else {
                item_not_found(path, depth, name, expected, found, &suggestions)
            }
        }
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
        up_to: depth.checked_sub(1),
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
    expected: Option<Universe>,
    found: KindSet,
    suggestions: &[ResolutionSuggestion<'heap, Import<'heap>>],
) -> ExpanderDiagnostic {
    let segment = &path.segments[depth];

    let kind_label = expected.map_or("name", universe_noun);

    let mut diagnostic =
        Diagnostic::new(ExpanderDiagnosticCategory::ImportNotFound, Severity::Error).primary(
            Label::new(
                segment.name.span,
                format!("{kind_label} `{name}` is not imported"),
            ),
        );

    diagnostic.add_label(Label::new(path.span, "in this path"));

    emit_cross_universe_hint(&mut diagnostic, name, expected, found);

    let emitted = SpellingSuggestions {
        name: segment.name.symbol(),
        candidates: suggestions.iter().map(|suggestion| suggestion.name),
        context: "a similar name is available",
        ..
    }
    .emit(&mut diagnostic);

    if emitted.is_empty() && found.is_empty() {
        diagnostic.add_message(Message::help(
            "import the name with a `use` statement, or qualify it with a full path",
        ));
    }

    diagnostic
}

/// Formats the universe as a noun for use in diagnostic messages.
const fn universe_noun(universe: Universe) -> &'static str {
    match universe {
        Universe::Value => "value",
        Universe::Type => "type",
    }
}

/// Appends a cross-universe hint when the name exists but as a different kind.
///
/// For example: `help: `Url` exists as a type, not a value`.
fn emit_cross_universe_hint(
    diagnostic: &mut ExpanderDiagnostic,
    name: Symbol<'_>,
    expected: Option<Universe>,
    found: KindSet,
) {
    if found.is_empty() {
        return;
    }

    // Remove the expected universe from the found set so we only report alternates.
    let alternates = expected.map_or(found, |universe| found.without_universe(universe));

    if alternates.is_empty() {
        return;
    }

    let message = expected.map_or_else(
        || format!("`{name}` exists as {alternates}"),
        |expected| {
            format!(
                "`{name}` exists as {alternates}, not {}",
                universe_noun(expected)
            )
        },
    );

    diagnostic.add_message(Message::help(message));
}

fn item_not_found<'heap>(
    path: &Path<'heap>,
    depth: usize,
    name: Symbol<'heap>,
    expected: Option<Universe>,
    found: KindSet,
    suggestions: &[ResolutionSuggestion<'heap, Item<'heap>>],
) -> ExpanderDiagnostic {
    let segment = &path.segments[depth];

    let kind_label = expected.map_or("item", universe_noun);

    let primary_message = if depth > 0 {
        let parent_path = FormatUserPath {
            rooted: path.rooted,
            segments: &path.segments,
            up_to: Some(depth - 1),
        };

        format!("cannot find {kind_label} `{name}` in module `{parent_path}`")
    } else {
        format!("cannot find {kind_label} `{name}` in this scope")
    };

    let mut diagnostic = Diagnostic::new(ExpanderDiagnosticCategory::ItemNotFound, Severity::Error)
        .primary(Label::new(segment.name.span, primary_message));

    if depth > 0 {
        diagnostic.add_label(Label::new(
            path.segments[depth - 1].name.span,
            "looked in this module",
        ));
    }

    emit_cross_universe_hint(&mut diagnostic, name, expected, found);

    let emitted = SpellingSuggestions {
        name: segment.name.symbol(),
        candidates: suggestions.iter().map(|suggestion| suggestion.name),
        context: "a similar item exists in this module",
        ..
    }
    .emit(&mut diagnostic);

    if emitted.is_empty() && found.is_empty() {
        diagnostic.add_message(Message::help(
            "check the spelling and ensure the item is exported",
        ));
    }

    diagnostic
}

/// Like `item_not_found`, but for items that are beyond the path's segments.
///
/// Used by import resolution when the binding name (appended to the path query)
/// is the item that was not found. The primary label points at `span` instead of
/// indexing into `path.segments`.
fn item_not_found_at<'heap>(
    span: SpanId,
    path: &Path<'heap>,
    name: Symbol<'heap>,
    expected: Option<Universe>,
    found: KindSet,
    suggestions: &[ResolutionSuggestion<'heap, Item<'heap>>],
) -> ExpanderDiagnostic {
    let parent_path = FormatUserPath {
        rooted: path.rooted,
        segments: &path.segments,
        up_to: path.segments.len().checked_sub(1),
    };

    let kind_label = expected.map_or("item", universe_noun);

    let mut diagnostic = Diagnostic::new(ExpanderDiagnosticCategory::ItemNotFound, Severity::Error)
        .primary(Label::new(
            span,
            format!("cannot find {kind_label} `{name}` in module `{parent_path}`"),
        ));

    if let Some(last) = path.segments.last() {
        diagnostic.add_label(Label::new(last.name.span, "looked in this module"));
    }

    emit_cross_universe_hint(&mut diagnostic, name, expected, found);

    let emitted = SpellingSuggestions {
        name: Spanned { span, value: name },
        candidates: suggestions.iter().map(|suggestion| suggestion.name),
        context: "a similar item exists in this module",
        ..
    }
    .emit(&mut diagnostic);

    if emitted.is_empty() && found.is_empty() {
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
    found: KindSet,
    import_suggestions: &[ResolutionSuggestion<'heap, Import<'heap>>],
) -> ExpanderDiagnostic {
    let registry = namespace.registry();
    let locals = namespace.locals(universe);
    let name_span = path.segments[0].name.span;

    let kind_label = universe_noun(universe);

    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::UnresolvedVariable,
        Severity::Error,
    )
    .primary(Label::new(
        name_span,
        format!("cannot find {kind_label} `{name}` in this scope"),
    ));

    emit_cross_universe_hint(&mut diagnostic, name, Some(universe), found);

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

/// A `let` binding with a type annotation resolved to a compiler intrinsic.
///
/// Intrinsics are not ordinary values and cannot be narrowed by a type
/// annotation. The binding is still valid without the annotation.
pub(crate) fn intrinsic_type_annotation(
    annotation_span: SpanId,
    value_span: SpanId,
    name: Symbol<'_>,
) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::IntrinsicTypeAnnotation,
        Severity::Error,
    )
    .primary(Label::new(
        annotation_span,
        format!("type annotation on `{name}` is not allowed here"),
    ));

    diagnostic.add_label(Label::new(
        value_span,
        "this resolves to a compiler intrinsic",
    ));

    diagnostic.add_message(Message::help(format!(
        "remove the type annotation: `(let {name} value body)`",
    )));

    diagnostic.add_message(Message::note(
        "compiler intrinsics cannot be given a type annotation because they are not ordinary \
         values",
    ));

    diagnostic
}

/// Generic arguments were attached to an intrinsic that does not accept them.
///
/// Special forms and built-in type operators are not generic. The generic
/// arguments should be removed.
pub(crate) fn intrinsic_generic_arguments(ident: &PathSegment<'_>) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::IntrinsicGenericArguments,
        Severity::Error,
    )
    .primary(Label::new(
        ident.span,
        format!("`{}` does not accept generic arguments", ident.name.value),
    ));

    diagnostic.add_message(Message::help(format!(
        "remove the generic arguments from `{}`",
        ident.name.value,
    )));

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

/// A `type` call was passed labeled arguments.
pub(crate) fn labeled_arguments_in_type(
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
        "labeled arguments are not allowed in `type`",
    ));

    for argument in rest {
        diagnostic.add_label(Label::new(
            argument.span,
            "labeled argument not allowed here",
        ));
    }

    diagnostic.add_message(Message::help(
        "pass the arguments positionally: `(type Name type-expr body)`",
    ));

    diagnostic
}

/// A `type` call was passed the wrong number of arguments.
///
/// `type` accepts exactly 3 arguments: `(type Name type-expr body)`.
pub(crate) fn invalid_type_argument_count(
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
        format!("expected 3 arguments to `type`, found {count}"),
    ));

    for argument in arguments.iter().skip(3) {
        diagnostic.add_label(Label::new(argument.span, "unexpected argument"));
    }

    diagnostic.add_message(Message::help("use `(type Name type-expr body)`"));

    diagnostic.add_message(Message::note(
        "the arguments are, in order: the type name (optionally with generic parameters), the \
         type definition, and the body where the name is in scope",
    ));

    diagnostic
}

/// The first argument to `type` is not a valid type name.
///
/// The name position requires a simple identifier, optionally with generic
/// parameters like `Foo<T>`, not a qualified path or arbitrary expression.
pub(crate) fn invalid_type_binding_name(name: &Argument<'_>) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::InvalidBindingName,
        Severity::Error,
    )
    .primary(Label::new(
        name.value.span,
        "expected a type name for the `type` binding",
    ));

    diagnostic.add_message(Message::help(
        "write `(type Name type-expr body)` with a name like `MyType` or `Pair<A, B>`",
    ));

    diagnostic.add_message(Message::note(
        "the first argument to `type` introduces a new type alias and must be a simple \
         identifier, optionally with generic parameters",
    ));

    diagnostic
}

/// The first argument to `newtype` is not a valid type name.
pub(crate) fn invalid_newtype_binding_name(name: &Argument<'_>) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::InvalidBindingName,
        Severity::Error,
    )
    .primary(Label::new(
        name.value.span,
        "expected a type name for the `newtype` binding",
    ));

    diagnostic.add_message(Message::help(
        "write `(newtype Name type-expr body)` with a name like `UserId` or `Pair<A, B>`",
    ));

    diagnostic.add_message(Message::note(
        "the first argument to `newtype` introduces a new distinct type and must be a simple \
         identifier, optionally with generic parameters",
    ));

    diagnostic
}

/// A `newtype` call was passed labeled arguments.
pub(crate) fn labeled_arguments_in_newtype(
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
        "labeled arguments are not allowed in `newtype`",
    ));

    for argument in rest {
        diagnostic.add_label(Label::new(
            argument.span,
            "labeled argument not allowed here",
        ));
    }

    diagnostic.add_message(Message::help(
        "pass the arguments positionally: `(newtype Name type-expr body)`",
    ));

    diagnostic
}

/// A `newtype` call was passed the wrong number of arguments.
///
/// `newtype` accepts exactly 3 arguments: `(newtype Name type-expr body)`.
pub(crate) fn invalid_newtype_argument_count(
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
        format!("expected 3 arguments to `newtype`, found {count}"),
    ));

    for argument in arguments.iter().skip(3) {
        diagnostic.add_label(Label::new(argument.span, "unexpected argument"));
    }

    diagnostic.add_message(Message::help("use `(newtype Name type-expr body)`"));

    diagnostic.add_message(Message::note(
        "the arguments are, in order: the type name (optionally with generic parameters), the \
         underlying type, and the body where the name is in scope",
    ));

    diagnostic
}

/// A generic parameter was declared more than once.
pub(crate) fn duplicate_generic_constraint(
    duplicate_span: SpanId,
    name: Symbol<'_>,
    original_span: SpanId,
) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::DuplicateGenericConstraint,
        Severity::Error,
    )
    .primary(Label::new(
        duplicate_span,
        format!("duplicate generic parameter `{name}`"),
    ));

    diagnostic.add_label(Label::new(
        original_span,
        format!("`{name}` was first declared here"),
    ));

    diagnostic.add_message(Message::help(
        "remove the duplicate declaration or use a different name",
    ));

    diagnostic
}

/// A generic argument in a type name is not a valid constraint.
///
/// Generic arguments must be simple identifiers (for unconstrained parameters)
/// or named constraints like `T: Bound`.
pub(crate) fn invalid_generic_argument(span: SpanId, is_path: bool) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::InvalidGenericArgument,
        Severity::Error,
    )
    .primary(Label::new(span, "expected a simple type parameter"));

    if is_path {
        diagnostic.add_message(Message::help(
            "use a simple identifier like `T`, not a qualified path",
        ));
    } else {
        diagnostic.add_message(Message::help(
            "use a simple identifier like `T` or a constraint like `T: Bound`",
        ));
    }

    diagnostic.add_message(Message::note(
        "generic parameters are declared as `Name<T>` for unconstrained or `Name<T: Bound>` for \
         constrained parameters",
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

/// A `fn` call was passed labeled arguments.
pub(crate) fn labeled_arguments_in_fn(
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
        "labeled arguments are not allowed in `fn`",
    ));

    for argument in rest {
        diagnostic.add_label(Label::new(
            argument.span,
            "labeled argument not allowed here",
        ));
    }

    diagnostic.add_message(Message::help(
        "pass the arguments positionally: `(fn generics params return-type body)`",
    ));

    diagnostic
}

/// A `fn` call was passed the wrong number of arguments.
///
/// `fn` accepts exactly 4 arguments: `(fn generics params return-type body)`.
pub(crate) fn invalid_fn_argument_count(
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
        format!("expected 4 arguments to `fn`, found {count}"),
    ));

    for argument in arguments.iter().skip(4) {
        diagnostic.add_label(Label::new(argument.span, "unexpected argument"));
    }

    diagnostic.add_message(Message::help("use `(fn generics params return-type body)`"));

    diagnostic.add_message(Message::note(
        "the arguments are, in order: the generic parameters (a tuple or struct), the function \
         parameters (a struct), the return type, and the body expression",
    ));

    diagnostic
}

/// The generic parameter list of a `fn` has a type annotation.
///
/// The generics argument to `fn` is a tuple or struct that declares type
/// variables. Annotating it with a type (e.g., `(T, U): something`) is not
/// meaningful.
pub(crate) fn fn_generics_type_annotation(annotation_span: SpanId) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::FnGenericsTypeAnnotation,
        Severity::Error,
    )
    .primary(Label::new(
        annotation_span,
        "type annotation is not allowed on the generic parameter list",
    ));

    diagnostic.add_message(Message::help(
        "remove the type annotation; the generic parameter list declares type variables, not a \
         typed value",
    ));

    diagnostic.add_message(Message::note(
        "write `(fn (T, U) ...)` for unbounded generics or `(fn (T: bound, U: _) ...)` for \
         bounded generics",
    ));

    diagnostic
}

/// The generics argument to `fn` is not a valid form.
///
/// Generic parameters must be specified as a tuple of identifiers (unbounded)
/// or a struct with optional bounds.
pub(crate) fn invalid_fn_generics(span: SpanId) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::InvalidFnGenerics,
        Severity::Error,
    )
    .primary(Label::new(
        span,
        "expected a tuple or struct for generic parameters",
    ));

    diagnostic.add_message(Message::help(
        "use a tuple like `(T, U)` for unbounded generics or a struct like `(T: bound, U: _)` for \
         bounded generics",
    ));

    diagnostic
}

/// A generic parameter in a `fn` tuple is not a simple identifier.
///
/// Each element of the generics tuple must be a plain name like `T`,
/// not a qualified path or complex expression.
pub(crate) fn invalid_fn_generic_param(span: SpanId) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::InvalidFnGenericParam,
        Severity::Error,
    )
    .primary(Label::new(span, "expected a simple type parameter name"));

    diagnostic.add_message(Message::help(
        "each generic parameter must be a plain identifier like `T`, not a qualified path or \
         expression",
    ));

    diagnostic
}

/// The parameter list of a `fn` has a type annotation.
///
/// The params argument to `fn` is a struct where each field declares a
/// parameter and its type. Annotating the struct itself is not meaningful.
pub(crate) fn fn_params_type_annotation(annotation_span: SpanId) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::FnParamsTypeAnnotation,
        Severity::Error,
    )
    .primary(Label::new(
        annotation_span,
        "type annotation is not allowed on the parameter list",
    ));

    diagnostic.add_message(Message::help(
        "remove the type annotation; each parameter already declares its type individually as \
         `(name: type)`",
    ));

    diagnostic
}

/// The params argument to `fn` is not a struct expression.
///
/// Function parameters must be declared as a struct where each field is a
/// parameter with its type.
pub(crate) fn invalid_fn_params(span: SpanId) -> ExpanderDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ExpanderDiagnosticCategory::InvalidFnParams, Severity::Error).primary(
            Label::new(span, "expected a struct for function parameters"),
        );

    diagnostic.add_message(Message::help(
        "write parameters as `(x: int, y: string)` where each field declares a parameter and its \
         type",
    ));

    diagnostic
}

/// A generic parameter name was declared more than once in a `fn` form.
pub(crate) fn duplicate_fn_generic(
    duplicate_span: SpanId,
    name: Symbol<'_>,
    original_span: SpanId,
) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::DuplicateFnGeneric,
        Severity::Error,
    )
    .primary(Label::new(
        duplicate_span,
        format!("duplicate generic parameter `{name}`"),
    ));

    diagnostic.add_label(Label::new(
        original_span,
        format!("`{name}` was first declared here"),
    ));

    diagnostic.add_message(Message::help(
        "remove the duplicate declaration or use a different name",
    ));

    diagnostic
}

/// A function parameter name was declared more than once in a `fn` form.
pub(crate) fn duplicate_fn_parameter(
    duplicate_span: SpanId,
    name: Symbol<'_>,
    original_span: SpanId,
) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::DuplicateFnParameter,
        Severity::Error,
    )
    .primary(Label::new(
        duplicate_span,
        format!("duplicate parameter `{name}`"),
    ));

    diagnostic.add_label(Label::new(
        original_span,
        format!("`{name}` was first declared here"),
    ));

    diagnostic.add_message(Message::help(
        "remove the duplicate parameter or use a different name",
    ));

    diagnostic
}

/// A `use` call was passed labeled arguments.
pub(crate) fn labeled_arguments_in_use(
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
        "labeled arguments are not allowed in `use`",
    ));

    for argument in rest {
        diagnostic.add_label(Label::new(
            argument.span,
            "labeled argument not allowed here",
        ));
    }

    diagnostic.add_message(Message::help(
        "pass the arguments positionally: `(use path imports body)`",
    ));

    diagnostic
}

/// A `use` call was passed the wrong number of arguments.
pub(crate) fn invalid_use_argument_count(
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
        format!("expected 3 arguments to `use`, found {count}"),
    ));

    for argument in arguments.iter().skip(3) {
        diagnostic.add_label(Label::new(argument.span, "unexpected argument"));
    }

    diagnostic.add_message(Message::help("use `(use path imports body)`"));

    diagnostic.add_message(Message::note(
        "the arguments are, in order: the module path to import from, the import specifier (`*`, \
         a tuple of names, or a struct of aliases), and the body where the imports are in scope",
    ));

    diagnostic
}

/// The import list in a `use` has a type annotation.
pub(crate) fn use_imports_type_annotation(annotation_span: SpanId) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::UseImportsTypeAnnotation,
        Severity::Error,
    )
    .primary(Label::new(
        annotation_span,
        "type annotations are not allowed on the import list",
    ));

    diagnostic.add_message(Message::help(
        "remove the type annotation; the import list declares which names to bring into scope, \
         not a typed value",
    ));

    diagnostic
}

/// The imports argument to `use` is not a valid form.
pub(crate) fn invalid_use_imports(span: SpanId) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::InvalidUseImports,
        Severity::Error,
    )
    .primary(Label::new(
        span,
        "expected `*`, a tuple of names, or a struct of aliases",
    ));

    diagnostic.add_message(Message::help(
        "use `*` to import everything, `(a, b)` to import specific names, or `(a: alias, b: _)` \
         to import with aliases",
    ));

    diagnostic
}

/// An import binding in a `use` tuple is not a simple identifier.
pub(crate) fn invalid_use_import_binding(span: SpanId) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::InvalidUseImportBinding,
        Severity::Error,
    )
    .primary(Label::new(span, "expected a simple name to import"));

    diagnostic.add_message(Message::help(
        "each import must be a plain identifier like `foo`, not a qualified path or expression",
    ));

    diagnostic
}

/// An alias in a `use` struct binding is not a valid form.
///
/// Aliases must be either `_` (keep the original name) or a simple identifier.
pub(crate) fn invalid_use_alias(span: SpanId) -> ExpanderDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ExpanderDiagnosticCategory::InvalidUseAlias, Severity::Error).primary(
            Label::new(span, "expected `_` or a simple identifier as the alias"),
        );

    diagnostic.add_message(Message::help(
        "use `_` to keep the original name or a simple identifier to rename: `(name: alias)` or \
         `(name: _)`",
    ));

    diagnostic
}

/// The same effective name was bound twice in a `use` import list.
pub(crate) fn duplicate_use_binding(
    duplicate_span: SpanId,
    name: Symbol<'_>,
    original_span: SpanId,
) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::DuplicateUseBinding,
        Severity::Error,
    )
    .primary(Label::new(
        duplicate_span,
        format!("duplicate import binding `{name}`"),
    ));

    diagnostic.add_label(Label::new(
        original_span,
        format!("`{name}` was first imported here"),
    ));

    diagnostic.add_message(Message::help(
        "remove the duplicate or use an alias to import under a different name",
    ));

    diagnostic
}

/// The path argument to `use` is not a path expression.
pub(crate) fn invalid_use_path(span: SpanId) -> ExpanderDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ExpanderDiagnosticCategory::InvalidUsePath, Severity::Error)
            .primary(Label::new(span, "expected a module path"));

    diagnostic.add_message(Message::help(
        "the first argument to `use` must be a path like `core::math` identifying the module to \
         import from",
    ));

    diagnostic
}

/// The path in a `use` statement contains generic arguments.
pub(crate) fn use_path_generic_arguments(path_span: SpanId) -> ExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ExpanderDiagnosticCategory::UsePathGenericArguments,
        Severity::Error,
    )
    .primary(Label::new(
        path_span,
        "generic arguments are not allowed in `use` paths",
    ));

    diagnostic.add_message(Message::help(
        "remove the generic arguments; `use` imports modules and items, which do not take type \
         parameters at the import site",
    ));

    diagnostic
}

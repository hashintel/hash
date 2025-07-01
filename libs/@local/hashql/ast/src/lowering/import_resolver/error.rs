use alloc::borrow::Cow;
use core::{
    fmt::{self, Display, Write as _},
    iter,
};

use hashql_core::{
    collection::FastHashSet,
    module::{
        ModuleRegistry, Universe,
        error::{ResolutionError, ResolutionSuggestion},
        import::Import,
        item::Item,
    },
    similarity::did_you_mean,
    span::SpanId,
    symbol::{Ident, Symbol},
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

use crate::node::path::Path;

pub(crate) type ImportResolverDiagnostic = Diagnostic<ImportResolverDiagnosticCategory, SpanId>;

const GENERIC_ARGUMENTS_IN_USE_PATH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "generic-arguments-in-use-path",
    name: "Generic arguments not allowed in import paths",
};

const EMPTY_PATH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "empty-path",
    name: "Empty path in import statement",
};

const GENERIC_ARGUMENTS_IN_MODULE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "generic-arguments-in-module",
    name: "Generic arguments only allowed in final path segment",
};

const UNRESOLVED_IMPORT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unresolved-import",
    name: "Unresolved import",
};

const UNRESOLVED_VARIABLE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unresolved-variable",
    name: "Unresolved variable",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ImportResolverDiagnosticCategory {
    GenericArgumentsInUsePath,
    EmptyPath,
    GenericArgumentsInModule,
    UnresolvedImport,
    UnresolvedVariable,
}

impl DiagnosticCategory for ImportResolverDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("import-resolver")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Import Resolver")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::GenericArgumentsInUsePath => Some(&GENERIC_ARGUMENTS_IN_USE_PATH),
            Self::EmptyPath => Some(&EMPTY_PATH),
            Self::GenericArgumentsInModule => Some(&GENERIC_ARGUMENTS_IN_MODULE),
            Self::UnresolvedImport => Some(&UNRESOLVED_IMPORT),
            Self::UnresolvedVariable => Some(&UNRESOLVED_VARIABLE),
        }
    }
}

/// Error when generic arguments are used in a use path segment
pub(crate) fn generic_arguments_in_use_path(
    span: SpanId,
    use_span: SpanId,
) -> ImportResolverDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ImportResolverDiagnosticCategory::GenericArgumentsInUsePath,
        Severity::Bug,
    );

    // Add primary and secondary labels
    diagnostic.labels.extend([
        Label::new(span, "Remove these generic arguments")
            .with_order(0)
            .with_color(Color::Ansi(AnsiColor::Red)),
        Label::new(use_span, "In this import statement")
            .with_order(1)
            .with_color(Color::Ansi(AnsiColor::Blue)),
    ]);

    diagnostic.add_help(Help::new(
        "Use statements don't accept generic type parameters. Remove the angle brackets and type \
         parameters.\n\nExample: Use `module::Type` instead of `module::Type<T>`.",
    ));

    diagnostic.add_note(Note::new(
        "This error is still valid, but should've been caught in an earlier stage of the compiler \
         pipeline.",
    ));

    diagnostic
}

/// Error when a path has no segments
pub(crate) fn empty_path(span: SpanId) -> ImportResolverDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ImportResolverDiagnosticCategory::EmptyPath, Severity::Bug);

    diagnostic.labels.push(
        Label::new(span, "Specify a path here")
            .with_order(0)
            .with_color(Color::Ansi(AnsiColor::Red)),
    );

    diagnostic.add_help(Help::new(
        "Add a valid path with at least one identifier, such as `module` or `module::item`.",
    ));

    diagnostic.add_note(Note::new(
        "Import statements require a non-empty path to identify what module or item you want to \
         bring into scope. This error is still valid, but should've been caught in an earlier \
         stage of the compiler pipeline.",
    ));

    diagnostic
}

/// Error when generic arguments are used in a module path segment
pub(crate) fn generic_arguments_in_module(
    spans: impl IntoIterator<Item = SpanId>,
) -> ImportResolverDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ImportResolverDiagnosticCategory::GenericArgumentsInModule,
        Severity::Error,
    );

    let mut spans = spans.into_iter();
    let primary = spans.next().expect("spans should be non-empty");

    // Primary label highlighting the invalid generic arguments
    diagnostic.labels.push(
        Label::new(primary, "Remove this generic argument")
            .with_order(0)
            .with_color(Color::Ansi(AnsiColor::Red)),
    );

    #[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
    for (index, secondary) in spans.enumerate() {
        diagnostic.labels.push(
            Label::new(secondary, "... and this generic argument")
                .with_order(-((index + 1) as i32))
                .with_color(Color::Ansi(AnsiColor::Red)),
        );
    }

    diagnostic.add_help(Help::new(
        "Generic arguments can only appear on the final type in a path. Remove them from this \
         module segment or move them to the final type in the path.\n\nCorrect: \
         `module::submodule::Type<T>`\nIncorrect: `module<T>::submodule::Type`",
    ));

    diagnostic.add_note(Note::new(
        "Module paths don't accept generic parameters because modules themselves aren't generic. \
         Only the final type in a path can have generic parameters.\n\nThe path resolution \
         happens before any generic type checking, so generic arguments can only be applied after \
         the item is found.",
    ));

    diagnostic
}

fn format_suggestions<'heap, T>(
    name: Symbol<'heap>,
    suggestions: &[ResolutionSuggestion<'heap, T>],
) -> Option<String> {
    if suggestions.is_empty() {
        return None;
    }

    let max_suggestions = match suggestions.len() {
        0 => return None,
        1..=3 => suggestions.len(),
        4..=8 => 4,
        _ => 5,
    };

    let good_suggestions = did_you_mean(
        name,
        suggestions
            .iter()
            .map(|ResolutionSuggestion { name, .. }| *name),
        Some(max_suggestions),
        None,
    );

    if good_suggestions.is_empty() {
        return None;
    }

    let mut result = String::from("\n\nDid you mean:");
    for suggestion in &good_suggestions {
        write!(result, "\n  - {suggestion}").unwrap_or_else(|_err| unreachable!());
    }

    let remaining_count = suggestions.len().saturating_sub(good_suggestions.len());
    match remaining_count {
        0 => {}
        1 => result.push_str("\n(1 more available)"),
        n => write!(result, "\n({n} more available)").unwrap_or_else(|_err| unreachable!()),
    }

    Some(result)
}

struct FormatPath<'a, 'heap>(bool, &'a [(SpanId, Symbol<'heap>)], Option<usize>);

impl Display for FormatPath<'_, '_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let &Self(rooted, segments, depth) = self;

        if rooted {
            fmt.write_str("::")?;
        }

        let segments = depth.map_or(segments, |depth| &segments[..=depth]);

        for (index, (_, segment)) in segments.iter().enumerate() {
            if index > 0 {
                fmt.write_str("::")?;
            }

            Display::fmt(segment, fmt)?;
        }

        Ok(())
    }
}

pub(crate) fn unresolved_variable<'heap>(
    registry: &ModuleRegistry<'heap>,
    universe: Universe,
    ident: Ident<'heap>,
    locals: &FastHashSet<Symbol<'heap>>,
    mut suggestions: Vec<ResolutionSuggestion<Import<'heap>>>,
) -> ImportResolverDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ImportResolverDiagnosticCategory::UnresolvedVariable,
        Severity::Error,
    );

    diagnostic.labels.push(
        Label::new(
            ident.span,
            format!("Cannot find variable '{}'", ident.value),
        )
        .with_order(0)
        .with_color(Color::Ansi(AnsiColor::Red)),
    );

    // Filter out suggestions that are already available locally
    suggestions.retain(|suggestion| !locals.contains(&suggestion.name));

    let help = build_unresolved_variable_help(registry, universe, ident, locals, &suggestions);
    diagnostic.add_help(Help::new(help));

    diagnostic.add_note(Note::new(
        "Variables must be defined before they can be used. This could be a typo, a variable used \
         outside its scope, or a missing declaration. If it's a function or type from another \
         module, you might need to import it first.",
    ));

    diagnostic
}

fn build_unresolved_variable_help<'heap>(
    registry: &ModuleRegistry<'heap>,
    universe: Universe,
    ident: Ident<'heap>,
    locals: &FastHashSet<Symbol<'heap>>,
    suggestions: &[ResolutionSuggestion<Import<'heap>>],
) -> String {
    let mut help = format!("The name '{}' doesn't exist in this scope.", ident.value);

    let has_locals = add_local_suggestions(&mut help, ident.value, locals);
    let has_imports = add_import_suggestions(&mut help, ident.value, suggestions, has_locals);
    add_available_imports(
        &mut help,
        registry,
        universe,
        ident,
        locals,
        suggestions,
        has_locals || has_imports,
    );

    help
}

fn add_local_suggestions(
    help: &mut String,
    name: Symbol<'_>,
    locals: &FastHashSet<Symbol<'_>>,
) -> bool {
    let local_suggestions = did_you_mean(name, locals, Some(5), None);
    if local_suggestions.is_empty() {
        return false;
    }

    help.push_str("\n\nDid you mean one of these local variables:");
    for suggestion in &local_suggestions {
        let _: fmt::Result = write!(help, "\n  - {suggestion}");
    }

    let remaining = locals.len().saturating_sub(local_suggestions.len());
    if remaining > 0 {
        let _: fmt::Result = write!(help, "\n  ({remaining} more available)");
    }

    true
}

fn add_import_suggestions(
    help: &mut String,
    name: Symbol<'_>,
    suggestions: &[ResolutionSuggestion<Import<'_>>],
    has_local_suggestions: bool,
) -> bool {
    if suggestions.is_empty() {
        return false;
    }

    let good_suggestions = did_you_mean(
        name,
        suggestions.iter().map(|suggestion| suggestion.name),
        Some(5),
        None,
    );

    if good_suggestions.is_empty() {
        return false;
    }

    if has_local_suggestions {
        help.push_str("\n\nOr perhaps you meant one of these imported items:");
    } else {
        help.push_str("\n\nDid you mean one of these imported items:");
    }
    for suggestion in &good_suggestions {
        let _: fmt::Result = write!(help, "\n  - {suggestion}");
    }

    let remaining = suggestions.len().saturating_sub(good_suggestions.len());
    if remaining > 0 {
        let _: fmt::Result = write!(help, "\n  ({remaining} more available)");
    }

    true
}

fn add_available_imports<'heap>(
    help: &mut String,
    registry: &ModuleRegistry<'heap>,
    universe: Universe,
    ident: Ident<'heap>,
    locals: &FastHashSet<Symbol<'heap>>,
    suggestions: &[ResolutionSuggestion<Import<'heap>>],
    has_previous: bool,
) {
    let imported_names: FastHashSet<_> = suggestions
        .iter()
        .map(|suggestion| suggestion.name)
        .collect();

    let importable: Vec<_> = registry
        .search_by_name(ident.value, universe)
        .into_iter()
        .filter(|item| !locals.contains(&item.name) && !imported_names.contains(&item.name))
        .collect();

    if importable.is_empty() {
        return;
    }

    if has_previous {
        help.push_str("\n\nAdditionally, items with a similar name exist in other modules:");
    } else {
        help.push_str("\n\nItems with a similar name exist in other modules:");
    }

    for item in importable.iter().take(5) {
        let absolute_path = format_absolute_path(item, registry);
        let _: fmt::Result = write!(help, "\n  - {absolute_path}");
    }

    if importable.len() > 5 {
        let remaining = importable.len() - 5;
        let _: fmt::Result = write!(help, "\n  ({remaining} more available)");
    }

    // Show usage example for the first item
    if let Some(item) = importable.first() {
        let absolute_path = format_absolute_path(item, registry);
        help.push_str("\n\nTo use an item, you can either:");
        let _: fmt::Result = write!(help, "\n  1. Import it: use {absolute_path} in");
        let _: fmt::Result = write!(help, "\n  2. Use fully qualified path: {absolute_path}");
    }
}

fn format_absolute_path<'heap>(item: &Item<'heap>, registry: &ModuleRegistry<'heap>) -> String {
    iter::once("")
        .chain(item.absolute_path(registry).map(|symbol| symbol.unwrap()))
        .intersperse("::")
        .collect()
}

#[expect(clippy::too_many_lines)]
pub(crate) fn from_resolution_error<'heap>(
    use_span: Option<SpanId>,
    path: &Path<'heap>,
    name: Option<(SpanId, Symbol<'heap>)>,
    error: ResolutionError<'heap>,
) -> ImportResolverDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ImportResolverDiagnosticCategory::UnresolvedImport,
        Severity::Error,
    );

    let segments: Vec<_> = path
        .segments
        .iter()
        .map(|segment| (segment.span, segment.name.value))
        .chain(name)
        .collect();

    match error {
        ResolutionError::InvalidQueryLength { expected } => {
            diagnostic.labels.push(
                // Primary label highlighting the problematic path
                Label::new(path.span, "Expected more path segments")
                    .with_order(0)
                    .with_color(Color::Ansi(AnsiColor::Red)),
            );

            if let Some(use_span) = use_span {
                // Secondary label showing the context of the use statement
                diagnostic.labels.push(
                    Label::new(use_span, "In this import statement")
                        .with_order(1)
                        .with_color(Color::Ansi(AnsiColor::Blue)),
                );
            }

            diagnostic.add_help(Help::new(format!(
                "This import path needs at least {expected} segments to be valid. Add the missing \
                 segments to complete the path."
            )));

            diagnostic.add_note(Note::new(
                "Import paths must be complete to properly identify the item you want to import. \
                 Incomplete paths cannot be resolved.",
            ));
        }

        ResolutionError::ModuleRequired { depth, found } => {
            let (path_segment_span, _) = segments[depth];

            diagnostic.labels.extend([
                // Primary label showing the item that can't contain other items
                Label::new(
                    path_segment_span,
                    format!(
                        "'{}' cannot contain other items",
                        FormatPath(path.rooted, &segments, Some(depth))
                    ),
                )
                .with_order(0)
                .with_color(Color::Ansi(AnsiColor::Red)),
                // Secondary label showing the full path context
                Label::new(path.span, "In this path")
                    .with_order(1)
                    .with_color(Color::Ansi(AnsiColor::Blue)),
            ]);

            let universe = match found {
                Some(Universe::Value) => "a value",
                Some(Universe::Type) => "a type",
                None => "not a module",
            };

            diagnostic.add_help(Help::new(format!(
                "'{}' is {universe}. Only modules can contain other items. Check your import path.",
                FormatPath(path.rooted, &segments, Some(depth))
            )));

            diagnostic.add_note(Note::new(
                "The '::' syntax can only be used with modules to access their members. Values \
                 and types cannot contain other items.",
            ));
        }

        ResolutionError::PackageNotFound {
            depth,
            name,
            suggestions,
        } => {
            let (package_span, package_name) = segments[depth];

            diagnostic.labels.push(
                // Primary label highlighting the missing package
                Label::new(package_span, format!("Missing package '{package_name}'"))
                    .with_order(0)
                    .with_color(Color::Ansi(AnsiColor::Red)),
            );

            if let Some(use_span) = use_span {
                diagnostic.labels.push(
                    // Secondary label showing the context
                    Label::new(use_span, "In this import statement")
                        .with_order(1)
                        .with_color(Color::Ansi(AnsiColor::Blue)),
                );
            }

            let mut help = "This package couldn't be found. Make sure it is spelled correctly and \
                            installed."
                .to_owned();

            if let Some(suggestion) = format_suggestions(name, &suggestions) {
                help.push_str(&suggestion);
            }

            diagnostic.add_help(Help::new(help));

            diagnostic.add_note(Note::new(
                "Packages must be installed and properly configured in your project dependencies \
                 before they can be imported.",
            ));
        }

        ResolutionError::ImportNotFound {
            depth,
            name,
            suggestions,
        } => {
            let (import_span, import_name) = segments[depth];

            diagnostic.labels.push(
                Label::new(
                    import_span,
                    format!("'{import_name}' needs to be imported first"),
                )
                .with_order(0)
                .with_color(Color::Ansi(AnsiColor::Red)),
            );

            if let Some(use_span) = use_span {
                diagnostic.labels.push(
                    // Add a secondary label for context
                    Label::new(use_span, "In this import statement")
                        .with_order(1)
                        .with_color(Color::Ansi(AnsiColor::Blue)),
                );
            }

            let mut help = format!(
                "Add an import statement for '{import_name}' before using it. Check if the name \
                 is spelled correctly."
            );

            if let Some(suggestion) = format_suggestions(name, &suggestions) {
                help.push_str(&suggestion);
            }

            diagnostic.add_help(Help::new(help));

            diagnostic.add_note(Note::new(
                "Before using an item from another module, you must import it with a 'use' \
                 statement or access it with a fully qualified path.",
            ));
        }

        ResolutionError::ModuleNotFound {
            depth,
            name,
            suggestions,
        } => {
            let (module_span, module_name) = segments[depth];

            diagnostic.labels.extend([
                Label::new(module_span, format!("Module '{module_name}' not found"))
                    .with_order(0)
                    .with_color(Color::Ansi(AnsiColor::Red)),
                // Add secondary label for context
                Label::new(path.span, "In this path")
                    .with_order(1)
                    .with_color(Color::Ansi(AnsiColor::Blue)),
            ]);

            let mut help = format!(
                "The module '{}' doesn't exist in this scope. Check the spelling and ensure the \
                 module is available.",
                FormatPath(path.rooted, &segments, Some(depth))
            );

            if let Some(suggestion) = format_suggestions(name, &suggestions) {
                help.push_str(&suggestion);
            }

            diagnostic.add_help(Help::new(help));

            diagnostic.add_note(Note::new(
                "Modules must be properly defined and exported from their parent module to be \
                 accessible.",
            ));
        }

        ResolutionError::ItemNotFound {
            depth,
            name,
            suggestions,
        } => {
            let (item_span, item_name) = segments[depth];

            let label_text = if depth == 0 {
                format!("'{item_name}' not found in current scope")
            } else {
                format!(
                    "'{item_name}' not found in module '{}'",
                    FormatPath(path.rooted, &segments, Some(depth - 1))
                )
            };

            diagnostic.labels.push(
                Label::new(item_span, label_text)
                    .with_order(0)
                    .with_color(Color::Ansi(AnsiColor::Red)),
            );

            // Add a secondary label highlighting the module
            if depth > 0 {
                let module_span = segments[depth - 1].0;
                diagnostic.labels.push(
                    Label::new(module_span, "This module")
                        .with_order(1)
                        .with_color(Color::Ansi(AnsiColor::Blue)),
                );
            } else if let Some(use_span) = use_span {
                diagnostic.labels.push(
                    Label::new(use_span, "In this import")
                        .with_order(1)
                        .with_color(Color::Ansi(AnsiColor::Blue)),
                );
            } else {
                // No secondary label needed - neither module nor import context available
            }

            let mut help = "Check the spelling and ensure the item is exported and available in \
                            this context."
                .to_owned();

            if let Some(suggestion) = format_suggestions(name, &suggestions) {
                help.push_str(&suggestion);
            }

            diagnostic.add_help(Help::new(help));

            diagnostic.add_note(Note::new(
                "Items must be defined and accessible from the importing location. Make sure the \
                 item exists and is public.",
            ));
        }

        ResolutionError::Ambiguous(item) => {
            // Find the span for the ambiguous name in the path
            let item_span = segments
                .iter()
                .find_map(|&(segment_span, segment_name)| {
                    (segment_name == item.name).then_some(segment_span)
                })
                .unwrap_or(path.span);

            diagnostic.labels.extend([
                // Primary label, pointing to the problem
                Label::new(item_span, format!("'{}' is ambiguous", item.name))
                    .with_order(0)
                    .with_color(Color::Ansi(AnsiColor::Red)),
                // Secondary label, pointing to the path
                Label::new(path.span, "In this path")
                    .with_order(1)
                    .with_color(Color::Ansi(AnsiColor::Blue)),
            ]);

            diagnostic.add_help(Help::new(format!(
                "The name '{}' could refer to multiple different items in {}. Use a fully \
                 qualified path to specify which one you want.",
                item.name,
                FormatPath(path.rooted, &segments, None)
            )));

            diagnostic.add_note(Note::new(
                "When multiple items with the same name are in scope, you must use a fully \
                 qualified path to avoid ambiguity. Consider using explicit imports instead of \
                 glob imports to prevent name conflicts.",
            ));
        }

        ResolutionError::ModuleEmpty { depth } => {
            let (module_span, _) = segments[depth];

            diagnostic.labels.extend([
                // Primary label, pointing to the module
                Label::new(
                    module_span,
                    format!(
                        "Module '{}' has no exported members",
                        FormatPath(path.rooted, &segments, Some(depth))
                    ),
                )
                .with_order(0)
                .with_color(Color::Ansi(AnsiColor::Red)),
                // Secondary label, pointing to the path
                Label::new(path.span, "In this import path")
                    .with_order(1)
                    .with_color(Color::Ansi(AnsiColor::Blue)),
            ]);

            diagnostic.add_help(Help::new(
                "This module exists but doesn't expose any items that can be imported. Check if \
                 you're importing the correct module or if the module has any public exports.",
            ));

            diagnostic.add_note(Note::new(
                "To use items from a module, they must be marked as public/exported. If you're \
                 using a glob import pattern like 'module::*', try using specific imports instead \
                 to see what's available.",
            ));
        }
    }

    diagnostic
}

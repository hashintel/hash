use std::borrow::Cow;

use hashql_core::{
    module::error::{ResolutionError, Suggestion as ResolutionSuggestion},
    span::SpanId,
    symbol::{InternedSymbol, Symbol},
};
use hashql_diagnostics::{
    Diagnostic, Help, Label, Note, Severity,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
};

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

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ImportResolverDiagnosticCategory {
    GenericArgumentsInUsePath,
    EmptyPath,
    GenericArgumentsInModule,
    UnresolvedImport,
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
        }
    }
}

/// Error when generic arguments are used in a use path segment
pub(crate) fn generic_arguments_in_use_path(span: SpanId) -> ImportResolverDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ImportResolverDiagnosticCategory::GenericArgumentsInUsePath,
        Severity::ERROR,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Remove these generic arguments"));

    diagnostic.help = Some(Help::new(
        "Use statements don't accept generic type parameters. Remove the angle brackets and type \
         parameters.",
    ));

    diagnostic.note = Some(Note::new(
        "Import paths only identify modules and items to bring into scope, not specific generic \
         instantiations.",
    ));

    diagnostic
}

/// Error when a path has no segments
pub(crate) fn empty_path(span: SpanId) -> ImportResolverDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ImportResolverDiagnosticCategory::EmptyPath, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, "Specify a path here"));

    diagnostic.help = Some(Help::new(
        "Add a valid path with at least one identifier, such as `module` or `module::item`.",
    ));

    diagnostic
}

/// Error when generic arguments are used in a module path segment
pub(crate) fn generic_arguments_in_module(span: SpanId) -> ImportResolverDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ImportResolverDiagnosticCategory::GenericArgumentsInModule,
        Severity::ERROR,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Remove these generic arguments"));

    diagnostic.help = Some(Help::new(
        "Generic arguments can only appear on the final type in a path. Remove them from this \
         module segment.",
    ));

    diagnostic.note = Some(Note::new(
        "To use generic parameters, apply them only to the final type: \
         `module::submodule::Type<T>`.",
    ));

    diagnostic
}

/// Format suggestions for display in diagnostics
fn format_suggestions<T: std::fmt::Display>(
    suggestions: &[ResolutionSuggestion<T>],
) -> Option<String> {
    let top_suggestions: Vec<_> = suggestions.iter()
        .filter(|s| s.score > 0.7) // Only include reasonably good matches
        .take(3)                   // Limit to top 3
        .map(|s| s.item.to_string())
        .collect();

    if top_suggestions.is_empty() {
        None
    } else {
        let suggestion_str = top_suggestions.join("', '");
        Some(format!("\n\nDid you mean: '{suggestion_str}'?"))
    }
}

/// Format a module path for display in error messages
fn format_path(path: &[InternedSymbol<'_>], depth: usize, rooted: bool) -> String {
    if depth == 0 {
        return String::new();
    }

    let prefix = if rooted { "::" } else { "" };

    let path_str = path[..depth]
        .iter()
        .map(|s| s.to_string())
        .collect::<Vec<_>>()
        .join("::");

    format!("{prefix}{path_str}")
}

/// Convert a resolution error to a diagnostic
pub(crate) fn from_resolution_error<'heap>(
    span: SpanId,
    path: &[InternedSymbol<'heap>],
    rooted: bool,
    error: ResolutionError<'heap>,
) -> ImportResolverDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ImportResolverDiagnosticCategory::UnresolvedImport,
        Severity::ERROR,
    );

    match &error {
        ResolutionError::InvalidQueryLength { expected } => {
            diagnostic
                .labels
                .push(Label::new(span, "Expected more path segments"));

            diagnostic.help = Some(Help::new(format!(
                "This import path needs at least {expected} segments to be valid."
            )));
        }

        ResolutionError::ModuleRequired { depth, found } => {
            let item_name = path[*depth].to_string();
            let path_prefix = format_path(path, *depth, rooted);
            let full_path = if path_prefix.is_empty() {
                item_name.clone()
            } else {
                format!("{path_prefix}::{item_name}")
            };

            diagnostic.labels.push(Label::new(
                span,
                format!("'{item_name}' cannot contain other items"),
            ));

            let universe_str = match found {
                Some(hashql_core::module::item::Universe::Value) => "a value",
                Some(hashql_core::module::item::Universe::Type) => "a type",
                None => "not a module",
            };

            diagnostic.help = Some(Help::new(format!(
                "'{full_path}' is {universe_str}, not a module. Only modules can contain other \
                 items."
            )));

            diagnostic.note = Some(Note::new(
                "The '::' syntax can only be used with modules to access their members.",
            ));
        }

        ResolutionError::PackageNotFound { depth, suggestions } => {
            let package_name = path[*depth].to_string();

            diagnostic.labels.push(Label::new(
                span,
                format!("Missing package '{package_name}'"),
            ));

            let mut help = format!(
                "This package couldn't be found, make sure it is spelled correctly and installed."
            );

            if let Some(suggestion_str) = format_suggestions(suggestions) {
                help.push_str(&suggestion_str);
            }

            diagnostic.help = Some(Help::new(help));
        }

        ResolutionError::ImportNotFound { depth, suggestions } => {
            let import_name = path[*depth].to_string();

            diagnostic.labels.push(Label::new(
                span,
                format!("'{import_name}' needs to be imported first"),
            ));

            let mut help = format!("Add an import statement for '{import_name}' before using it.");

            if let Some(suggestion_str) = format_suggestions(suggestions) {
                help.push_str(&suggestion_str);
            }

            diagnostic.help = Some(Help::new(help));
        }

        ResolutionError::ModuleNotFound { depth, suggestions } => {
            let module_name = path[*depth].to_string();
            let path_prefix = format_path(path, *depth, rooted);
            let full_path = if path_prefix.is_empty() {
                module_name.clone()
            } else {
                format!("{path_prefix}::{module_name}")
            };

            diagnostic.labels.push(Label::new(
                span,
                format!("Module '{module_name}' not found"),
            ));

            let mut help = format!("The module '{full_path}' doesn't exist in this scope.");

            if let Some(suggestion_str) = format_suggestions(suggestions) {
                help.push_str(&suggestion_str);
            }

            diagnostic.help = Some(Help::new(help));
        }

        ResolutionError::ItemNotFound { depth, suggestions } => {
            let item_name = path[*depth].to_string();
            let module_path = format_path(path, *depth, rooted);

            let label_text = if module_path.is_empty() {
                format!("'{item_name}' not found in current scope")
            } else {
                format!("'{item_name}' not found in module '{module_path}'")
            };

            diagnostic.labels.push(Label::new(span, label_text));

            let mut help = "Check the spelling or ensure the item is public and properly imported.";

            if let Some(suggestion_str) = format_suggestions(suggestions) {
                help = format!("{help}{suggestion_str}");
            }

            diagnostic.help = Some(Help::new(help.to_string()));
        }

        ResolutionError::Ambiguous(item) => {
            diagnostic
                .labels
                .push(Label::new(span, format!("'{item}' is ambiguous")));

            diagnostic.help = Some(Help::new(format!(
                "The name '{item}' could refer to multiple different items. Use a fully qualified \
                 path to clarify."
            )));

            diagnostic.note = Some(Note::new(
                "When the same name exists in multiple modules, you need to specify which one you \
                 want.",
            ));
        }

        ResolutionError::ModuleEmpty { depth } => {
            let module_path = format_path(path, *depth, rooted);
            let path_str = if module_path.is_empty() && *depth < path.len() {
                path[*depth].to_string()
            } else {
                module_path
            };

            diagnostic.labels.push(Label::new(
                span,
                format!("Module '{path_str}' has no exported members"),
            ));

            diagnostic.help = Some(Help::new(
                "This module exists but doesn't expose any items that can be imported.",
            ));

            diagnostic.note = Some(Note::new(
                "Try using specific imports instead of a glob pattern, or check that the module \
                 exports what you need.",
            ));
        }
    }

    diagnostic
}

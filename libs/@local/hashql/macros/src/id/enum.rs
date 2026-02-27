use proc_macro2::{Span, TokenStream};

use super::{emit_error, grammar};

pub(super) fn expand_enum(
    _additional_attributes: Vec<grammar::IdAttribute>,
    _parsed: grammar::ParsedEnum,
) -> TokenStream {
    emit_error(
        Span::call_site().unwrap(),
        "enum id types are not yet implemented",
    );

    TokenStream::new()
}

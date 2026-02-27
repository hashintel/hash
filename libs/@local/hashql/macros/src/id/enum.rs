fn expand_enum(
    _additional_attributes: Vec<grammar::IdAttribute>,
    _parsed: grammar::ParsedEnum,
) -> TokenStream {
    emit_error(Span::call_site(), "enum id types are not yet implemented");
    TokenStream::new()
}

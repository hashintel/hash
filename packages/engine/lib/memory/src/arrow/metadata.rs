use arrow2::datatypes::Field;

/// Attaches the necessary metadata to the field
pub fn add_metadata(mut field: Field) -> Field {
    if field.is_nullable {
        field.metadata.insert("nullable".to_owned(), "1".to_owned());
    }

    field
}

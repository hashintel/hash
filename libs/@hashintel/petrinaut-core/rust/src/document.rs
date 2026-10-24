use serde_json::Value;

pub(crate) fn net_mut<'a>(
    document: &'a mut Value,
    subnet_id: Option<&str>,
) -> Result<&'a mut Value, String> {
    if let Some(id) = subnet_id {
        document
            .get_mut("subnets")
            .and_then(Value::as_array_mut)
            .and_then(|subnets| subnets.iter_mut().find(|subnet| subnet["id"] == id))
            .ok_or_else(|| format!("Subnet ID `{id}` does not exist."))
    } else {
        Ok(document)
    }
}

pub(crate) fn items_mut<'a>(
    value: &'a mut Value,
    field: &str,
) -> Result<&'a mut Vec<Value>, String> {
    value
        .get_mut(field)
        .and_then(Value::as_array_mut)
        .ok_or_else(|| format!("Document field `{field}` must be an array"))
}

pub(crate) fn text<'a>(value: &'a Value, field: &str) -> &'a str {
    value.get(field).and_then(Value::as_str).unwrap_or("null")
}

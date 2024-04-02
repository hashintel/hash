use std::collections::HashSet;

use error_stack::Report;
use graph_types::knowledge::entity::{EntityProperties, Property};
use serde_json::Value as JsonValue;
use type_system::{url::VersionedUrl, ClosedEntityType, DataType, PropertyType};

pub fn install_error_stack_hooks() {
    Report::install_debug_hook::<Actual>(|actual, context| match actual {
        Actual::Json(json) => context.push_body(format!("actual: {json:#}")),
        Actual::Property(json) => context.push_body(format!("actual: {json:#}")),
        Actual::Properties(properties) => {
            if let Ok(json) = serde_json::to_value(properties) {
                context.push_body(format!("actual: {json:#}"));
            }
        }
    });
    Report::install_debug_hook::<Expected>(|expected, context| {
        struct AttachedSchemas(HashSet<VersionedUrl>);

        let ids = match expected {
            Expected::EntityType(entity_type) => {
                entity_type.schemas.keys().cloned().collect::<Vec<_>>()
            }
            Expected::PropertyType(property_type) => vec![property_type.id().clone()],
            Expected::DataType(data_type) => vec![data_type.id().clone()],
        };
        let stringified_ids = ids
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>()
            .join(", ");
        context.push_body(format!("expected schemas: {stringified_ids}"));

        let attach = context
            .get_mut::<AttachedSchemas>()
            .map(|attached| {
                let currently_attached = attached.0.len();
                attached.0.extend(ids.iter().cloned());
                currently_attached != attached.0.len()
            })
            .unwrap_or_else(|| {
                context.insert(AttachedSchemas(ids.into_iter().collect()));
                true
            });

        if attach {
            let json = match expected {
                Expected::EntityType(entity_type) => serde_json::to_value(entity_type),
                Expected::PropertyType(property_type) => serde_json::to_value(property_type),
                Expected::DataType(data_type) => serde_json::to_value(data_type.clone()),
            };
            if let Ok(json) = json {
                context.push_appendix(format!("{stringified_ids}\n{json:#}"));
            }
        }
    });
}

#[derive(Debug)]
pub enum Actual {
    Json(JsonValue),
    Property(Property),
    Properties(EntityProperties),
}

#[derive(Debug)]
pub enum Expected {
    EntityType(ClosedEntityType),
    PropertyType(PropertyType),
    DataType(DataType),
}

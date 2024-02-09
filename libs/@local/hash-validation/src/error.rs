use std::collections::HashSet;

use error_stack::Report;
use graph_types::knowledge::entity::EntityProperties;
use serde_json::Value as JsonValue;
use type_system::{url::VersionedUrl, DataType, EntityType, PropertyType};

pub fn install_error_stack_hooks() {
    Report::install_debug_hook::<Actual>(|actual, context| match actual {
        Actual::Json(json) => context.push_body(format!("actual: {json:#}")),
        Actual::Properties(properties) => {
            if let Ok(json) = serde_json::to_value(properties) {
                context.push_body(format!("actual: {json:#}"));
            }
        }
    });
    Report::install_debug_hook::<Expected>(|expected, context| {
        struct AttachedSchemas(HashSet<VersionedUrl>);

        let id = expected.id();
        context.push_body(format!("expected schema: {id}"));

        let attach = context
            .get_mut::<AttachedSchemas>()
            .map(|attached| attached.0.insert(id.clone()))
            .unwrap_or_else(|| {
                context.insert(AttachedSchemas(HashSet::from([id.clone()])));
                true
            });

        if attach {
            let json = match expected {
                Expected::EntityType(entity_type) => serde_json::to_value(entity_type),
                Expected::PropertyType(property_type) => serde_json::to_value(property_type),
                Expected::DataType(data_type) => serde_json::to_value(data_type.clone()),
            };
            if let Ok(json) = json {
                context.push_appendix(format!("{id}\n{json:#}"));
            }
        }
    });
}

#[derive(Debug)]
pub enum Actual {
    Json(JsonValue),
    Properties(EntityProperties),
}

#[derive(Debug)]
pub enum Expected {
    EntityType(EntityType),
    PropertyType(PropertyType),
    DataType(DataType),
}

impl Expected {
    #[must_use]
    pub const fn id(&self) -> &VersionedUrl {
        match self {
            Self::EntityType(entity_type) => entity_type.id(),
            Self::PropertyType(property_type) => property_type.id(),
            Self::DataType(data_type) => data_type.id(),
        }
    }
}

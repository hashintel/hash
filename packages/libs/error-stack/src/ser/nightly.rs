use serde::{Serialize, Serializer};

pub struct SerializeDiagnostic {
    inner: Box<dyn erased_serde::Serialize>,
}

impl Serialize for SerializeDiagnostic {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        self.inner.serialize(serializer)
    }
}

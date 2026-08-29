use figment::{
    Metadata, Profile, Provider,
    error::Error as FigmentError,
    providers::Serialized,
    value::{Dict, Map},
};
use serde_core::Serialize;

/// The programmatic default layer.
pub(crate) struct Defaults<T>(Serialized<T>);

impl<T> Defaults<T> {
    #[track_caller]
    pub(crate) fn new(values: T) -> Self {
        Self(Serialized::defaults(values))
    }
}

impl<T> Provider for Defaults<T>
where
    T: Serialize,
{
    fn metadata(&self) -> Metadata {
        let mut metadata = self.0.metadata();
        // `Serialized` names itself after the Rust type it was handed.
        metadata.name = "defaults".into();
        // Figment's default notation prefixes the profile a key was found under.
        metadata.interpolater(|_profile, keys| keys.join("."))
    }

    fn data(&self) -> Result<Map<Profile, Dict>, FigmentError> {
        self.0.data()
    }
}

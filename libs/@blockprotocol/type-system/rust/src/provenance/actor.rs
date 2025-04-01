use uuid::Uuid;

#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "lowercase")]
pub enum ActorType {
    Human,
    AI,
    Machine,
}

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    Hash,
    serde::Serialize,
    serde::Deserialize,
    derive_more::Display,
)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::ToSql, postgres_types::FromSql),
    postgres(transparent)
)]
#[repr(transparent)]
pub struct ActorEntityUuid(
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "Brand<string, \"ActorEntityUuid\">")
    )]
    Uuid,
);

impl ActorEntityUuid {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }

    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        &self.0
    }

    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        self.0
    }
}

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    Hash,
    serde::Serialize,
    serde::Deserialize,
    derive_more::Display,
)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[repr(transparent)]
pub struct UserId(
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "Brand<ActorEntityUuid, \"UserId\">")
    )]
    ActorEntityUuid,
);

impl UserId {
    #[must_use]
    pub const fn new(uuid: ActorEntityUuid) -> Self {
        Self(uuid)
    }

    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        self.0.as_uuid()
    }

    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        self.0.into_uuid()
    }
}

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    Hash,
    serde::Serialize,
    serde::Deserialize,
    derive_more::Display,
)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[repr(transparent)]
pub struct MachineId(
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "Brand<ActorEntityUuid, \"MachineId\">")
    )]
    ActorEntityUuid,
);

impl MachineId {
    #[must_use]
    pub const fn new(uuid: ActorEntityUuid) -> Self {
        Self(uuid)
    }

    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        self.0.as_uuid()
    }

    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        self.0.into_uuid()
    }
}

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    Hash,
    serde::Serialize,
    serde::Deserialize,
    derive_more::Display,
)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[repr(transparent)]
pub struct AiId(
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "Brand<ActorEntityUuid, \"AiId\">")
    )]
    ActorEntityUuid,
);

impl AiId {
    #[must_use]
    pub const fn new(uuid: ActorEntityUuid) -> Self {
        Self(uuid)
    }

    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        self.0.as_uuid()
    }

    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        self.0.into_uuid()
    }
}

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    Hash,
    serde::Serialize,
    serde::Deserialize,
    derive_more::Display,
)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "type", content = "id", rename_all = "lowercase")]
pub enum ActorId {
    User(UserId),
    Machine(MachineId),
}

impl ActorId {
    #[must_use]
    pub const fn new(actor_type: ActorType, uuid: ActorEntityUuid) -> Self {
        match actor_type {
            ActorType::Human => Self::User(UserId::new(uuid)),
            ActorType::AI | ActorType::Machine => Self::Machine(MachineId::new(uuid)),
        }
    }

    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        match self {
            Self::User(id) => id.as_uuid(),
            Self::Machine(id) => id.as_uuid(),
        }
    }

    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        match self {
            Self::User(id) => id.into_uuid(),
            Self::Machine(id) => id.into_uuid(),
        }
    }
}

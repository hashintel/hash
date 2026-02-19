use alloc::collections::BTreeMap;
use core::fmt;
use std::path::{Path, PathBuf};

use serde::Deserialize;

/// Chip generation definition.
#[derive(Debug)]
pub(crate) struct ChipDef {
    pub plist_name: &'static str,
    pub label: &'static str,
    pub aliases: &'static [&'static str],
}

/// Known Apple Silicon generations.
pub(crate) const CHIPS: &[ChipDef] = &[
    ChipDef {
        plist_name: "a14",
        label: "M1",
        aliases: &["a14"],
    },
    ChipDef {
        plist_name: "a15",
        label: "M2",
        aliases: &["a15"],
    },
    ChipDef {
        plist_name: "a16",
        label: "M3",
        aliases: &["a16", "as1", "as2", "as3"],
    },
    ChipDef {
        plist_name: "as4",
        label: "M4",
        aliases: &["as4", "as4-1", "as4-2"],
    },
    ChipDef {
        plist_name: "as5",
        label: "M5",
        aliases: &["as5", "as5-2"],
    },
];

/// Events renamed across generations that represent the same counter.
pub(crate) const MERGES: &[(&str, &[&str])] =
    &[("ScheduleUop", &["SCHEDULE_UOP", "SCHEDULE_UOP_ANY"])];

#[derive(Deserialize)]
struct PlistRoot {
    system: PlistSystem,
}

#[derive(Deserialize)]
struct PlistSystem {
    cpu: PlistCpu,
}

#[derive(Deserialize)]
struct PlistCpu {
    marketing_name: String,
    fixed_counters: u32,
    config_counters: u32,
    power_counters: u32,
    events: BTreeMap<String, RawEvent>,
    #[serde(default)]
    aliases: BTreeMap<String, String>,
}

#[derive(Deserialize)]
struct RawEvent {
    #[serde(default)]
    number: Option<u16>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    counters_mask: Option<u32>,
    #[serde(default)]
    fixed_counter: Option<u8>,
    #[serde(default)]
    fallback: Option<String>,
}

/// Event data extracted from the database.
#[derive(Debug, Clone)]
pub(crate) struct EventData {
    pub name: String,
    pub description: String,
    pub counters_mask: Option<u32>,
    pub number: Option<u16>,
    pub fixed_counter: Option<u8>,
    pub fallback: Option<String>,
    pub aliases: Vec<String>,
}

/// Per-chip database.
#[derive(Debug)]
pub(crate) struct ChipDatabase {
    pub def: &'static ChipDef,
    pub marketing_name: String,
    pub fixed_counters: u32,
    pub config_counters: u32,
    pub power_counters: u32,
    pub events: Vec<EventData>,
}

#[derive(Debug)]
pub(crate) struct LoadError {
    path: PathBuf,
    error: plist::Error,
}

impl fmt::Display for LoadError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{}: {}", self.path.display(), self.error)
    }
}

impl core::error::Error for LoadError {}

const KPEP_DIR: &str = "/usr/share/kpep";

pub(crate) fn load_all() -> Result<Vec<ChipDatabase>, LoadError> {
    CHIPS.iter().map(load_chip).collect()
}

fn load_chip(def: &'static ChipDef) -> Result<ChipDatabase, LoadError> {
    let path = Path::new(KPEP_DIR).join(format!("{}.plist", def.plist_name));

    let root: PlistRoot = plist::from_file(&path).map_err(|error| LoadError { path, error })?;

    let cpu = root.system.cpu;

    let mut reverse_aliases: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for (alias, event_name) in cpu.aliases {
        reverse_aliases.entry(event_name).or_default().push(alias);
    }

    let mut events: Vec<EventData> = cpu
        .events
        .into_iter()
        .map(|(name, raw)| {
            let aliases = reverse_aliases.remove(&name).unwrap_or_default();
            EventData {
                name,
                description: raw.description.unwrap_or_default(),
                counters_mask: raw.counters_mask,
                number: raw.number,
                fixed_counter: raw.fixed_counter,
                fallback: raw.fallback,
                aliases,
            }
        })
        .collect();

    events.sort_by(|left, right| left.name.cmp(&right.name));

    Ok(ChipDatabase {
        def,
        marketing_name: cpu.marketing_name,
        fixed_counters: cpu.fixed_counters,
        config_counters: cpu.config_counters,
        power_counters: cpu.power_counters,
        events,
    })
}

//! Integration tests for the [`Database`] API.
//!
//! These tests require root privileges because creating a [`Sampler`] force-acquires
//! hardware performance counters.
//!
//! Run with:
//!
//! ```sh
//! sudo -E cargo test --package darwin-kperf --test database -- --ignored --nocapture
//! ```

use darwin_kperf::{Sampler, database::Architecture};

#[test]
#[ignore = "requires root privileges"]
fn database_metadata_is_populated() {
    let sampler = Sampler::new().expect("failed to create sampler");
    let database = sampler.database();

    let name = database.name();
    let cpu_id = database.cpu_id();
    let marketing_name = database.marketing_name();
    let architecture = database.architecture();

    eprintln!("name:           {name}");
    eprintln!("cpu_id:         {cpu_id}");
    eprintln!("marketing_name: {marketing_name}");
    eprintln!("architecture:   {architecture:?}");

    assert!(!name.is_empty(), "database name should not be empty");
    assert!(!cpu_id.is_empty(), "cpu_id should not be empty");
    assert!(
        !marketing_name.is_empty(),
        "marketing_name should not be empty"
    );
    assert_eq!(
        architecture,
        Architecture::Arm64,
        "expected Arm64 on Apple Silicon"
    );
}

#[test]
#[ignore = "requires root privileges"]
fn database_cpu_matches_sampler_cpu() {
    let sampler = Sampler::new().expect("failed to create sampler");
    let database = sampler.database();

    let sampler_cpu = sampler.cpu();
    let database_cpu = database.cpu();

    eprintln!("sampler cpu:  {sampler_cpu:?}");
    eprintln!("database cpu: {database_cpu:?}");
    eprintln!("db name:      {}", database.name());

    assert_eq!(
        Some(sampler_cpu),
        database_cpu,
        "database.cpu() should match sampler.cpu()"
    );
}

#[test]
#[ignore = "requires root privileges"]
fn events_are_non_empty_and_well_formed() {
    let sampler = Sampler::new().expect("failed to create sampler");
    let database = sampler.database();

    let events = database.events();
    eprintln!("\nevents ({} total):", events.len());

    assert!(
        !events.is_empty(),
        "database should contain at least one event"
    );

    for (index, event) in events.iter().enumerate() {
        let name = event.name();
        let alias = event.alias().unwrap_or("-");
        let fallback = event.fallback().unwrap_or("-");
        let description = event.description().unwrap_or("-");

        eprintln!(
            "  [{index:>3}] {name:<45} alias={alias:<15} fallback={fallback:<15} | {description}",
        );

        assert!(!name.is_empty(), "event {index} has an empty name");
    }
}

#[test]
#[ignore = "requires root privileges"]
fn fixed_events_are_populated() {
    let sampler = Sampler::new().expect("failed to create sampler");
    let database = sampler.database();

    let fixed = database.fixed_events();
    eprintln!("fixed events ({}):", fixed.len());

    assert!(
        !fixed.is_empty(),
        "Apple Silicon should have at least one fixed counter"
    );

    for event in fixed {
        let name = event.name();
        let is_fixed = event.is_fixed();
        let description = event.description().unwrap_or("-");

        eprintln!("  {name:<45} is_fixed={is_fixed:<5} | {description}");

        assert!(!name.is_empty(), "fixed event has an empty name");
        assert!(
            is_fixed,
            "event {name} is in fixed_events() but has is_fixed()=false"
        );
    }
}

#[test]
#[ignore = "requires root privileges"]
fn fixed_events_have_known_aliases() {
    let sampler = Sampler::new().expect("failed to create sampler");
    let database = sampler.database();

    let fixed = database.fixed_events();

    // Apple Silicon always has at least "Instructions" and "Cycles" as fixed
    // counter aliases.
    let aliases: Vec<&str> = fixed.iter().filter_map(|event| event.alias()).collect();

    eprintln!("fixed event aliases: {aliases:?}");

    assert!(
        aliases.iter().any(|alias| alias.contains("Instruction")),
        "expected a fixed event with an Instructions alias, got: {aliases:?}"
    );
    assert!(
        aliases.iter().any(|alias| alias.contains("Cycle")),
        "expected a fixed event with a Cycles alias, got: {aliases:?}"
    );
}

#[test]
#[ignore = "requires root privileges"]
fn inspect_database() {
    let sampler = darwin_kperf::Sampler::new().expect("failed to create sampler");
    let database = sampler.database();

    eprintln!("name:           {}", database.name());
    eprintln!("cpu_id:         {}", database.cpu_id());
    eprintln!("marketing_name: {}", database.marketing_name());
    eprintln!("architecture:   {:?}", database.architecture());

    let events = database.events();
    eprintln!("\nevents ({} total):", events.len());
    for (idx, event) in events.iter().enumerate() {
        let name = event.name();
        let alias = event.alias().unwrap_or("-");
        let fallback = event.fallback().unwrap_or("-");
        let description = event.description().unwrap_or("-");
        eprintln!(
            "  [{idx:>2}] {name:<45} alias={alias:<15} fallback={fallback:<15} | {description}",
        );
    }

    let fixed = database.fixed_events();
    eprintln!("\nfixed events ({}):", fixed.len());
    for event in fixed {
        let name = event.name();
        let description = event.description().unwrap_or("-");
        eprintln!("  {name} \u{2014} {description}");
    }
}

/// Enumerates all events with their `is_fixed` flag.
#[test]
#[ignore = "requires root privileges"]
fn probe_kpep_event_tail() {
    let sampler = darwin_kperf::Sampler::new().expect("failed to create sampler");
    let database = sampler.database();

    let events = database.events();
    eprintln!("\nevents ({} total):", events.len());
    for (idx, event) in events.iter().enumerate() {
        let name = event.name();
        let description = event.description().unwrap_or("-");
        let is_fixed = event.is_fixed();
        eprintln!("  [{idx:>2}] {name:<45} fixed={is_fixed:<5} | {description}");
    }
}

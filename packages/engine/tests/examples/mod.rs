use crate::run_test;

// https://core.hash.ai/@hash/city-infection-model/6.4.2
mod city_infection_model {
    use crate::run_test;

    run_test!(city_infection_model, experiment: infected_linspace, #[ignore = "unimplemented: Rust behaviors are currently not supported"]);
    run_test!(city_infection_model, experiment: duration_range_monte_carlo, #[ignore = "unimplemented: Rust behaviors are currently not supported"]);
}

// https://core.hash.ai/@hash/sugarscape/7.5.0
mod sugarscape {
    use crate::run_test;

    run_test!(sugarscape, experiment: initial_sugar_linear_sweep, #[ignore = "unimplemented: Rust behaviors are currently not supported"]);
    run_test!(sugarscape, experiment: agent_density_linspace, #[ignore = "unimplemented: Rust behaviors are currently not supported"]);
}

run_test!(published_display_behaviors);

// https://core.hash.ai/@hash/boids-3d/6.1.0
mod boids_3d {
    use crate::run_test;

    run_test!(boids_3d, experiment: cohesion_arange);
    run_test!(boids_3d, experiment: agent_count_value);
    run_test!(boids_3d, experiment: sweep_flocks);
}

// https://core.hash.ai/@hash/model-market/4.5.2
mod model_market {
    use crate::run_test;

    run_test!(model_market, experiment: startup_rate, #[ignore = "unimplemented: Rust behaviors are currently not supported"]);
    run_test!(model_market, experiment: max_price_arange, #[ignore = "unimplemented: Rust behaviors are currently not supported"]);
    run_test!(model_market, experiment: min_price_arange, #[ignore = "unimplemented: Rust behaviors are currently not supported"]);
    run_test!(model_market, experiment: max_cost_arange, #[ignore = "unimplemented: Rust behaviors are currently not supported"]);
    run_test!(model_market, experiment: min_cost_arange, #[ignore = "unimplemented: Rust behaviors are currently not supported"]);
}

// https://core.hash.ai/@hash/wildfires-regrowth/9.8.0
mod wildfire_regrowth {
    use crate::run_test;

    run_test!(wildfire_regrowth, experiment: test_experiment, #[ignore = "unimplemented: Rust behaviors are currently not supported"]);
    run_test!(wildfire_regrowth, experiment: lightning_chance_linspace, #[ignore = "unimplemented: Rust behaviors are currently not supported"]);
}

// https://core.hash.ai/@hash/ant-foraging/7.4.0
mod ant_foraging {
    use crate::run_test;

    run_test!(ant_foraging, experiment: number_of_ants_arange, #[ignore = "unimplemented: Rust behaviors are currently not supported"]);
    run_test!(ant_foraging, experiment: decay_rate_arange, #[ignore = "unimplemented: Rust behaviors are currently not supported"]);
    run_test!(ant_foraging, experiment: diffusion_rate_arange, #[ignore = "unimplemented: Rust behaviors are currently not supported"]);
}

// https://core.hash.ai/@hash/virus-mutation-and-drug-resistance/3.5.0
mod virus_mutation_and_drug_resistance {
    use crate::run_test;

    run_test!(virus_mutation_and_drug_resistance, experiment: mutation_linspace, #[ignore = "unimplemented: Rust behaviors are currently not supported"]);
    run_test!(virus_mutation_and_drug_resistance, experiment: vaccination_linspace, #[ignore = "unimplemented: Rust behaviors are currently not supported"]);
}

// https://core.hash.ai/@hash/virus-mutation-and-drug-resistance/3.5.0
mod warehouse_logistics {
    use crate::run_test;

    run_test!(warehouse_logistics, experiment: alternate_layout);
}

// https://core.hash.ai/@hash/rainfall/7.2.2
mod rainfall {
    use crate::run_test;

    run_test!(rainfall, experiment: sweep_rain_rate, #[ignore = "unimplemented: Rust behaviors are currently not supported"]);
}

// https://core.hash.ai/@hash/rumor-mill-public-health-practices/2.2.3
mod rumor_mill_public_health_practices {
    use crate::run_test;

    run_test!(
        rumor_mill_public_health_practices,
        experiment: good_psa_freq_log_normal
    );
}

// https://core.hash.ai/@hash/connection-example/1.1.1
mod connection_example {
    use crate::run_test;

    run_test!(connection_example, experiment: sweep_values);
}

// https://core.hash.ai/@hash/interconnected-call-center/3.2.1
mod interconnected_call_center {
    use crate::run_test;

    // Bug: https://app.asana.com/0/1201707629991362/1201756436717252/f
    run_test!(interconnected_call_center, experiment: call_time_linspace, #[ignore = "bug: Unused non-nullable behavior keys"]);
    // Bug: https://app.asana.com/0/1201707629991362/1201756436717252/f
    run_test!(interconnected_call_center, experiment: call_time_arange, #[ignore = "bug: Unused non-nullable behavior keys"]);
}

// https://core.hash.ai/@hash/air-defense-system/1.3.1
mod air_defense_system {
    use crate::run_test;

    run_test!(air_defense_system, experiment: radar_zone_arange);
    run_test!(air_defense_system, experiment: missile_speed_arange);
    run_test!(air_defense_system, experiment: radar_max_missiles_arange);
    run_test!(air_defense_system, experiment: radar_location_values);
}

// https://core.hash.ai/@hash/city-infection-model-with-vaccine/1.0.3
run_test!(city_infection_model_with_vaccine, #[ignore = "unimplemented: Rust behaviors are currently not supported"]);

// https://core.hash.ai/@hash/wholesale-warehouse1/1.1.1
run_test!(wholesale_warehouse1);

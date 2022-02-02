use crate::run_test;

// https://core.hash.ai/@hash/interconnected-call-center/3.2.1
mod interconnected_call_center {
    use crate::run_test;

    // Bug: https://app.asana.com/0/1201707629991362/1201756436717252/f
    run_test!(interconnected_call_center, experiment: call_time_linspace, #[ignore]);
    // Bug: https://app.asana.com/0/1201707629991362/1201756436717252/f
    run_test!(interconnected_call_center, experiment: call_time_arange, #[ignore]);
}

// https://core.hash.ai/@hash/air-defense-system/1.3.1
mod air_defense_system {
    use crate::run_test;

    run_test!(air_defense_system, experiment: radar_zone_arange);
    run_test!(air_defense_system, experiment: missile_speed_arange);
    run_test!(air_defense_system, experiment: radar_max_missiles_arange);
    run_test!(air_defense_system, experiment: radar_location_values);
}

// https://core.hash.ai/@hash/city-infection-model-with-vaccine/main at 2022-02-02
// Rust behavior is currently not supported
run_test!(city_infection_model_with_vaccine, #[ignore]);

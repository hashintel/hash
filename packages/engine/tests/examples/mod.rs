mod city_infection_model {
    use crate::run_test;

    // https://core.hash.ai/@hash/city-infection-model/6.4.2
    run_test!(city_infection_model, experiment: infected_linspace);
    run_test!(city_infection_model, experiment: duration_range_monte_carlo);
}

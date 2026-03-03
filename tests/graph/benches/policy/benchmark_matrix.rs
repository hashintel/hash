use core::str::FromStr as _;

use criterion::{BenchmarkId, Criterion};
use hash_graph_authorization::policies::{
    action::ActionName,
    principal::actor::AuthenticatedActor,
    store::{PolicyStore as _, PrincipalStore as _, ResolvePoliciesParams},
};
use hash_graph_postgres_store::store::AsClient as _;
use hash_graph_store::migration::StoreMigration as _;
use type_system::principal::actor::ActorId;

use crate::{
    seed::{BenchmarkData, SeedConfig, seed_benchmark_data},
    util::{StoreWrapper, setup, setup_subscriber},
};

/// User configuration for benchmarks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum UserType {
    System,
    Empty,
    Seeded,
}

impl UserType {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::System => "system",
            Self::Empty => "empty",
            Self::Seeded => "seeded",
        }
    }
}

/// Data seeding levels.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SeedLevel {
    None,
    Small,
    Medium,
    Large,
    #[expect(
        dead_code,
        reason = "https://linear.app/hash/issue/BE-186/improve-seeding-performance-for-policies"
    )]
    ExtraLarge,
}

impl SeedLevel {
    pub const fn to_seed_config(self) -> Option<SeedConfig> {
        match self {
            Self::None => None,
            Self::Small => Some(SeedConfig::small()),
            Self::Medium => Some(SeedConfig::medium()),
            Self::Large => Some(SeedConfig::large()),
            Self::ExtraLarge => Some(SeedConfig::extra_large()),
        }
    }

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Small => "small",
            Self::Medium => "medium",
            Self::Large => "large",
            Self::ExtraLarge => "extra_large",
        }
    }
}

/// Action combinations to test query patterns.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ActionSelectivity {
    /// High selectivity - many policies match, query needs good optimization.
    High,
    /// Medium selectivity - moderate number of policies match.
    Medium,
    /// Low selectivity - few policies match, simpler queries.
    Low,
}

impl ActionSelectivity {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::High => "high",
            Self::Medium => "medium",
            Self::Low => "low",
        }
    }

    pub fn to_actions(self) -> Vec<ActionName> {
        match self {
            Self::High => vec![ActionName::ViewEntity, ActionName::CreateEntity],
            Self::Medium => vec![ActionName::UpdateEntity],
            Self::Low => vec![ActionName::ViewEntityType],
        }
    }
}

/// Complete benchmark configuration.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct BenchConfig {
    pub user: UserType,
    pub seed: SeedLevel,
    pub action_selectivity: ActionSelectivity,
}

/// Benchmark matrix definition.
pub struct BenchmarkMatrix {
    pub users: Vec<UserType>,
    pub seeds: Vec<SeedLevel>,
    pub actions: Vec<ActionSelectivity>,
}

impl BenchmarkMatrix {
    /// Generate all possible combinations.
    pub fn generate_configs(&self) -> Vec<BenchConfig> {
        let mut configs = Vec::new();

        for &user in &self.users {
            for &seed in &self.seeds {
                for actions in &self.actions {
                    // Skip invalid combinations
                    if user == UserType::Seeded && seed == SeedLevel::None {
                        continue; // Can't have seeded user without data
                    }

                    configs.push(BenchConfig {
                        user,
                        seed,
                        action_selectivity: *actions,
                    });
                }
            }
        }

        configs
    }

    /// Full matrix for comprehensive benchmarking.
    pub fn full() -> Self {
        Self {
            users: vec![UserType::System, UserType::Empty, UserType::Seeded],
            seeds: vec![
                SeedLevel::None,
                SeedLevel::Small,
                SeedLevel::Medium,
                SeedLevel::Large,
                // TODO: improve seeding performance to enable extra large benchmarks
                //   see https://linear.app/hash/issue/BE-186/improve-seeding-performance-for-policies
                // SeedLevel::ExtraLarge,
            ],
            actions: vec![
                ActionSelectivity::High,
                ActionSelectivity::Medium,
                ActionSelectivity::Low,
            ],
        }
    }
}

/// Get the actor ID for the given user config.
fn get_test_actor(
    user_type: UserType,
    system_actor_id: ActorId,
    benchmark_data: Option<&BenchmarkData>,
) -> ActorId {
    match user_type {
        UserType::System => system_actor_id,
        UserType::Empty => {
            ActorId::User(type_system::principal::actor::UserId::new(uuid::Uuid::nil()))
        }
        UserType::Seeded => benchmark_data
            .and_then(|data| data.get_test_user(0))
            .expect("Seeded user requested but no benchmark data available"),
    }
}

/// Run benchmark matrix.
pub fn run_benchmark_matrix(crit: &mut Criterion, matrix: &BenchmarkMatrix) {
    let configs = matrix.generate_configs();

    // Group configs by seed level to avoid duplicate seeding
    let mut by_seed_level = std::collections::HashMap::new();
    for config in configs {
        by_seed_level
            .entry(config.seed)
            .or_insert_with(Vec::new)
            .push(config);
    }

    for (seed_level, seed_configs) in by_seed_level {
        eprintln!(
            "Setting up seed level: {:?} for {} configurations",
            seed_level,
            seed_configs.len()
        );
        run_benchmark_seed_group(crit, seed_level, seed_configs);
    }
}

/// Run all benchmark configs for a single seed level (shared seeding).
fn run_benchmark_seed_group(
    crit: &mut Criterion,
    seed_level: SeedLevel,
    configs: Vec<BenchConfig>,
) {
    let account_id = type_system::principal::actor::ActorEntityUuid::new(
        uuid::Uuid::from_str("bf5a9ef5-dc3b-43cf-a291-6210c0321eba").expect("invalid uuid"),
    );

    // Use seed level as DB name to share across configs
    let db_name = format!("bench_shared_{}", seed_level.as_str());
    let (runtime, mut store_wrapper) = setup(&db_name, false, true, account_id);

    // Setup and seed once for all configs with this seed level
    let (system_actor_id, benchmark_data) = runtime.block_on(async {
        let benchmark_data = setup_benchmark_for_seed(seed_level, &mut store_wrapper).await;
        let system_account = store_wrapper
            .store
            .get_or_create_system_machine("h")
            .await
            .expect("could not read system account");
        (ActorId::from(system_account), benchmark_data)
    });

    // Now run all configs that use this seed level
    let group_name = format!("policy_resolution_{}", seed_level.as_str());
    for config in configs {
        let mut group = crit.benchmark_group(&group_name);

        let test_actor = get_test_actor(config.user, system_actor_id, benchmark_data.as_ref());
        let actions = config.action_selectivity.to_actions();

        let policy_count = runtime.block_on(async {
            let params = ResolvePoliciesParams {
                actions: actions.clone().into(),
            };
            store_wrapper
                .store
                .resolve_policies_for_actor(AuthenticatedActor::Id(test_actor), params)
                .await
                .expect("Policy resolution failed")
                .len()
        });
        assert!(
            policy_count > 0,
            "Seeded user should have policies! Seed level: {}, Actor: {:?}, Policy count: {}",
            config.seed.as_str(),
            config.user.as_str(),
            policy_count
        );

        let bench_id = format!(
            "user: {}, selectivity: {}, policies: {}",
            config.user.as_str(),
            config.action_selectivity.as_str(),
            policy_count
        );
        group.bench_with_input(
            BenchmarkId::new("resolve_policies_for_actor", &bench_id),
            &(&test_actor, &actions),
            |bencher, &(test_actor, actions)| {
                let _guard = setup_subscriber(
                    &group_name,
                    Some("resolve_policies_for_actor"),
                    Some(&bench_id),
                );

                bencher.iter(|| {
                    runtime.block_on(async {
                        let params = ResolvePoliciesParams {
                            actions: actions.clone().into(),
                        };

                        store_wrapper
                            .store
                            .resolve_policies_for_actor(AuthenticatedActor::Id(*test_actor), params)
                            .await
                            .expect("Policy resolution failed")
                    })
                });
            },
        );

        group.finish();
    }
}

/// Setup database and return benchmark data for a specific seed level.
async fn setup_benchmark_for_seed(
    seed_level: SeedLevel,
    store_wrapper: &mut StoreWrapper,
) -> Option<BenchmarkData> {
    // 1. Setup database
    store_wrapper
        .store
        .run_migrations()
        .await
        .expect("could not run migrations");

    store_wrapper
        .store
        .seed_system_policies()
        .await
        .expect("could not seed system policies");

    let system_account = store_wrapper
        .store
        .get_or_create_system_machine("h")
        .await
        .expect("could not read system account");
    let system_actor_id = ActorId::from(system_account);

    // 2. Seed data if needed
    let data = if let Some(seed_config) = seed_level.to_seed_config() {
        let data = seed_benchmark_data(&mut store_wrapper.store, system_actor_id, &seed_config)
            .await
            .expect("could not seed benchmark data");
        Some(data)
    } else {
        None
    };

    // 3. Update table statistics so the query planner has accurate row counts. Without this,
    //    autoanalyze may or may not have run before benchmarks start (depending on HashMap
    //    iteration order of seed levels), causing wildly different query plans and up to ~80%
    //    variance between runs.
    store_wrapper
        .store
        .as_client()
        .batch_execute(
            "ANALYZE principal, actor, actor_group, actor_role, role, team, team_hierarchy, \
             policy_edition, policy_action",
        )
        .await
        .expect("could not analyze tables");

    data
}

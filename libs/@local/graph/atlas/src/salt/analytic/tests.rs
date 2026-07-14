use super::*;

#[test]
fn exact_isolated_peaks_have_floor_deaths() {
    let mut density = vec![0.0; 16 * 16];
    density[4 * 16 + 4] = 1.0;
    density[10 * 16 + 10] = 0.8;
    let raster = DensityRaster::from_values(16, density);

    let tree = merge_tree(
        &raster,
        MergeTreeConfig {
            floor_fraction: 0.005,
            persistence_fraction: 0.05,
        },
    )
    .expect("finite density should sweep");

    assert_eq!(
        tree.leaves(),
        &[
            PersistenceLeaf {
                birth: 1.0,
                death: 0.005
            },
            PersistenceLeaf {
                birth: 0.8,
                death: 0.005
            }
        ]
    );
    let expected = (1.0 - 0.005) + (0.8 - 0.005);
    assert!((tree.total_persistence() - expected).abs() <= f64::EPSILON);
    assert!((tree.normalized_persistence() - expected).abs() <= f64::EPSILON);
}

#[test]
fn saddle_persistence_controls_whether_the_younger_peak_survives() {
    let mut density = vec![0.0; 5 * 5];
    density[2 * 5 + 1] = 0.52;
    density[2 * 5 + 2] = 0.45;
    density[2 * 5 + 3] = 0.50;
    let raster = DensityRaster::from_values(5, density);
    let counted = merge_tree(
        &raster,
        MergeTreeConfig {
            floor_fraction: 0.01,
            persistence_fraction: 0.05,
        },
    )
    .expect("ridge should sweep");
    let filtered = merge_tree(
        &raster,
        MergeTreeConfig {
            floor_fraction: 0.01,
            persistence_fraction: 0.20,
        },
    )
    .expect("ridge should sweep");

    assert!(counted.leaves().contains(&PersistenceLeaf {
        birth: 0.50,
        death: 0.45
    }));
    assert_eq!(counted.leaves().len(), 2);
    assert_eq!(filtered.leaves().len(), 1);
}

#[test]
fn extent_relative_raster_is_invariant_to_uniform_scaling() {
    let points = [
        point([-2.0, 1.0], 1.0),
        point([0.0, 2.0], 2.0),
        point([3.0, -4.0], 0.5),
        point([1.0, 0.5], 4.0),
    ];
    let scaled = points.map(|point| AnalyticPoint {
        coordinate: [point.coordinate[0] * 0.01, point.coordinate[1] * 0.01],
        mass: point.mass,
    });
    let config = RasterConfig {
        grid_size: 32,
        bandwidth_pixels: 1.5,
    };

    let original = density_raster(&points, config).expect("original raster should build");
    let contracted = density_raster(&scaled, config).expect("scaled raster should build");

    for (&original, &contracted) in original.values().iter().zip(contracted.values()) {
        assert!((original - contracted).abs() <= 1.0e-12);
    }
    let input_mass = points.iter().map(|point| point.mass).sum::<f64>();
    let raster_mass = original.values().iter().sum::<f64>();
    assert!((raster_mass - input_mass).abs() <= 1.0e-10);
}

#[test]
fn all_zero_mass_has_no_persistent_components() {
    let raster = density_raster(
        &[point([1.0, 1.0], 0.0)],
        RasterConfig {
            grid_size: 8,
            bandwidth_pixels: 1.0,
        },
    )
    .expect("zero mass is valid");
    let tree = merge_tree(&raster, MergeTreeConfig::default())
        .expect("zero density should produce an empty tree");

    assert!(tree.leaves().is_empty());
    assert_eq!(tree.density_maximum(), 0.0);
    assert_eq!(tree.normalized_persistence(), 0.0);
}

#[inline]
const fn point(coordinate: [f64; 2], mass: f64) -> AnalyticPoint {
    AnalyticPoint { coordinate, mass }
}

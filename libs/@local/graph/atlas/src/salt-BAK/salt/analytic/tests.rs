use super::*;

#[test]
fn empty_analytics_preserve_the_complete_artifact_schema() {
    let raster = density_raster(
        &[],
        RasterConfig {
            grid_size: 8,
            bandwidth_pixels: 1.0,
        },
    )
    .expect("empty density raster should build");
    let tree =
        merge_tree(&raster, MergeTreeConfig::default()).expect("empty merge tree should build");
    let regions = density_regions(
        &raster,
        &tree,
        &[],
        RegionConfig {
            density_floor_fraction: 0.1,
            minimum_peak_fraction: 0.2,
            maximum_regions: 4,
        },
    )
    .expect("empty region map should build");
    let directory = tempfile::tempdir().expect("temporary directory should create");
    let path = camino::Utf8Path::from_path(directory.path())
        .expect("temporary directory should be UTF-8")
        .join("analytic.atlas");
    let published = publish_analytic_artifact(
        &path,
        crate::salt::hash::ContentHash::digest(b"empty-analytic-config"),
        &raster,
        &tree,
        &regions,
        &[],
    )
    .expect("empty analytic artifact should publish");

    assert_eq!(published.header.section_count, 20);
}

#[test]
fn raster_rejects_an_overflowing_finite_extent() {
    let error = density_raster(
        &[point([-f64::MAX, 0.0], 1.0), point([f64::MAX, 1.0], 1.0)],
        RasterConfig {
            grid_size: 8,
            bandwidth_pixels: 1.0,
        },
    )
    .expect_err("an unrepresentable normalization extent must be rejected");

    assert!(matches!(
        error,
        AnalyticError::NonFiniteExtent { axis: 0, .. }
    ));
}

#[test]
fn raster_rejects_a_grid_above_the_bounded_working_set() {
    let error = density_raster(
        &[],
        RasterConfig {
            grid_size: 2_049,
            bandwidth_pixels: 1.0,
        },
    )
    .expect_err("an oversized raster must fail before allocation");

    assert!(matches!(
        error,
        AnalyticError::GridTooLarge {
            size: 2_049,
            maximum: 2_048
        }
    ));
}

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
                id: 0,
                parent: None,
                representative_pixel: 4 * 16 + 4,
                birth: 1.0,
                death: 0.005
            },
            PersistenceLeaf {
                id: 1,
                parent: None,
                representative_pixel: 10 * 16 + 10,
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

    let younger = counted
        .leaves()
        .iter()
        .find(|leaf| leaf.birth == 0.50 && leaf.death == 0.45)
        .expect("persistent younger peak should be retained");
    assert_eq!(younger.parent, Some(1));
    assert_eq!(younger.representative_pixel, 2 * 5 + 3);
    assert_eq!(counted.leaves().len(), 2);
    assert_eq!(filtered.leaves().len(), 1);

    let regions = density_regions(
        &raster,
        &counted,
        &[],
        RegionConfig {
            density_floor_fraction: 0.01,
            minimum_peak_fraction: 0.05,
            maximum_regions: 2,
        },
    )
    .expect("persistent saddle topology should map to regions");
    assert_eq!(regions.leaf_regions(), &[1, 0]);
    assert_eq!(regions.peaks()[1].parent_region, Some(0));
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

#[test]
fn watershed_assigns_separated_points_to_density_ordered_peaks() {
    let mut density = vec![0.0; 7 * 7];
    density[1 * 7 + 3] = 1.0;
    density[2 * 7 + 3] = 0.6;
    density[4 * 7 + 3] = 0.5;
    density[5 * 7 + 3] = 0.8;
    let raster = DensityRaster::from_values(7, density);
    let tree = merge_tree(
        &raster,
        MergeTreeConfig {
            floor_fraction: 0.1,
            persistence_fraction: 0.05,
        },
    )
    .expect("separated finite basins should have persistent peaks");

    let regions = density_regions(
        &raster,
        &tree,
        &[[0.2, 0.5], [0.8, 0.5]],
        RegionConfig {
            density_floor_fraction: 0.1,
            minimum_peak_fraction: 0.2,
            maximum_regions: 2,
        },
    )
    .expect("separated finite basins should partition");

    assert_eq!(regions.peaks()[0].pixel, 1 * 7 + 3);
    assert_eq!(regions.peaks()[1].pixel, 5 * 7 + 3);
    assert_eq!(regions.point_regions(), &[0, 1]);
    assert_eq!(regions.pixel_regions()[3 * 7 + 3], u32::MAX);

    let labels = select_region_labels(
        &regions,
        [
            label_candidate(0, 2, 0.4, "Secondary"),
            label_candidate(0, 1, 0.4, "Primary"),
            label_candidate(1, 3, 0.9, "Independent"),
        ],
    )
    .expect("valid candidates should label occupied regions");
    let primary = labels
        .iter()
        .find(|label| label.region == 0)
        .expect("first region should be labeled");
    assert_eq!(primary.row, row(1));
    assert_eq!(primary.text, "Primary");
    let independent = labels
        .iter()
        .find(|label| label.region == 1)
        .expect("second region should be labeled");
    assert_eq!(independent.text, "Independent");
}

#[inline]
fn label_candidate(
    point: usize,
    row: u32,
    importance: f64,
    text: &str,
) -> RegionLabelCandidate<'_> {
    RegionLabelCandidate {
        point,
        row: self::row(row),
        importance,
        text,
    }
}

#[inline]
fn row(value: u32) -> crate::salt::identity::GenerationRowId {
    crate::salt::identity::GenerationRowId::try_from(value).expect("row should fit")
}

#[inline]
const fn point(coordinate: [f64; 2], mass: f64) -> AnalyticPoint {
    AnalyticPoint { coordinate, mass }
}

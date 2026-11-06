# /// script
# requires-python = ">=3.9"
# dependencies = ["defusedxml==0.7.1"]
# ///
"""Check SVG safety, mono contrast and geographic-market validation."""
import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from defusedxml.common import DTDForbidden

spec = importlib.util.spec_from_file_location(
    "generate_integration_icons", Path(__file__).with_name("generate-integration-icons.py")
)
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)

svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2Z"/></svg>'


class SvgParsingTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.source = Path(self.directory.name)
        self.mark = self.source / "artwork/example/mark.svg"
        self.mark.parent.mkdir(parents=True)
        self.tile = self.source / "app-tile/light.svg"
        self.tile.parent.mkdir(parents=True)
        self.source_patch = patch.object(generator, "source", self.source)
        self.source_patch.start()
        self.addCleanup(self.source_patch.stop)

    def test_valid_svg_keeps_geometry(self):
        self.mark.write_text(svg)
        self.tile.write_text(svg)
        mark = generator.themed_artwork({"slug": "example"}, "mark", False)
        tile = generator.app_tile(False)
        self.assertEqual(mark.get("viewBox"), "0 0 24 24")
        self.assertEqual(mark[0].get("d"), "M2 2h20v20H2Z")
        self.assertEqual(tile[0].get("d"), mark[0].get("d"))

    def test_attribution_survives_mark_and_tile_generation(self):
        self.mark.write_text(svg)
        self.tile.write_text(svg)
        attribution = "Copyright Example; CC BY 4.0"
        brand = {"slug": "example", "ratio": 2, "alignment": "center", "artworkAttribution": attribution}
        for variant in ("mark-light", "app-light"):
            with self.subTest(variant=variant):
                generated = generator.variant_svg(brand, variant)
                self.assertIn(f"<!--{attribution}-->", generated)
                document = generator.ET.fromstring(generated, forbid_dtd=True)
                self.assertEqual(document.get("viewBox"), "0 0 64 64")

    def test_both_parsers_reject_document_types_and_entities(self):
        documents = [
            '<!DOCTYPE svg SYSTEM "https://example.invalid/artwork.dtd">' + svg,
            '<!DOCTYPE svg [<!ENTITY content "expanded">]><svg>&content;</svg>',
            '<!DOCTYPE svg [<!ENTITY content SYSTEM "file:///etc/passwd">]><svg>&content;</svg>',
        ]
        for document in documents:
            with self.subTest(document=document):
                self.mark.write_text(document)
                self.tile.write_text(document)
                with self.assertRaises(DTDForbidden):
                    generator.themed_artwork({"slug": "example"}, "mark", False)
                with self.assertRaises(DTDForbidden):
                    generator.app_tile(False)

    def test_mono_app_keeps_tile_outside_filter_and_uses_light_mark(self):
        self.mark.write_text(svg.replace('<path ', '<path fill="#0055AA" '))
        self.mark.with_name("mark-dark.svg").write_text(svg.replace('<path ', '<path fill="white" '))
        self.tile.write_text(svg)
        self.tile.with_name("dark.svg").write_text(svg)
        brand = {"slug": "example", "ratio": 2, "alignment": "start", "appViewBox": "0 -2 24 28"}
        for theme in ("light", "dark"):
            document = generator.ET.fromstring(generator.variant_svg(brand, f"app-mono-{theme}"), forbid_dtd=True)
            self.assertEqual(document.get("color"), "#FFFFFF" if theme == "dark" else "#000000")
            self.assertIsNone(document[0].get("filter"))
            artwork = document.find(f'.//{generator.svg_ns}g[@filter]')
            mark = artwork.find(f'.//{generator.svg_ns}svg')
            self.assertEqual(mark.get("x"), "0")
            self.assertEqual(mark.get("viewBox"), "0 -2 24 28")
            self.assertEqual(mark.find(f'{generator.svg_ns}path').get("fill"), "#0055AA")


class MonoContrastTests(unittest.TestCase):
    def alpha(self, artwork, rgb):
        matrix = generator.mono_alpha_matrix(generator.ET.fromstring(artwork, forbid_dtd=True))
        row = [float(value) for value in matrix.split()][15:]
        return sum(channel * coefficient for channel, coefficient in zip((*rgb, 1, 1), row))

    def test_colored_mark_reaches_full_ink_and_white_is_transparent(self):
        artwork = '<svg fill="#006FCF"><defs><clipPath id="clip"><path fill="black"/></clipPath></defs><path/><path fill="white"/></svg>'
        self.assertAlmostEqual(self.alpha(artwork, (0, 111 / 255, 207 / 255)), 1)
        self.assertAlmostEqual(self.alpha(artwork, (1, 1, 1)), 0)

    def test_referenced_gradient_keeps_intermediate_tones(self):
        artwork = '<svg><defs><linearGradient id="base"><stop stop-color="#5921b8"/><stop offset="1" stop-color="#2fabff"/></linearGradient><linearGradient id="gradient" href="#base"/><filter id="shadow"><path fill="black"/></filter></defs><path fill="url(#gradient)"/><path fill="white"/></svg>'
        self.assertAlmostEqual(self.alpha(artwork, (89 / 255, 33 / 255, 184 / 255)), 1)
        self.assertGreater(self.alpha(artwork, (47 / 255, 171 / 255, 1)), 0)
        self.assertLess(self.alpha(artwork, (47 / 255, 171 / 255, 1)), 1)
        self.assertAlmostEqual(self.alpha(artwork, (1, 1, 1)), 0)

    def test_white_only_artwork_keeps_its_silhouette(self):
        self.assertEqual(self.alpha('<svg fill="white"><path/></svg>', (1, 1, 1)), 1)

    def test_referenced_symbols_contribute_their_visible_colors(self):
        artwork = '<svg fill="white"><use href="#mark"/><symbol id="mark"><path fill="#006FCF"/><path/></symbol></svg>'
        self.assertAlmostEqual(self.alpha(artwork, (0, 111 / 255, 207 / 255)), 1)
        self.assertAlmostEqual(self.alpha(artwork, (1, 1, 1)), 0)


class GeographicMarketTests(unittest.TestCase):
    def setUp(self):
        self.brands = [{"name": "example"}, {"name": "genericApp"}]
        self.profile = {
            "scope": "country",
            "basis": "service-footprint",
            "primaryCountries": ["GB"],
            "countries": ["GB"],
            "regions": ["Europe"],
            "countryCoverage": "partial",
            "localities": [],
            "assessment": "provisional",
            "assessedOn": "2026-11-06",
            "verifiedOn": None,
            "temporalContext": "current",
            "notes": "UK service core; individual service areas need verification.",
            "sources": [],
            "referenceUrls": ["https://example.com/"],
        }
        self.markets = {"example": self.profile, "genericApp": None}

    def test_complete_catalogue_validates_without_mutating_dates(self):
        brands = json.loads((generator.source / "brands.json").read_text())
        markets = json.loads((generator.source / "geographic-markets.json").read_text())
        original = copy.deepcopy(markets)
        generator.validate_geographic_markets(brands, markets)
        self.assertEqual(markets, original)

    def test_requires_exact_identity_coverage_and_an_empty_generic_fallback(self):
        for markets in ({"genericApp": None}, {**self.markets, "extra": self.profile}, {"example": self.profile, "genericApp": self.profile}):
            with self.subTest(markets=markets), self.assertRaises(ValueError):
                generator.validate_geographic_markets(self.brands, markets)

    def test_country_codes_and_primary_markets_must_be_consistent(self):
        for update in ({"countries": ["UK"]}, {"primaryCountries": ["US"]}, {"countries": ["GB", "GB"]}, {"countries": ["GB", "ZZ"]}, {"countryCoverage": "not-enumerated"}):
            with self.subTest(update=update), self.assertRaises(ValueError):
                generator.validate_geographic_markets(self.brands, {**self.markets, "example": {**self.profile, **update}})

    def test_unknown_reach_asserts_no_geography(self):
        profile = {**self.profile, "scope": "unknown", "assessment": "unknown", "countries": [], "primaryCountries": [], "regions": [], "countryCoverage": "not-enumerated"}
        generator.validate_geographic_markets(self.brands, {**self.markets, "example": profile})
        for update in ({"regions": ["Europe"]}, {"assessment": "provisional"}, {"countries": ["GB"], "countryCoverage": "partial"}):
            with self.subTest(update=update), self.assertRaises(ValueError):
                generator.validate_geographic_markets(self.brands, {**self.markets, "example": {**profile, **update}})

    def test_verified_assessments_need_dated_evidence_not_just_a_reference_link(self):
        for update in ({"assessment": "source-supported"}, {"assessment": "source-supported", "verifiedOn": "2026-11-06"}, {"verifiedOn": "2026-11-06"}, {"assessedOn": "2026-02-30"}):
            with self.subTest(update=update), self.assertRaises(ValueError):
                generator.validate_geographic_markets(self.brands, {**self.markets, "example": {**self.profile, **update}})
        profile = {**self.profile, "assessment": "source-supported", "verifiedOn": "2026-11-06", "sources": [{"url": "https://example.com/markets", "checkedOn": "2026-11-06", "summary": "The service lists its UK operations."}]}
        generator.validate_geographic_markets(self.brands, {**self.markets, "example": profile})

    def test_local_scope_and_related_identity_are_checked(self):
        for update in ({"scope": "local"}, {"localities": [{"country": "US", "name": "London"}]}, {"relatedBrand": "missing"}, {"relatedBrand": "example"}, {"relatedBrand": "genericApp"}):
            with self.subTest(update=update), self.assertRaises(ValueError):
                generator.validate_geographic_markets(self.brands, {**self.markets, "example": {**self.profile, **update}})


if __name__ == "__main__":
    unittest.main()

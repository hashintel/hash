# /// script
# requires-python = ">=3.9"
# dependencies = ["defusedxml==0.7.1"]
# ///
"""Check that SVG generation rejects document types and entity expansion."""
import importlib.util
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


if __name__ == "__main__":
    unittest.main()

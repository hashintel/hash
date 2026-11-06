# /// script
# requires-python = ">=3.9"
# dependencies = ["defusedxml==0.7.1"]
# ///
"""Generate React geometry and standalone SVG variants from reviewed brand artwork."""
import argparse
import json
import re
from datetime import date
from pathlib import Path
# defusedxml provides the parsers; these imports only build and serialize elements.
from xml.etree.ElementTree import Comment, Element, SubElement, register_namespace, tostring  # nosemgrep: python.lang.security.use-defused-xml.use-defused-xml

from defusedxml import ElementTree as ET

root = Path(__file__).resolve().parent.parent
source = root / "src/integration-icon"
register_namespace("", "http://www.w3.org/2000/svg")
svg_ns = "{http://www.w3.org/2000/svg}"
variants = ["mark-mono", "mark-light", "mark-dark", "app-dark", "app-light", "logo-light", "logo-dark"]

market_country_codes = set("AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW XK".split())


def validate_geographic_markets(brands, markets):
    names = {brand["name"] for brand in brands}
    if not isinstance(markets, dict) or set(markets) != names:
        raise ValueError("Geographic markets must contain exactly one record per catalogue identity")
    for name, profile in markets.items():
        if name == "genericApp":
            if profile is not None:
                raise ValueError("The generic fallback cannot have brand markets")
            continue
        if not isinstance(profile, dict):
            raise ValueError(f"Missing geographic markets for {name}")
        required = {"scope", "basis", "primaryCountries", "countries", "regions", "countryCoverage", "localities", "assessment", "assessedOn", "verifiedOn", "temporalContext", "notes", "sources", "referenceUrls"}
        if not required <= set(profile) or set(profile) - required - {"relatedBrand"}:
            raise ValueError(f"Invalid geographic-market fields for {name}")
        choices = {
            "scope": {"global", "regional", "country", "local", "unknown"},
            "basis": {"brand-presence", "business-presence", "digital-service", "service-footprint", "audience", "project-adoption", "institution"},
            "countryCoverage": {"complete", "partial", "not-enumerated"},
            "assessment": {"source-supported", "provisional", "unknown"},
            "temporalContext": {"current", "historical"},
        }
        for key, allowed in choices.items():
            if not isinstance(profile[key], str) or profile[key] not in allowed:
                raise ValueError(f"Invalid geographic-market {key} for {name}")
        for key in ("primaryCountries", "countries", "regions", "referenceUrls"):
            values = profile[key]
            if not isinstance(values, list) or any(not isinstance(value, str) for value in values) or len(values) != len(set(values)):
                raise ValueError(f"Invalid geographic-market {key} list for {name}")
        if not set(profile["primaryCountries"]) <= set(profile["countries"]) <= market_country_codes:
            raise ValueError(f"Invalid or missing market country codes for {name}")
        if not set(profile["regions"]) <= {"Africa", "Asia", "Europe", "NorthAmerica", "SouthAmerica", "Oceania"}:
            raise ValueError(f"Invalid market regions for {name}")
        if (profile["countryCoverage"] == "not-enumerated") != (not profile["countries"]):
            raise ValueError(f"Country-list coverage contradicts market countries for {name}")
        if profile["scope"] in {"country", "local"} and len(profile["countries"]) != 1:
            raise ValueError(f"Country/local market scope requires one country for {name}")
        if not isinstance(profile["localities"], list) or any(not isinstance(place, dict) or set(place) != {"country", "name"} or place["country"] not in profile["countries"] or not isinstance(place["name"], str) or not place["name"].strip() for place in profile["localities"]):
            raise ValueError(f"Invalid market localities for {name}")
        if profile["scope"] == "local" and not profile["localities"]:
            raise ValueError(f"Local market scope requires a locality for {name}")
        if profile["scope"] == "unknown" and (profile["assessment"] != "unknown" or profile["countries"] or profile["regions"] or profile["localities"]):
            raise ValueError(f"Unknown market scope cannot assert geography for {name}")
        if (profile["scope"] == "unknown") != (profile["assessment"] == "unknown"):
            raise ValueError(f"Unknown market assessment and scope must agree for {name}")
        if not isinstance(profile["notes"], str) or not profile["notes"].strip():
            raise ValueError(f"Missing geographic-market qualification for {name}")
        if not isinstance(profile["sources"], list):
            raise ValueError(f"Invalid geographic-market sources for {name}")
        dates = [profile["assessedOn"]]
        if profile["assessment"] == "source-supported":
            if not profile["sources"] or not profile["verifiedOn"]:
                raise ValueError(f"Source-supported market assessment needs evidence and a date for {name}")
            dates.append(profile["verifiedOn"])
        elif profile["verifiedOn"] is not None:
            raise ValueError(f"Unverified market assessment cannot have a verification date for {name}")
        urls = list(profile["referenceUrls"])
        for evidence in profile["sources"]:
            if not isinstance(evidence, dict) or set(evidence) != {"url", "checkedOn", "summary"} or not isinstance(evidence["summary"], str) or not evidence["summary"].strip():
                raise ValueError(f"Invalid geographic-market evidence for {name}")
            dates.append(evidence["checkedOn"])
            urls.append(evidence["url"])
        if any(not isinstance(url, str) or not re.fullmatch(r"https?://[^\s/]+(?:/[^\s]*)?", url) for url in urls):
            raise ValueError(f"Invalid geographic-market source URL for {name}")
        for value in dates:
            if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                raise ValueError(f"Invalid geographic-market date for {name}")
            date.fromisoformat(value)
        if "relatedBrand" in profile and (not isinstance(profile["relatedBrand"], str) or profile["relatedBrand"] not in names or profile["relatedBrand"] in {name, "genericApp"}):
            raise ValueError(f"Invalid related geographic-market identity for {name}")


def tag_name(element):
    return element.tag.rsplit("}", 1)[-1]


def color_rgb(value):
    value = {"black": "#000000", "white": "#ffffff"}.get(value.lower(), value)
    if not value.startswith("#"):
        return None
    value = value[1:]
    if len(value) == 3:
        value = "".join(char * 2 for char in value)
    if len(value) != 6:
        return None
    return [int(value[index:index + 2], 16) / 255 for index in (0, 2, 4)]


def themed_artwork(brand, kind, dark, for_logo=False, mono=False):
    path = source / "artwork" / brand["slug"] / f"{kind}.svg"
    if for_logo and path.with_name("logo-mark.svg").exists():
        path = path.with_name("logo-mark.svg")
    override = path.with_name(f"{path.stem}-{'dark' if dark else 'light'}.svg")
    document = ET.fromstring((override if override.exists() else path).read_text(), forbid_dtd=True)
    document.attrib.pop("width", None)
    document.attrib.pop("height", None)
    if "viewBox" not in document.attrib:
        raise ValueError(f"Missing viewBox: {path}")
    declarations = {}
    for element in document.iter():
        if tag_name(element) == "style":
            for selector, body in re.findall(r"([^{}]+)\{([^{}]+)\}", element.text or ""):
                for name in selector.split(","):
                    name = name.strip().lstrip(".")
                    declarations[name] = declarations.get(name, "") + ";" + body
    paint_properties = {"fill", "stroke", "stroke-width", "opacity", "fill-opacity", "stroke-opacity", "fill-rule", "clip-rule", "mask-type", "stop-color", "stop-opacity"}
    svg_attributes = {
        "gradient-units": "gradientUnits",
        "gradient-transform": "gradientTransform",
        "mask-units": "maskUnits",
        "filter-units": "filterUnits",
        "std-deviation": "stdDeviation",
    }
    for element in document.iter():
        for attribute, svg_attribute in svg_attributes.items():
            if attribute in element.attrib:
                element.set(svg_attribute, element.attrib.pop(attribute))
        style = ";".join(declarations.get(name, "") for name in element.attrib.pop("class", "").split()) + ";" + element.attrib.pop("style", "")
        for declaration in style.split(";"):
            if ":" in declaration:
                key, value = declaration.split(":", 1)
                if key.strip() in paint_properties:
                    element.set(key.strip(), value.strip())
    if kind == "logo" and document.get("fill") is None:
        document.set("fill", "#000000")
    colors = brand.get(f"{kind}{'Dark' if dark else 'Light'}Colors", {})
    if mono:
        colors = brand.get("markMonoColors", colors)
    # Mask colors describe coverage, not visible brand colors.
    def visit(element, in_mask=False):
        in_mask = in_mask or tag_name(element) in ("mask", "clipPath", "filter")
        for attribute in ("fill", "stroke", "stop-color"):
            value = element.get(attribute)
            if value and not in_mask:
                if value in colors:
                    element.set(attribute, colors[value])
                elif dark and kind == "logo" and not override.exists():
                    rgb = color_rgb(value)
                    if rgb and max(rgb) < .48 and max(rgb) - min(rgb) < .24:
                        element.set(attribute, "#F5F7FA")
        for child in list(element):
            if tag_name(child) in ("title", "desc", "metadata", "namedview", "style") or (child.tag.startswith("{") and not child.tag.startswith(svg_ns)):
                element.remove(child)
            else:
                visit(child, in_mask)
    visit(document)
    if dark and kind == "logo" and document.get("fill") is None:
        document.set("fill", "#F5F7FA")
    if dark and kind == "logo" and brand.get("logoRaster") and not brand.get("logoRasterDarkOriginal") and not override.exists():
        definitions = Element(svg_ns + "defs")
        contrast_filter = SubElement(definitions, svg_ns + "filter", {"id": "logo-contrast", "color-interpolation-filters": "sRGB"})
        transfer = SubElement(contrast_filter, svg_ns + "feComponentTransfer")
        for channel in ("R", "G", "B"):
            SubElement(transfer, svg_ns + "feFunc" + channel, {"type": "linear", "slope": ".5", "intercept": ".5"})
        for element in document.iter():
            if tag_name(element) == "image":
                element.set("filter", "url(#logo-contrast)")
        document.insert(0, definitions)
    if kind == "logo" and brand.get("logoLayout"):
        return compose_logo(themed_artwork(brand, "mark", dark, for_logo=True), document, brand["logoLayout"])
    return document


def compose_logo(mark, wordmark, layout):
    document = Element(svg_ns + "svg", {"fill": "none"})
    x = 0
    for name, artwork, height in (("mark", mark, 100), ("wordmark", wordmark, layout["wordmarkHeight"] * 100)):
        viewbox = [float(value) for value in artwork.get("viewBox").replace(",", " ").split()]
        width = height * viewbox[2] / viewbox[3]
        offset_y = layout.get("wordmarkOffsetY", 0) * 100 if name == "wordmark" else 0
        artwork.attrib.update({"x": str(x), "y": str((100 - height) / 2 + offset_y), "width": str(width), "height": str(height)})
        for element in artwork.iter():
            for key, value in list(element.attrib.items()):
                if key == "id":
                    element.set(key, f"{name}-{value}")
                elif "url(#" in value:
                    element.set(key, value.replace("url(#", f"url(#{name}-"))
                elif key.endswith("href") and value.startswith("#"):
                    element.set(key, f"#{name}-{value[1:]}")
        document.append(artwork)
        x += width + (layout["gap"] * 100 if name == "mark" else 0)
    document.set("viewBox", f"0 0 {x} 100")
    return document


def jsx_attr(name):
    if name == "{http://www.w3.org/XML/1998/namespace}space":
        return "xmlSpace"
    if name.startswith(("data-", "aria-")):
        return name
    if name == "class":
        return "className"
    if name == "{http://www.w3.org/1999/xlink}href":
        return "xlinkHref"
    return re.sub(r"-([a-z])", lambda match: match[1].upper(), name)


def jsx(element):
    attrs = []
    for key, value in element.attrib.items():
        if key.startswith("xmlns") or (key.startswith("{") and not key.startswith(("{http://www.w3.org/1999/xlink}", "{http://www.w3.org/XML/1998/namespace}"))):
            continue
        key = jsx_attr(key)
        if key == "maskType":
            attrs.append(f'style={{{{maskType: {json.dumps(value)}}}}}')
            continue
        if key == "id":
            attrs.append(f'{key}={{`${{id}}-{value}`}}')
        elif "url(#" in value:
            value = value.replace("url(#", "url(#${id}-")
            attrs.append(f'{key}={{`{value}`}}')
        elif key in ("href", "xlinkHref") and value.startswith("#"):
            attrs.append(f'{key}={{`#${{id}}-{value[1:]}`}}')
        elif key == "style":
            styles = {jsx_attr(pair.split(":", 1)[0].strip()): pair.split(":", 1)[1].strip() for pair in value.split(";") if ":" in pair and pair.split(":", 1)[0].strip() in ("fill", "stroke", "stroke-width", "opacity", "fill-opacity", "stroke-opacity", "fill-rule", "clip-rule", "mask-type")}
            attrs.append(f'style={{{json.dumps(styles)}}}')
        else:
            attrs.append(f'{key}={json.dumps(value)}')
    children = "".join(jsx(child) for child in element)
    content = (element.text or "").strip()
    if content:
        children = "{" + json.dumps(content) + "}" + children
    name = tag_name(element)
    return f'<{name} {" ".join(attrs)}>{children}</{name}>' if children else f'<{name} {" ".join(attrs)} />'


def mono_alpha_matrix(artwork):
    definitions = {element.get("id"): element for element in artwork.iter() if element.get("id")}
    luminances = []

    def paint(value, color, visited):
        if value == "currentColor":
            value = color
        reference = re.fullmatch(r'url\([\"\']?#([^\"\')]+)[\"\']?\)', value)
        if reference:
            identifier = reference[1]
            if identifier in visited or identifier not in definitions:
                return
            definition = definitions[identifier]
            visited = visited | {identifier}
            if tag_name(definition) in ("linearGradient", "radialGradient"):
                stops = [element for element in definition if tag_name(element) == "stop"]
                if not stops:
                    href = definition.get("href", definition.get("{http://www.w3.org/1999/xlink}href", ""))
                    if href.startswith("#"):
                        paint(f"url({href})", color, visited)
                for stop in stops:
                    if float(stop.get("stop-opacity", "1")) > 0:
                        paint(stop.get("stop-color", "black"), color, visited)
            elif tag_name(definition) == "pattern":
                for child in definition:
                    visit(child, {"fill": "black", "stroke": "none", "color": color}, visited)
            return
        value = {"gray": "#808080", "red": "#ff0000"}.get(value.lower(), value)
        rgb = color_rgb(value)
        if rgb is None and value.startswith(("rgb(", "rgba(")):
            channels = re.findall(r'[\d.]+%?', value)
            if len(channels) >= 3:
                if len(channels) == 4 and float(channels[3].rstrip("%")) == 0:
                    return
                rgb = [float(channel.rstrip("%")) / (100 if channel.endswith("%") else 255) for channel in channels[:3]]
        if rgb is not None:
            luminances.append(sum(channel * weight for channel, weight in zip(rgb, (.2126, .7152, .0722))))

    def visit(element, inherited, visited, referenced=False):
        name = tag_name(element)
        if name in ("defs", "mask", "clipPath", "filter", "linearGradient", "radialGradient", "pattern") or (name == "symbol" and not referenced):
            return
        if element.get("display") == "none" or element.get("visibility") == "hidden" or float(element.get("opacity", "1")) == 0:
            return
        properties = inherited | {key: element.get(key) for key in ("fill", "stroke", "color", "fill-opacity", "stroke-opacity") if element.get(key) not in (None, "inherit")}
        if name == "use":
            href = element.get("href", element.get("{http://www.w3.org/1999/xlink}href", ""))
            if href.startswith("#") and href[1:] in definitions and href[1:] not in visited:
                visit(definitions[href[1:]], properties, visited | {href[1:]}, referenced=True)
        elif name in ("path", "rect", "circle", "ellipse", "polygon", "polyline", "line", "text"):
            for attribute in ("fill", "stroke"):
                if attribute == "fill" and name == "line":
                    continue
                if float(properties.get(attribute + "-opacity", "1")) > 0:
                    paint(properties[attribute], properties["color"], visited)
        for child in element:
            visit(child, properties, visited)

    visit(artwork, {"fill": "black", "stroke": "none", "color": "black"}, set())
    minimum = min(luminances, default=1)
    # White-only artwork needs its silhouette; mixed artwork uses white as a cutout.
    if minimum >= 1 - 1e-6:
        alpha = "0 0 0 0 1"
    else:
        coefficients = [-weight / (1 - minimum) for weight in (.2126, .7152, .0722)]
        alpha = " ".join(f"{value:.12g}" for value in (*coefficients, 0, -sum(coefficients)))
    return "0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 " + alpha


def mono_defs(filter_id, matrix, ink_scale=1):
    return f'<defs><filter id="{filter_id}" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feColorMatrix in="SourceGraphic" type="matrix" values="{matrix}" result="tones"/><feComposite in="tones" in2="SourceAlpha" operator="in"/><feComponentTransfer result="coverage"><feFuncA type="linear" slope="{ink_scale}"/></feComponentTransfer><feFlood flood-color="currentColor"/><feComposite in2="coverage" operator="in"/></filter></defs>'


def app_tile(dark):
    tile = ET.parse(source / "app-tile" / ("dark.svg" if dark else "light.svg"), forbid_dtd=True).getroot()
    tile.tag = svg_ns + "g"
    tile.attrib.clear()
    return tile


def prefix_svg(body, prefix):
    body = re.sub(r'id="([^"]+)"', lambda match: f'id="{prefix}-{match[1]}"', body)
    body = body.replace("url(#", f"url(#{prefix}-")
    return re.sub(r'(href|xlink:href)="#([^"]+)"', lambda match: f'{match[1]}="#{prefix}-{match[2]}"', body)


def variant_svg(brand, variant):
    kind = "logo" if variant.startswith("logo") else "mark"
    dark = variant.endswith("dark")
    app = variant.startswith("app")
    mono = variant == "mark-mono"
    artwork = themed_artwork(brand, kind, dark, mono=mono)
    matrix = mono_alpha_matrix(artwork) if mono else None
    if mono:
        artwork.set("color", "black")
    viewbox = [float(value) for value in artwork.get("viewBox").replace(",", " ").split()]
    if kind == "logo":
        outer_viewbox = f"0 0 {viewbox[2]} {viewbox[3]}"
        artwork.set("x", "0")
        artwork.set("y", "0")
        artwork.set("width", str(viewbox[2]))
        artwork.set("height", str(viewbox[3]))
    else:
        outer_viewbox = "0 0 64 64"
        if app and brand.get("appViewBox"):
            artwork.set("viewBox", brand["appViewBox"])
        size = 64 / brand["ratio"] if app else 64
        artwork.set("x", str(0 if app and brand["alignment"] == "start" else (64 - size) / 2))
        artwork.set("y", str((64 - size) / 2))
        artwork.set("width", str(size))
        artwork.set("height", str(size))
    prefix = f'{brand["slug"]}-{variant}'
    body = prefix_svg(tostring(artwork, encoding="unicode"), prefix)
    background = prefix_svg(tostring(app_tile(dark), encoding="unicode"), prefix + "-background") if app else ""
    if app:
        body = f'<defs><clipPath id="{prefix}-tile"><rect x=".5" y=".5" width="63" height="63" rx="10"/></clipPath></defs><g clip-path="url(#{prefix}-tile)">{body}</g>'
    if mono:
        body = mono_defs(prefix + "-mono", matrix, brand.get("monoInkScale", 1)) + f'<g filter="url(#{prefix}-mono)">{body}</g>'
    color = f' color="{("#CBD5E1" if dark else "#374151")}"' if app else ""
    attribution = tostring(Comment(brand["artworkAttribution"]), encoding="unicode") if brand.get("artworkAttribution") else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{outer_viewbox}" fill="none"{color}>{attribution}{background}{body}</svg>\n'


def generate(catalog_only=False):
    brands = json.loads((source / "brands.json").read_text())
    markets = json.loads((source / "geographic-markets.json").read_text())
    validate_geographic_markets(brands, markets)
    imports = []
    registry = []
    files = {}
    files[source / "app-tile.tsx"] = "\n".join(f'export const AppTile{("Dark" if dark else "Light")} = ({{ id }}: {{ id: string }}) => ({jsx(app_tile(dark))});' for dark in (False, True)) + "\n"
    catalog = []
    for brand in brands:
        available = [variant for variant in variants if not variant.startswith("logo") or (source / "artwork" / brand["slug"] / "logo.svg").exists()]
        categories = brand.get("categories")
        if not isinstance(categories, list) or any(not isinstance(category, str) or not category.strip() or category != category.strip() for category in categories):
            raise ValueError(f'Invalid categories for {brand["name"]}')
        if len(set(categories)) != len(categories) or (not categories and brand["name"] != "genericApp"):
            raise ValueError(f'Missing or duplicate categories for {brand["name"]}')
        catalog.append({key: brand[key] for key in ("name", "slug", "label", "integrationNames", "source", "categories")} | {"category": "Integrations", "variants": available, "logoSource": brand.get("logoSource"), "logoNotes": brand.get("logoNotes"), "logoRaster": brand.get("logoRaster", False), "lastCheckedAutomated": brand.get("lastCheckedAutomated"), "lastCheckedManually": brand.get("lastCheckedManually")})
        if "searchAliases" in brand:
            catalog[-1]["searchAliases"] = brand["searchAliases"]
        if catalog_only:
            continue
        geometries = []
        for kind in ("mark", "logo"):
            if kind == "logo" and "logo-light" not in available:
                continue
            modes = ["Light", "Dark"] + (["Mono"] if kind == "mark" and brand.get("markMonoColors") else [])
            for mode in modes:
                artwork = themed_artwork(brand, kind, mode == "Dark", mono=mode == "Mono")
                name = kind + mode
                if kind == "mark":
                    artwork.tag = svg_ns + "g"
                    for attribute in ("viewBox", "version", "preserveAspectRatio"):
                        artwork.attrib.pop(attribute, None)
                markup = jsx(artwork)
                binding = "id" if "${id}" in markup else "id: _id"
                geometries.append(f'export const {name} = ({{ {binding} }}: {{ id: string }}) => ({markup});')
        filename = f'./geometry/{brand["slug"]}'
        imports.append(f'import * as {brand["name"]} from "{filename}";')
        attribution = f'/* {brand["artworkAttribution"]} */\n' if brand.get("artworkAttribution") else ""
        files[source / "geometry" / f'{brand["slug"]}.tsx'] = attribution + "\n".join(geometries) + "\n"
        mark_viewbox = themed_artwork(brand, "mark", False).get("viewBox")
        logo_viewbox = themed_artwork(brand, "logo", False).get("viewBox") if "logo-light" in available else None
        app_viewbox = f', appViewBox: {json.dumps(brand["appViewBox"])}' if brand.get("appViewBox") else ""
        matrix = mono_alpha_matrix(themed_artwork(brand, "mark", False, mono=True))
        registry.append(f'  {brand["name"]}: {{ ...{brand["name"]}, markViewBox: {json.dumps(mark_viewbox)}, monoAlphaMatrix: {json.dumps(matrix)}, monoInkScale: {brand.get("monoInkScale", 1)}, logoViewBox: {json.dumps(logo_viewbox)}, ratio: {brand["ratio"]}, alignment: "{brand["alignment"]}"{app_viewbox} }}')
        for variant in available:
            files[root / "assets/integrations" / brand["slug"] / f"{variant}.svg"] = variant_svg(brand, variant)
    files[source / "geometry.ts"] = "\n".join(imports) + "\n\nexport const integrationGeometry = {\n" + ",\n".join(registry) + "\n} as const;\n"
    files[root / "src/integration-icon-catalog.ts"] = 'export const integrationIconVariants = ' + json.dumps(variants) + ' as const;\n\nexport type IntegrationIconVariant = (typeof integrationIconVariants)[number];\n\nexport const integrationIconCatalog = ' + json.dumps(catalog, indent=2) + ' as const;\n\nexport type IntegrationIconName = (typeof integrationIconCatalog)[number]["name"];\n\nexport const integrationIconNameByIntegration: Readonly<Record<string, IntegrationIconName | undefined>> = Object.fromEntries(integrationIconCatalog.flatMap((icon: { name: IntegrationIconName; integrationNames: readonly string[] }) => icon.integrationNames.map((name): [string, IntegrationIconName] => [name, icon.name])));\n'
    files[root / "src/integration-icon-catalog.ts"] += '\nexport const integrationIconCategories = ' + json.dumps(sorted({category for brand in brands for category in brand["categories"]})) + ' as const;\n\nexport type IntegrationIconCategory = (typeof integrationIconCategories)[number];\n'
    if catalog_only:
        files = {root / "src/integration-icon-catalog.ts": files[root / "src/integration-icon-catalog.ts"]}
    files[root / "src/integration-icon-geographic-markets.ts"] = (
        'import type { IntegrationIconName } from "./integration-icon-catalog";\n'
        'import type { BrandGeographicMarkets } from "./integration-icon/geographic-market-types";\n'
        '\n'
        'export type { BrandGeographicMarkets } from "./integration-icon/geographic-market-types";\n\n'
        'export const integrationIconGeographicMarkets: { readonly [Name in IntegrationIconName]: Name extends "genericApp" ? null : BrandGeographicMarkets } = '
        + json.dumps(markets, indent=2, ensure_ascii=False) + ';\n'
    )
    for path, contents in files.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(contents)
    if not catalog_only:
        for path in (root / "assets/integrations").glob("*/*.svg"):
            if path not in files:
                path.unlink()
    print(f'Generated catalogue for {len(brands)} icons.' if catalog_only else f'Generated {len(brands)} icons and {sum(len(icon["variants"]) for icon in catalog)} SVG variants.')


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog-only", action="store_true", help="Update metadata without rewriting SVGs or React geometry")
    generate(catalog_only=parser.parse_args().catalog_only)

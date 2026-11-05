import { writeFile } from "node:fs/promises";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  IntegrationIcon,
  integrationIconCatalog,
  integrationIconVariants,
} from "../dist/integrations.js";

const rows = integrationIconCatalog.map((icon) => {
  const cells = integrationIconVariants.map((variant) => {
    const dark = variant.endsWith("dark");
    const supported = icon.variants.some((candidate) => candidate === variant);
    const artwork = supported
      ? renderToStaticMarkup(
          createElement(IntegrationIcon, {
            name: icon.name,
            variant,
            size: variant.startsWith("logo") ? 28 : 44,
            color: variant.endsWith("mono") ? "#3279BF" : undefined,
          }),
        )
      : '<span class="missing">No verified lock-up</span>';
    return `<td class="${dark ? "dark" : "light"}">${artwork}</td>`;
  });
  return `<tr><th>${icon.label}</th>${cells.join("")}</tr>`;
});

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HASH integration icons</title><style>
*{box-sizing:border-box}body{font:14px system-ui;margin:28px;color:#18212b;background:#f5f7fa}h1{font-size:25px;margin:0 0 8px}p{color:#526171;margin:0 0 24px}table{border-collapse:collapse;width:100%;table-layout:fixed}thead{position:sticky;top:0;z-index:1;background:#f5f7fa}th{text-align:left;font-size:12px;padding:12px 8px;font-weight:600}thead th{vertical-align:bottom}td{height:82px;text-align:center;border:5px solid #f5f7fa;padding:10px}td svg{max-width:100%;vertical-align:middle}td.light{background:#fff}td.dark{background:#16212c;color:#fff}.missing{font-size:10px;color:#788696}th:first-child{width:150px}thead th:nth-last-child(-n+2){width:160px}button{font:inherit;border:1px solid #b4c3d2;background:white;border-radius:6px;padding:6px 12px;cursor:pointer;margin:0 8px 20px 0}.checker td{background-image:conic-gradient(#8293a519 25%,transparent 0 50%,#8293a519 0 75%,transparent 0);background-size:16px 16px}
</style></head><body><h1>Integration icons</h1><p>39 brands · Backgroundless marks, translucent app tiles, and full logos using sourced artwork. Mono mark examples use one blue fill.</p><button onclick="document.body.classList.toggle('checker')">Show transparency</button><button onclick="document.querySelectorAll('[flood-color]').forEach(el=>el.closest('svg').style.color=el.closest('svg').style.color==='rgb(139, 97, 215)'?'#3279BF':'#8B61D7')">Change mono color</button><table><thead><tr><th>Brand</th>${integrationIconVariants.map((variant) => `<th>${variant.replaceAll("-", " ")}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></body></html>`;

await writeFile(process.argv[2] ?? "integration-icons.html", html);

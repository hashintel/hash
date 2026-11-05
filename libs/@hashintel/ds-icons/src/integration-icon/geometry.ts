import * as anaplan from "./geometry/anaplan";
import * as appleNotes from "./geometry/apple-notes";
import * as asana from "./geometry/asana";
import * as amazonRedshift from "./geometry/aws-redshift";
import * as azure from "./geometry/azure";
import * as bigQuery from "./geometry/bigquery";
import * as blueYonder from "./geometry/blue-yonder";
import * as box from "./geometry/box";
import * as celonis from "./geometry/celonis";
import * as cloudflare from "./geometry/cloudflare";
import * as coupa from "./geometry/coupa";
import * as databricks from "./geometry/databricks";
import * as discord from "./geometry/discord";
import * as docusign from "./geometry/docusign";
import * as dropbox from "./geometry/dropbox";
import * as figma from "./geometry/figma";
import * as fourkites from "./geometry/fourkites";
import * as genericApp from "./geometry/generic-app";
import * as github from "./geometry/github";
import * as googleCalendar from "./geometry/google-calendar";
import * as googleDrive from "./geometry/google-drive";
import * as gmail from "./geometry/google-mail";
import * as granola from "./geometry/granola";
import * as granolaLegacy from "./geometry/granola-legacy";
import * as instagram from "./geometry/instagram";
import * as kinaxis from "./geometry/kinaxis";
import * as kinaxisMaestro from "./geometry/kinaxis-maestro";
import * as linear from "./geometry/linear";
import * as messenger from "./geometry/messenger";
import * as microsoftTeams from "./geometry/microsoft-teams";
import * as notion from "./geometry/notion";
import * as omp from "./geometry/omp";
import * as oracle from "./geometry/oracle";
import * as pasX from "./geometry/pas-x";
import * as postgres from "./geometry/postgres";
import * as sap from "./geometry/sap";
import * as sentry from "./geometry/sentry";
import * as slack from "./geometry/slack";
import * as snowflake from "./geometry/snowflake";
import * as trello from "./geometry/trello";
import * as veevaVault from "./geometry/veeva-vault";
import * as zoom from "./geometry/zoom";

export const integrationGeometry = {
  anaplan: {
    ...anaplan,
    markViewBox: "0 0 36 30",
    logoViewBox: "0 0 135 28.6",
    ratio: 1.6,
    alignment: "center",
  },
  blueYonder: {
    ...blueYonder,
    markViewBox: "0 0 34 34",
    logoViewBox:
      "23.6278018951416 415.3699951171875 915.3721923828125 129.3499755859375",
    ratio: 1.88,
    alignment: "center",
  },
  celonis: {
    ...celonis,
    markViewBox: "0 0 50 34",
    logoViewBox: "0 0 424.8962352284291 100",
    ratio: 1.3,
    alignment: "center",
  },
  databricks: {
    ...databricks,
    markViewBox: "0 0 24 26",
    logoViewBox: "0 0 512 81",
    ratio: 2.67,
    alignment: "center",
  },
  snowflake: {
    ...snowflake,
    markViewBox: "0 0 26 26",
    logoViewBox: "0 0 512 116",
    ratio: 2.46,
    alignment: "center",
  },
  bigQuery: {
    ...bigQuery,
    markViewBox: "0 0 26 26",
    logoViewBox: "0 0 110 37.545",
    ratio: 2.46,
    alignment: "center",
  },
  amazonRedshift: {
    ...amazonRedshift,
    markViewBox: "0 0 24 26",
    logoViewBox: "17.3 32 105 41",
    ratio: 2.46,
    alignment: "center",
  },
  cloudflare: {
    ...cloudflare,
    markViewBox: "0 0 30 14",
    logoViewBox: "0 0 512 76",
    ratio: 2.46,
    alignment: "center",
  },
  azure: {
    ...azure,
    markViewBox: "0 0 24 24",
    logoViewBox:
      "2.5114290714263916 44.57600021362305 122.97714233398438 38.847469329833984",
    ratio: 2.67,
    alignment: "center",
  },
  postgres: {
    ...postgres,
    markViewBox: "0 0 256 264",
    logoViewBox: "0 0 1416.8 445.5",
    ratio: 2.46,
    alignment: "center",
  },
  veevaVault: {
    ...veevaVault,
    markViewBox: "0 0 32 32",
    logoViewBox: "0 0 376.1538461538462 100",
    ratio: 2,
    alignment: "center",
  },
  pasX: {
    ...pasX,
    markViewBox: "0 0 36 30",
    logoViewBox: "0 0 36 30",
    ratio: 2,
    alignment: "center",
  },
  fourkites: {
    ...fourkites,
    markViewBox: "0 0 38 38",
    logoViewBox: "0 0 312.99 80",
    ratio: 2,
    alignment: "center",
  },
  omp: {
    ...omp,
    markViewBox: "0 0 40 18",
    logoViewBox: "0 0 40 18",
    ratio: 1.64,
    alignment: "center",
  },
  kinaxis: {
    ...kinaxis,
    markViewBox: "0 0 146 20",
    logoViewBox: "0 0 146 20",
    ratio: 1.25,
    alignment: "center",
  },
  kinaxisMaestro: {
    ...kinaxisMaestro,
    markViewBox: "0 0 42 24",
    logoViewBox: "0 0 2504 485.5",
    ratio: 1.52,
    alignment: "center",
  },
  coupa: {
    ...coupa,
    markViewBox: "0 0 38 34",
    logoViewBox: "0 0 1553 423",
    ratio: 2,
    alignment: "center",
  },
  linear: {
    ...linear,
    markViewBox: "0 0 256 255.999966",
    logoViewBox: "0 0 512 127.964481",
    ratio: 2,
    alignment: "center",
  },
  slack: {
    ...slack,
    markViewBox: "0 0 32 32",
    logoViewBox: "0 0 512 130",
    ratio: 2,
    alignment: "center",
  },
  oracle: {
    ...oracle,
    markViewBox: "0 0 40 24",
    logoViewBox: "0 0 726.1802525832377 100",
    ratio: 1.64,
    alignment: "center",
  },
  sap: {
    ...sap,
    markViewBox: "0 0 50 26",
    logoViewBox: "0 0 512 254",
    ratio: 1.28,
    alignment: "start",
  },
  docusign: {
    ...docusign,
    markViewBox: "0 0 32 32",
    logoViewBox: "0 0 1200 241.4",
    ratio: 2,
    alignment: "center",
  },
  gmail: {
    ...gmail,
    markViewBox: "0 0 32 24",
    logoViewBox: "0 13 218 51",
    ratio: 2,
    alignment: "center",
  },
  googleDrive: {
    ...googleDrive,
    markViewBox: "0 0 32 28",
    logoViewBox: "0 0 1000 149.3742828",
    ratio: 2,
    alignment: "center",
  },
  googleCalendar: {
    ...googleCalendar,
    markViewBox: "0 0 32 32",
    logoViewBox: "0 0 1000 223.673",
    ratio: 2,
    alignment: "center",
  },
  dropbox: {
    ...dropbox,
    markViewBox: "0 0 32 30",
    logoViewBox: "0 0 472 128",
    ratio: 2,
    alignment: "center",
  },
  box: {
    ...box,
    markViewBox: "0 0 36 20",
    logoViewBox: "0 0 512 277",
    ratio: 1.78,
    alignment: "center",
  },
  trello: {
    ...trello,
    markViewBox: "0 0 32 32",
    logoViewBox: "0 0 312 64",
    ratio: 2,
    alignment: "center",
  },
  appleNotes: {
    ...appleNotes,
    markViewBox: "0 0 64 64",
    logoViewBox: null,
    ratio: 1.0,
    alignment: "center",
  },
  discord: {
    ...discord,
    markViewBox: "0 0 32 26",
    logoViewBox: "0 0 512 100",
    ratio: 2,
    alignment: "center",
  },
  microsoftTeams: {
    ...microsoftTeams,
    markViewBox: "0 0 32 30",
    logoViewBox: "65 62 455 65",
    ratio: 2,
    alignment: "center",
  },
  messenger: {
    ...messenger,
    markViewBox: "0 0 34 34",
    logoViewBox: "0 0 599.7771678907785 100",
    ratio: 2,
    alignment: "center",
  },
  instagram: {
    ...instagram,
    markViewBox: "0 0 36 36",
    logoViewBox: "0 0 429.59946595460616 100",
    ratio: 2,
    alignment: "center",
  },
  notion: {
    ...notion,
    markViewBox: "0 0 32 32",
    logoViewBox: "0 0 512 178",
    ratio: 2.13,
    alignment: "center",
  },
  granola: {
    ...granola,
    markViewBox: "0 0 32 32",
    logoViewBox: "0 0 148 32",
    ratio: 1.78,
    alignment: "center",
  },
  granolaLegacy: {
    ...granolaLegacy,
    markViewBox: "0 0 32 38",
    logoViewBox: null,
    ratio: 2,
    alignment: "center",
  },
  sentry: {
    ...sentry,
    markViewBox: "0 0 36 32",
    logoViewBox: "0 0 512 113",
    ratio: 2,
    alignment: "center",
  },
  zoom: {
    ...zoom,
    markViewBox: "0 0 32 20",
    logoViewBox: "0 0 545.0854700854701 100",
    ratio: 1.88,
    alignment: "center",
  },
  github: {
    ...github,
    markViewBox: "0 0 36 36",
    logoViewBox: "0 0 387.841726618705 100",
    ratio: 2,
    alignment: "center",
  },
  figma: {
    ...figma,
    markViewBox: "0 0 24 34",
    logoViewBox: "192 231 640 178.72100830078125",
    ratio: 2,
    alignment: "center",
  },
  asana: {
    ...asana,
    markViewBox: "0 0 34 32",
    logoViewBox: "0 0 512 102",
    ratio: 2,
    alignment: "center",
  },
  genericApp: {
    ...genericApp,
    markViewBox: "0 0 24 24",
    logoViewBox: null,
    ratio: 2,
    alignment: "center",
  },
} as const;

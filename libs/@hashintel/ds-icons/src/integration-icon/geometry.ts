import * as airtable from "./geometry/airtable";
import * as amazon from "./geometry/amazon";
import * as amazonS3 from "./geometry/amazon-s3";
import * as anaplan from "./geometry/anaplan";
import * as anthropic from "./geometry/anthropic";
import * as apollo from "./geometry/apollo";
import * as apple from "./geometry/apple";
import * as appleHealth from "./geometry/apple-health";
import * as appleNotes from "./geometry/apple-notes";
import * as asana from "./geometry/asana";
import * as attio from "./geometry/attio";
import * as aws from "./geometry/aws";
import * as amazonRedshift from "./geometry/aws-redshift";
import * as azure from "./geometry/azure";
import * as bigQuery from "./geometry/bigquery";
import * as blueYonder from "./geometry/blue-yonder";
import * as box from "./geometry/box";
import * as calCom from "./geometry/cal-com";
import * as calendly from "./geometry/calendly";
import * as celonis from "./geometry/celonis";
import * as chatgpt from "./geometry/chatgpt";
import * as claude from "./geometry/claude";
import * as clay from "./geometry/clay";
import * as clickup from "./geometry/clickup";
import * as cloudflare from "./geometry/cloudflare";
import * as composio from "./geometry/composio";
import * as coupa from "./geometry/coupa";
import * as cursor from "./geometry/cursor";
import * as databricks from "./geometry/databricks";
import * as discord from "./geometry/discord";
import * as docusign from "./geometry/docusign";
import * as dropbox from "./geometry/dropbox";
import * as evernote from "./geometry/evernote";
import * as figma from "./geometry/figma";
import * as fourkites from "./geometry/fourkites";
import * as genericApp from "./geometry/generic-app";
import * as github from "./geometry/github";
import * as googleCalendar from "./geometry/google-calendar";
import * as googleDocs from "./geometry/google-docs";
import * as googleDrive from "./geometry/google-drive";
import * as gmail from "./geometry/google-mail";
import * as googleMeet from "./geometry/google-meet";
import * as googleSheets from "./geometry/google-sheets";
import * as googleSlides from "./geometry/google-slides";
import * as granola from "./geometry/granola";
import * as granolaLegacy from "./geometry/granola-legacy";
import * as hash from "./geometry/hash";
import * as hunter from "./geometry/hunter";
import * as instagram from "./geometry/instagram";
import * as kinaxis from "./geometry/kinaxis";
import * as kinaxisMaestro from "./geometry/kinaxis-maestro";
import * as linear from "./geometry/linear";
import * as luma from "./geometry/luma";
import * as mailchimp from "./geometry/mailchimp";
import * as messenger from "./geometry/messenger";
import * as messengerLegacy from "./geometry/messenger-legacy";
import * as microsoftCopilot from "./geometry/microsoft-copilot";
import * as microsoftExcel from "./geometry/microsoft-excel";
import * as microsoftOneDrive from "./geometry/microsoft-onedrive";
import * as microsoftOneNote from "./geometry/microsoft-onenote";
import * as microsoftOutlook from "./geometry/microsoft-outlook";
import * as microsoftPowerPoint from "./geometry/microsoft-powerpoint";
import * as microsoftTeams from "./geometry/microsoft-teams";
import * as microsoftTeamsLegacy from "./geometry/microsoft-teams-legacy";
import * as microsoftWord from "./geometry/microsoft-word";
import * as miro from "./geometry/miro";
import * as mixmax from "./geometry/mixmax";
import * as modal from "./geometry/modal";
import * as notion from "./geometry/notion";
import * as okta from "./geometry/okta";
import * as omp from "./geometry/omp";
import * as openai from "./geometry/openai";
import * as oracle from "./geometry/oracle";
import * as pandadoc from "./geometry/pandadoc";
import * as pasX from "./geometry/pas-x";
import * as postgres from "./geometry/postgres";
import * as rudderstack from "./geometry/rudderstack";
import * as sap from "./geometry/sap";
import * as segment from "./geometry/segment";
import * as sentry from "./geometry/sentry";
import * as slack from "./geometry/slack";
import * as snowflake from "./geometry/snowflake";
import * as stripe from "./geometry/stripe";
import * as taskrabbit from "./geometry/taskrabbit";
import * as telegram from "./geometry/telegram";
import * as trello from "./geometry/trello";
import * as turbopuffer from "./geometry/turbopuffer";
import * as twitterLegacy from "./geometry/twitter-legacy";
import * as typeform from "./geometry/typeform";
import * as veevaVault from "./geometry/veeva-vault";
import * as vercel from "./geometry/vercel";
import * as whalesync from "./geometry/whalesync";
import * as x from "./geometry/x";
import * as zapier from "./geometry/zapier";
import * as zendesk from "./geometry/zendesk";
import * as zoho from "./geometry/zoho";
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
  amazon: {
    ...amazon,
    markViewBox: "14.83596 39.41500 58.77356 16.08470",
    logoViewBox: "3.50000 20.50000 102.99700 34.99970",
    ratio: 1.35,
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
  apple: {
    ...apple,
    markViewBox: "0.2140 11.9507 13.5720 16.5354",
    logoViewBox: null,
    ratio: 1.9,
    alignment: "center",
  },
  appleNotes: {
    ...appleNotes,
    markViewBox: "0 0 64 64",
    logoViewBox: null,
    ratio: 1.0,
    alignment: "center",
  },
  appleHealth: {
    ...appleHealth,
    markViewBox: "0 0 492 460",
    logoViewBox: null,
    ratio: 1,
    alignment: "center",
    appViewBox: "-384 -144 1024 1024",
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
    markViewBox: "4 4 36 38",
    logoViewBox: "0 0 726.6715829881806 100",
    ratio: 2,
    alignment: "center",
  },
  microsoftWord: {
    ...microsoftWord,
    markViewBox: "0 0 35 36",
    logoViewBox: "0 0 694.487737257411 100",
    ratio: 2,
    alignment: "center",
  },
  microsoftOutlook: {
    ...microsoftOutlook,
    markViewBox: "60 90.4 570.02 539.67",
    logoViewBox: "0 0 802.1765902508063 100",
    ratio: 2,
    alignment: "center",
  },
  microsoftExcel: {
    ...microsoftExcel,
    markViewBox: "0 0 486 500",
    logoViewBox: "0 0 673.838515674984 100",
    ratio: 2,
    alignment: "center",
  },
  microsoftPowerPoint: {
    ...microsoftPowerPoint,
    markViewBox: "60 78.75 581.25 562.5",
    logoViewBox: "0 0 923.3307741522713 100",
    ratio: 2,
    alignment: "center",
  },
  microsoftOneNote: {
    ...microsoftOneNote,
    markViewBox: "60 90 525 540",
    logoViewBox: "0 0 827.0558754531883 100",
    ratio: 2,
    alignment: "center",
  },
  microsoftOneDrive: {
    ...microsoftOneDrive,
    markViewBox: "35.98 139.2 648.03 430.85",
    logoViewBox: "0 0 890.8321583953991 100",
    ratio: 2,
    alignment: "center",
  },
  microsoftCopilot: {
    ...microsoftCopilot,
    markViewBox: "-1 15 513 481",
    logoViewBox: "0 0 770.242169787135 100",
    ratio: 2,
    alignment: "center",
  },
  microsoftTeamsLegacy: {
    ...microsoftTeamsLegacy,
    markViewBox: "0 0 32 30",
    logoViewBox: "0 0 738.6014075495841 100",
    ratio: 2,
    alignment: "center",
  },
  messenger: {
    ...messenger,
    markViewBox: "0 0 502 502",
    logoViewBox: "0 0 599.7771678907785 100",
    ratio: 2,
    alignment: "center",
  },
  messengerLegacy: {
    ...messengerLegacy,
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
  hash: {
    ...hash,
    markViewBox: "0 0 21.6653 22",
    logoViewBox: "0 0 120 22",
    ratio: 1,
    alignment: "center",
    appViewBox: "-15.001367 -14.666667 36.666667 36.666667",
  },
  openai: {
    ...openai,
    markViewBox: "0 0 256 260",
    logoViewBox: "201.733333 201.777365 956.533333 260.723562",
    ratio: 1.8,
    alignment: "center",
  },
  chatgpt: {
    ...chatgpt,
    markViewBox: "0 0 158.7128 157.296",
    logoViewBox: "0 0 117.41 28",
    ratio: 1.8,
    alignment: "center",
  },
  anthropic: {
    ...anthropic,
    markViewBox: "0 0 256 176",
    logoViewBox: "0 0 570 64",
    ratio: 1.8,
    alignment: "center",
  },
  claude: {
    ...claude,
    markViewBox: "0 0 256 257",
    logoViewBox: "0 0 573 125",
    ratio: 1.8,
    alignment: "center",
  },
  segment: {
    ...segment,
    markViewBox: "0 0 256 265",
    logoViewBox: "0 0 512 105",
    ratio: 1.8,
    alignment: "center",
  },
  rudderstack: {
    ...rudderstack,
    markViewBox: "0 0 256 258",
    logoViewBox: "0 0 256 42",
    ratio: 1.8,
    alignment: "center",
  },
  zapier: {
    ...zapier,
    markViewBox: "0 45.2253 39.0441 9.5637",
    logoViewBox: "0 0 244 66",
    ratio: 1.6,
    alignment: "center",
  },
  whalesync: {
    ...whalesync,
    markViewBox: "0.641667 0.091549 108.716667 51.267606",
    logoViewBox: "0.271667 0 162.456667 21.45679",
    ratio: 1.55,
    alignment: "center",
  },
  clickup: {
    ...clickup,
    markViewBox: "5.866667 0.64 52.266667 63.146667",
    logoViewBox: "0 0.64 256 63.36",
    ratio: 1.8,
    alignment: "center",
  },
  okta: {
    ...okta,
    markViewBox: "0 0 256 256",
    logoViewBox: "0 0 109.21 36",
    ratio: 1.8,
    alignment: "center",
  },
  cursor: {
    ...cursor,
    markViewBox: "0 0 466.73 533.32",
    logoViewBox: "0 0 2238.7 533.32",
    ratio: 1.8,
    alignment: "center",
  },
  x: {
    ...x,
    markViewBox: "0 0 1200 1227",
    logoViewBox: null,
    ratio: 1.8,
    alignment: "center",
  },
  twitterLegacy: {
    ...twitterLegacy,
    markViewBox: "0 0 256 209",
    logoViewBox: null,
    ratio: 1.8,
    alignment: "center",
  },
  calCom: {
    ...calCom,
    markViewBox: "64.6855 133.681 248.6385 132.048",
    logoViewBox: "0 0 100.326667 20.992366",
    ratio: 1.6,
    alignment: "center",
  },
  composio: {
    ...composio,
    markViewBox: "0 0 76.477 88.587",
    logoViewBox: "0 0 483 93",
    ratio: 1.8,
    alignment: "center",
  },
  attio: {
    ...attio,
    markViewBox: "0 0 36.2 29.45",
    logoViewBox: "0 0 120 29.5",
    ratio: 1.8,
    alignment: "center",
  },
  stripe: {
    ...stripe,
    markViewBox: "119.24 119.24 273.52 273.52",
    logoViewBox: "0 0 512 214",
    ratio: 1.8,
    alignment: "center",
  },
  pandadoc: {
    ...pandadoc,
    markViewBox: "11.413333 11.2 41.173333 41.706667",
    logoViewBox: "0 0 472.54475544500303 100",
    ratio: 1.8,
    alignment: "center",
  },
  zoho: {
    ...zoho,
    markViewBox: "5.973333 6.83112 1012.053333 436.337761",
    logoViewBox: "5.973333 6.83112 1012.053333 436.337761",
    ratio: 1.45,
    alignment: "center",
  },
  googleMeet: {
    ...googleMeet,
    markViewBox: "7.68 26.56 176.64 138.88",
    logoViewBox: "0 0 491.5250396772282 100",
    ratio: 1.8,
    alignment: "center",
  },
  googleSheets: {
    ...googleSheets,
    markViewBox: "7.68 31.68 176.64 128.64",
    logoViewBox: "0 0 543.4130178980616 100",
    ratio: 1.8,
    alignment: "center",
  },
  googleDocs: {
    ...googleDocs,
    markViewBox: "31.68 7.68 128.64 176.64",
    logoViewBox: "0 0 435.10824463287037 100",
    ratio: 1.8,
    alignment: "center",
  },
  googleSlides: {
    ...googleSlides,
    markViewBox: "11.52 14.4 168.96 163.2",
    logoViewBox: "0 0 482.8706980717599 100",
    ratio: 1.8,
    alignment: "center",
  },
  telegram: {
    ...telegram,
    markViewBox: "0 0 256 256",
    logoViewBox: "0 0 398.2931034482758 100",
    ratio: 1.8,
    alignment: "center",
  },
  zendesk: {
    ...zendesk,
    markViewBox: "0 0 256 194.35",
    logoViewBox: "0 0 512 99",
    ratio: 1.8,
    alignment: "center",
  },
  apollo: {
    ...apollo,
    markViewBox: "0 0 35.7082 36.1989",
    logoViewBox: "0 0 152 40",
    ratio: 1.8,
    alignment: "center",
  },
  hunter: {
    ...hunter,
    markViewBox: "0 4.843333 116.24 107.715733",
    logoViewBox: "0 0 653.08002 116.24",
    ratio: 1.8,
    alignment: "center",
  },
  airtable: {
    ...airtable,
    markViewBox: "0 0 256 215",
    logoViewBox: "0 0 459.3240318815681 100",
    ratio: 1.8,
    alignment: "center",
  },
  luma: {
    ...luma,
    markViewBox: "0.446309 0.893333 132.107383 132.213333",
    logoViewBox: "0 0 336.37298910042136 100",
    ratio: 1.8,
    alignment: "center",
  },
  aws: {
    ...aws,
    markViewBox: "0 0 256 153",
    logoViewBox: "0 0 256 153",
    ratio: 1.6,
    alignment: "center",
  },
  amazonS3: {
    ...amazonS3,
    markViewBox: "40.96 37.973333 173.226667 180.053333",
    logoViewBox: "0 0 508.3257725482391 100",
    ratio: 1.8,
    alignment: "center",
  },
  mailchimp: {
    ...mailchimp,
    markViewBox: "0 0 256 272",
    logoViewBox: "0 0 432.3967168262654 100",
    ratio: 1.8,
    alignment: "center",
  },
  evernote: {
    ...evernote,
    markViewBox: "24.64 18.293333 62.72 75.413333",
    logoViewBox: "0.745833 0.447458 177.359167 43.105085",
    ratio: 1.8,
    alignment: "center",
  },
  mixmax: {
    ...mixmax,
    markViewBox: "0 0 56.364 44.469",
    logoViewBox: "0 0 231 45",
    ratio: 1.8,
    alignment: "center",
  },
  turbopuffer: {
    ...turbopuffer,
    markViewBox: "0 0 213 131",
    logoViewBox: "0 0 917 132",
    ratio: 1.55,
    alignment: "center",
  },
  typeform: {
    ...typeform,
    markViewBox: "0 0 33.08 21.72",
    logoViewBox: "0 0 477.7565712372342 100",
    ratio: 1.6,
    alignment: "center",
  },
  calendly: {
    ...calendly,
    markViewBox: "0 0 32 32",
    logoViewBox: "0 0 424.0210778667957 100",
    ratio: 1.8,
    alignment: "center",
  },
  modal: {
    ...modal,
    markViewBox: "0 0 367.36 192",
    logoViewBox: "0 0 506.29401116663405 100",
    ratio: 1.55,
    alignment: "center",
  },
  taskrabbit: {
    ...taskrabbit,
    markViewBox: "13 52.9 250 170.19",
    logoViewBox: "100.13 101 760.53 101.04",
    ratio: 1.8,
    alignment: "center",
  },
  vercel: {
    ...vercel,
    markViewBox: "0 0 256 222",
    logoViewBox: "0 0 512 103",
    ratio: 1.8,
    alignment: "center",
  },
  miro: {
    ...miro,
    markViewBox: "0 0 256 256",
    logoViewBox: "0 0 876 320",
    ratio: 1.8,
    alignment: "center",
  },
  clay: {
    ...clay,
    markViewBox: "3.783102 6.053333 595.460277 447.946667",
    logoViewBox: "3.166667 0 196.666667 63",
    ratio: 1.8,
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

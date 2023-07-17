import { ReactNode } from "react";

import { UseCaseId } from "./use-cases";

export type TechnologyTreeNodeVariant =
  | "block-protocol"
  | "infrastructure"
  | "feature"
  | "experiment";

export type TechnologyTreeNodeStatus =
  | "done"
  | "in-progress"
  | "next-up"
  | "future";

export type TechnologyTreeNodeData = {
  id: string;
  heading: ReactNode;
  body?: ReactNode;
  variant: TechnologyTreeNodeVariant;
  status: TechnologyTreeNodeStatus;
  useCases: UseCaseId[];
  parentIds?: string[];
};

export const technologyTreeData: TechnologyTreeNodeData[] = [
  {
    id: "0",
    heading: "Block Protocol Core Specification",
    body: "Placeholder body two lines hopefully bla bla bla",
    status: "done",
    useCases: ["website-building"],
    variant: "block-protocol",
  },
  {
    id: "1",
    heading: "UX/UI Outline",
    status: "done",
    useCases: ["website-building"],
    variant: "infrastructure",
  },
  {
    id: "3",
    heading: "Block Protocol Graph Module - inc. type system",
    status: "done",
    useCases: [],
    variant: "block-protocol",
  },
  {
    id: "4",
    heading: "Block Protocol Hook Module",
    body: "placeholder body",
    parentIds: ["0"],
    status: "done",
    useCases: [],
    variant: "block-protocol",
  },
  {
    id: "5",
    heading: "Frontend App Scaffolding",
    body: "placeholder body",
    parentIds: ["1"],
    status: "done",
    useCases: [],
    variant: "infrastructure",
  },
  {
    id: "6",
    heading: "Rust Graph",
    body: "placeholder body",
    parentIds: ["1", "3"],
    status: "done",
    useCases: [],
    variant: "infrastructure",
  },
  {
    id: "7",
    heading: "Hook Providers",
    body: "placeholder body",
    parentIds: ["4"],
    status: "done",

    useCases: [],
    variant: "infrastructure",
  },
  {
    id: "8",
    heading: "Core System Types - e.g. User, Org, etc.",
    body: "placeholder body",
    parentIds: ["6"],
    status: "done",

    useCases: [],
    variant: "infrastructure",
  },
  {
    id: "9",
    heading: "Basic Primitive Blocks - e.g. heading, paragraph",
    body: "placeholder body",
    parentIds: ["7"],
    status: "done",

    useCases: [],
    variant: "feature",
  },
  {
    id: "10",
    heading: "Entity Type Editor",
    body: "placeholder body",
    parentIds: ["8"],
    status: "done",

    useCases: [],
    variant: "feature",
  },
  {
    id: "11",
    heading: "Basic Authentication - Kratos and login/logout/signup",
    body: "placeholder body",
    parentIds: ["8"],
    status: "done",

    useCases: [],
    variant: "feature",
  },
  {
    id: "12",
    heading: "Block Protocol Service Module",
    body: "placeholder body",
    parentIds: ["9"],
    status: "done",
    useCases: [],
    variant: "block-protocol",
  },
  {
    id: "13",
    heading: "Entity Editor",
    body: "placeholder body",
    parentIds: ["10"],
    status: "done",

    useCases: [],
    variant: "feature",
  },
  {
    id: "14",
    heading: "Block Protocol API Middleware",
    body: "placeholder body",
    parentIds: ["12"],
    status: "done",

    useCases: [],
    variant: "block-protocol",
  },
  {
    id: "15",
    heading: "Linear Pages",
    body: "placeholder body",
    parentIds: ["5"],
    status: "done",

    useCases: [],
    variant: "feature",
  },
  {
    id: "16",
    heading: "Prototype Multiplayer",
    body: "placeholder body",
    parentIds: ["11"],
    status: "done",

    useCases: [],
    variant: "experiment",
  },
  {
    id: "17",
    heading: "Entity Archival (Soft Deletion)",
    body: "placeholder body",
    parentIds: ["13", "3"],
    status: "done",

    useCases: [],
    variant: "feature",
  },
  {
    id: "18",
    heading: "Canvas Pages",
    body: "placeholder body",
    parentIds: ["15"],
    status: "done",

    useCases: [],
    variant: "feature",
  },
  {
    id: "19",
    heading: "Block-Level Comments",
    body: "placeholder body",
    parentIds: ["15"],
    status: "done",

    useCases: [],
    variant: "feature",
  },
  {
    id: "20",
    heading: "Prototype implementation of search",
    body: "placeholder body",
    parentIds: ["15"],
    status: "done",

    useCases: [],
    variant: "experiment",
  },
  {
    id: "21",
    heading: "Task Executor - powered by Temporal",
    body: "placeholder body",
    parentIds: ["14"],
    status: "done",

    useCases: [],
    variant: "infrastructure",
  },
  {
    id: "22",
    heading: "@mentioning of users and entities",
    body: "placeholder body",
    parentIds: ["15", "7"],
    status: "done",

    useCases: [],
    variant: "feature",
  },
  {
    id: "23",
    heading: "API-powered blocks - e.g. OpenAI & Mapbox",
    body: "placeholder body",
    parentIds: ["14"],
    status: "done",

    useCases: [],
    variant: "feature",
  },
  {
    id: "24",
    heading: "Command Bar",
    body: "placeholder body",
    parentIds: ["20"],
    status: "done",

    useCases: [],
    variant: "feature",
  },
  {
    id: "25",
    heading: "Type Inheritance RFC",
    body: "placeholder body",
    parentIds: ["3"],
    status: "done",
    useCases: [],
    variant: "block-protocol",
  },
  {
    id: "26",
    heading: "AI Type Creation",
    body: "placeholder body",
    parentIds: ["21"],
    status: "in-progress",
    useCases: [],
    variant: "feature",
  },
  {
    id: "27",
    heading: "User & Org Management",
    body: "placeholder body",
    parentIds: ["23"],
    status: "in-progress",
    useCases: [],
    variant: "feature",
  },
  {
    id: "28",
    heading: "Entity Validation",
    body: "placeholder body",
    parentIds: ["3"],
    status: "in-progress",
    useCases: [],
    variant: "feature",
  },
  {
    id: "29",
    heading: "Type Archival (Soft Deletion)",
    body: "placeholder body",
    parentIds: ["26"],
    status: "next-up",
    useCases: [],
    variant: "feature",
  },
  {
    id: "30",
    heading: "AI Entity Creation",
    body: "placeholder body",
    parentIds: ["26"],
    status: "next-up",
    useCases: [],
    variant: "feature",
  },
  {
    id: "31",
    heading: "Block Protocol Actions Module",
    body: "placeholder body",
    parentIds: ["24"],
    status: "next-up",
    useCases: [],
    variant: "block-protocol",
  },
  {
    id: "32",
    heading: "Type Inheritance",
    body: "placeholder body",
    parentIds: ["25", "28"],
    status: "next-up",
    useCases: [],
    variant: "feature",
  },
  {
    id: "33",
    heading: "Notifications",
    body: "placeholder body",
    parentIds: ["21", "22", "27"],
    status: "future",
    useCases: [],
    variant: "feature",
  },
  {
    id: "34",
    heading: "Data Query & Selection Interfaces",
    body: "placeholder body",
    parentIds: ["9"],
    status: "future",
    useCases: [],
    variant: "feature",
  },
  {
    id: "35",
    heading: "Authorization",
    body: "placeholder body",
    parentIds: ["23", "27"],
    status: "future",
    useCases: [],
    variant: "feature",
  },
  {
    id: "36",
    heading: "Block Action Mapping",
    body: "placeholder body",
    parentIds: ["31"],
    status: "future",
    useCases: [],
    variant: "feature",
  },
  {
    id: "37",
    heading: "Realtime Service",
    body: "basically a sync engine, powers our multi-backend & collab",
    parentIds: ["16"],
    status: "future",
    useCases: [],
    variant: "infrastructure",
  },
  {
    id: "38",
    heading: "Multi-Type Entities",
    body: "placeholder body",
    parentIds: ["32"],
    status: "future",
    useCases: [],
    variant: "feature",
  },
  {
    id: "39",
    heading: "Custom Data Types RFC",
    body: "placeholder body",
    parentIds: ["25"],
    status: "future",
    useCases: [],
    variant: "block-protocol",
  },
  {
    id: "40",
    heading: "Flows",
    body: "placeholder body",
    parentIds: ["21", "33", "34"],
    status: "future",
    useCases: [],
    variant: "feature",
  },
];

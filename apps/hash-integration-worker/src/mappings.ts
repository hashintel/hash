import {
  Attachment,
  Comment,
  CustomView,
  Cycle,
  Document,
  Issue,
  IssueLabel,
  Organization,
  Project,
  ProjectMilestone,
  Team,
  User,
} from "@linear/sdk";

export const userToEntity = (user: User): object => {
  return {
    "https://app.hash.ai/@linear/types/property-type/user-id/": user.id,
  };
};

export const organizationToEntity = (_organization: Organization): object => {
  return {};
};

export const teamToEntity = (_team: Team): object => {
  return {};
};

export const issueToEntity = (_issue: Issue): object => {
  return {};
};

export const issueLabelToEntity = (_issueLabel: IssueLabel): object => {
  return {};
};

export const cycleToEntity = (_cycle: Cycle): object => {
  return {};
};

export const customViewToEntity = (_customView: CustomView): object => {
  return {};
};

export const projectToEntity = (_project: Project): object => {
  return {};
};

export const commentToEntity = (_comment: Comment): object => {
  return {};
};

export const projectMilestoneToEntity = (
  _projectMilestone: ProjectMilestone,
): object => {
  return {};
};

export const documentToEntity = (_document: Document): object => {
  return {};
};

export const attachmentToEntity = (_attachment: Attachment): object => {
  return {};
};

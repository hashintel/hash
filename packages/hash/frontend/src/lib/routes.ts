export const constructPageRelativeUrl = (params: {
  workspaceShortname: string;
  pageEntityUuid: string;
}): string => `/@${params.workspaceShortname}/${params.pageEntityUuid}`;

import { GroupTreeDto } from "../types";

export interface FlatGroup {
  id: number;
  name: string;
  quota: number;
  usedQuota: number;
  availableQuota: number;
  level: number;
}

export const flattenGroups = (groups: GroupTreeDto[], level = 0): FlatGroup[] =>
  groups.flatMap((group) => [
    {
      id: group.id,
      name: group.name,
      quota: group.quota,
      usedQuota: group.usedQuota,
      availableQuota: group.availableQuota,
      level,
    },
    ...flattenGroups(group.children ?? [], level + 1),
  ]);

export const groupNameById = (groups: GroupTreeDto[], groupId?: number | string | null): string => {
  if (groupId === undefined || groupId === null || groupId === "") return "-";

  const normalizedGroupId = Number(groupId);

  for (const group of groups) {
    if (group.id === normalizedGroupId) return group.name;
    const childName = groupNameById(group.children ?? [], normalizedGroupId);
    if (childName !== "-") return childName;
  }

  return String(groupId);
};

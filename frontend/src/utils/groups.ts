import { GroupTreeDto } from "../types";

export interface FlatGroup {
  id: string;
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

export const groupNameById = (groups: GroupTreeDto[], groupId?: string | null): string => {
  if (!groupId) return "-";

  for (const group of groups) {
    if (group.id === groupId) return group.name;
    const childName = groupNameById(group.children ?? [], groupId);
    if (childName !== "-") return childName;
  }

  return groupId;
};

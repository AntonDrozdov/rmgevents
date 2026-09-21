import React, { ChangeEvent, DragEvent, MouseEvent, WheelEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Modal } from "../components/Modal";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";
import type {
  ApplyGroupTemplateResultDto,
  ApplyOriginalStructureResultDto,
  GroupTemplateDto,
  GroupTreeDto,
  OrganizationDepartmentTreeItemDto,
  OrganizationEmployeeTreeItemDto,
  OrganizationImportResultDto,
  OrganizationStructureTreeDto,
  ResetGroupsResultDto,
  RoleDto,
  UserDto,
  UserSearchResultDto,
} from "../types";

type GroupNodeProps = {
  group: GroupTreeDto;
  parentGroup?: GroupTreeDto;
  isRoot?: boolean;
  canCreate: boolean;
  highlightedGroupId?: number | null;
  activeBranchGroupIds: Set<number>;
  draggedGroupId: number | null;
  dragOverGroupId: number | null;
  collapsedGroupIds: Set<number>;
  onToggleCollapse: (groupId: number) => void;
  onCreateChild: (group: GroupTreeDto) => void;
  onEdit: (group: GroupTreeDto, parentGroup?: GroupTreeDto) => void;
  onDelete: (group: GroupTreeDto) => void;
  canDropOnGroup: (group: GroupTreeDto) => boolean;
  onGroupMouseDown: (event: MouseEvent<HTMLElement>, group: GroupTreeDto, isRoot: boolean) => void;
  onGroupDragStart: (event: DragEvent<HTMLElement>, group: GroupTreeDto, isRoot: boolean) => void;
  onGroupDragOver: (event: DragEvent<HTMLElement>, group: GroupTreeDto) => void;
  onGroupDragLeave: (event: DragEvent<HTMLElement>, group: GroupTreeDto) => void;
  onGroupDrop: (event: DragEvent<HTMLElement>, group: GroupTreeDto) => void;
  onGroupDragEnd: () => void;
};

type GroupSearchOption = {
  group: GroupTreeDto;
  path: string;
  depth: number;
};

type GroupEditTab = "settings" | "create-user" | "users";

type OrganizationDepartmentPathOption = {
  department: OrganizationDepartmentTreeItemDto;
  pathParts: string[];
  normalizedPath: string;
};

const GROUP_TREE_MIN_ZOOM = 0.5;
const GROUP_TREE_MAX_ZOOM = 1.8;
const GROUP_TREE_ZOOM_STEP = 0.1;

const EditIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 20h4l11-11-4-4L4 16v4Zm12.5-16.5 4 4 1-1a1.4 1.4 0 0 0 0-2l-2-2a1.4 1.4 0 0 0-2 0l-1 1Z" />
  </svg>
);

const DeleteIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 21a2 2 0 0 1-2-2V6h14v13a2 2 0 0 1-2 2H7Zm1-3h2V9H8v9Zm6 0h2V9h-2v9ZM4 5V3h5l1-1h4l1 1h5v2H4Z" />
  </svg>
);

const CollapseAllIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 5h10v2H7V5Zm2.3 7L12 9.3l2.7 2.7 1.4-1.4L12 6.5l-4.1 4.1L9.3 12ZM7 17h10v2H7v-2Zm7.7-5L12 14.7 9.3 12l-1.4 1.4 4.1 4.1 4.1-4.1-1.4-1.4Z" />
  </svg>
);

const ExpandAllIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 5h10v2H7V5Zm2.3 4.5L12 12.2l2.7-2.7 1.4 1.4L12 15l-4.1-4.1 1.4-1.4ZM7 17h10v2H7v-2Z" />
  </svg>
);

const ArrowUpIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 5 5 12l1.4 1.4 4.6-4.6V20h2V8.8l4.6 4.6L19 12l-7-7Z" />
  </svg>
);

const ArrowDownIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M11 4v11.2l-4.6-4.6L5 12l7 7 7-7-1.4-1.4-4.6 4.6V4h-2Z" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m9.3 6.7 1.4-1.4 6.7 6.7-6.7 6.7-1.4-1.4 5.3-5.3-5.3-5.3Z" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m6.7 9.3 1.4-1.4 3.9 3.9 3.9-3.9 1.4 1.4-5.3 5.3-5.3-5.3Z" />
  </svg>
);

const countGroups = (groups: GroupTreeDto[]): number =>
  groups.reduce((total, group) => total + 1 + countGroups(group.children ?? []), 0);

const getMaxGroupDepth = (groups: GroupTreeDto[], depth = 1): number =>
  groups.reduce(
    (maxDepth, group) => Math.max(maxDepth, depth, getMaxGroupDepth(group.children ?? [], depth + 1)),
    0
  );

const getCollapsedGroupIdsForVisibleDepth = (
  groups: GroupTreeDto[],
  visibleDepth: number,
  depth = 1
): number[] =>
  groups.flatMap((group) => {
    const children = group.children ?? [];
    if (children.length === 0) return [];

    if (depth >= visibleDepth) return [group.id];

    return getCollapsedGroupIdsForVisibleDepth(children, visibleDepth, depth + 1);
  });

const getAvailableChildQuota = (group: GroupTreeDto): number =>
  Math.max(0, group.quota - (group.children ?? []).reduce((total, child) => total + child.quota, 0));

const clampGroupTreeZoom = (value: number) =>
  Math.min(GROUP_TREE_MAX_ZOOM, Math.max(GROUP_TREE_MIN_ZOOM, Math.round(value * 10) / 10));

const normalizeGroupSearch = (value: string) => value.trim().toLocaleLowerCase("ru-RU");

const normalizeSearch = (value: string) => value.trim().toLocaleLowerCase("ru-RU");

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const formatUserName = (user: Pick<UserDto, "surname" | "name" | "additionalName">) =>
  [user.surname, user.name, user.additionalName].filter(Boolean).join(" ");

const isAdministratorRoleName = (roleName?: string | null) => roleName?.toLowerCase() === "administrator";

const emptyEmployeeForm = (groupId = "", roleId = "") => ({
  surname: "",
  name: "",
  additionalName: "",
  email: "",
  login: "",
  tel: "",
  roleId,
  groupId,
});

const HighlightedText: React.FC<{ value: string; query: string }> = ({ value, query }) => {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return <>{value}</>;

  const parts = value.split(new RegExp(`(${escapeRegExp(trimmedQuery)})`, "ig"));
  return (
    <>
      {parts.map((part, index) =>
        part.toLocaleLowerCase("ru-RU") === trimmedQuery.toLocaleLowerCase("ru-RU") ? (
          <mark className="org-tree-search-highlight" key={`${part}-${index}`}>
            {part}
          </mark>
        ) : (
          <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
        )
      )}
    </>
  );
};

const departmentMatchesSearch = (department: OrganizationDepartmentTreeItemDto, query: string): boolean => {
  if (!query) return true;

  const ownMatch = normalizeSearch(department.name).includes(query);
  const employeeMatch = department.employees.some((employee) =>
    normalizeSearch(`${employee.fullName} ${employee.position}`).includes(query)
  );
  const childMatch = department.children.some((child) => departmentMatchesSearch(child, query));

  return ownMatch || employeeMatch || childMatch;
};

const buildOrganizationDepartmentPathOptions = (
  departments: OrganizationDepartmentTreeItemDto[],
  parentNames: string[] = []
): OrganizationDepartmentPathOption[] =>
  departments.flatMap((department) => {
    const pathParts = [...parentNames, department.name];
    return [
      {
        department,
        pathParts,
        normalizedPath: pathParts.map(normalizeSearch).join(" / "),
      },
      ...buildOrganizationDepartmentPathOptions(department.children ?? [], pathParts),
    ];
  });

const getGroupDepartmentPath = (groupOption: GroupSearchOption | null) =>
  groupOption?.path
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(1) ?? [];

const findMatchingOrganizationDepartment = (
  departments: OrganizationDepartmentTreeItemDto[],
  groupDepartmentPath: string[]
) => {
  if (groupDepartmentPath.length === 0) return null;

  const normalizedGroupPath = groupDepartmentPath.map(normalizeSearch).join(" / ");
  const options = buildOrganizationDepartmentPathOptions(departments);

  return (
    options.find((option) => option.normalizedPath === normalizedGroupPath)?.department ??
    options.find((option) =>
      normalizeSearch(option.department.name) === normalizeSearch(groupDepartmentPath[groupDepartmentPath.length - 1])
    )?.department ??
    null
  );
};

const flattenGroups = (groups: GroupTreeDto[]): GroupTreeDto[] =>
  groups.flatMap((group) => [group, ...flattenGroups(group.children ?? [])]);

const getCollapsibleGroupIds = (groups: GroupTreeDto[]): number[] =>
  groups.flatMap((group) => {
    const children = group.children ?? [];
    return children.length > 0
      ? [group.id, ...getCollapsibleGroupIds(children)]
      : [];
  });

const buildGroupSearchOptions = (
  groups: GroupTreeDto[],
  parentNames: string[] = []
): GroupSearchOption[] =>
  groups.flatMap((group) => {
    const pathParts = [...parentNames, group.name];
    return [
      {
        group,
        path: pathParts.join(" / "),
        depth: parentNames.length,
      },
      ...buildGroupSearchOptions(group.children ?? [], pathParts),
    ];
  });

const filterGroupSearchOptions = (
  options: GroupSearchOption[],
  searchValue: string
): GroupSearchOption[] => {
  const query = normalizeGroupSearch(searchValue);
  if (!query) return options;

  return options
    .map((option) => {
      const name = normalizeGroupSearch(option.group.name);
      const path = normalizeGroupSearch(option.path);
      const score =
        name === query ? 0 :
        name.startsWith(query) ? 1 :
        name.includes(query) ? 2 :
        path.includes(query) ? 3 :
        -1;

      return { option, score };
    })
    .filter((item) => item.score >= 0)
    .sort((left, right) => left.score - right.score || left.option.path.localeCompare(right.option.path, "ru-RU"))
    .map((item) => item.option);
};

const findGroupByName = (groups: GroupTreeDto[], searchValue: string): GroupTreeDto | null => {
  const query = normalizeGroupSearch(searchValue);
  if (!query) return null;

  const allGroups = flattenGroups(groups);
  return (
    allGroups.find((group) => normalizeGroupSearch(group.name) === query) ??
    allGroups.find((group) => normalizeGroupSearch(group.name).includes(query)) ??
    null
  );
};

const findGroupPathById = (groups: GroupTreeDto[], groupId: number, currentPath: number[] = []): number[] | null => {
  for (const group of groups) {
    const nextPath = [...currentPath, group.id];
    if (group.id === groupId) return nextPath;

    const childPath = findGroupPathById(group.children ?? [], groupId, nextPath);
    if (childPath) return childPath;
  }

  return null;
};

const findGroupById = (groups: GroupTreeDto[], groupId: number): GroupTreeDto | null => {
  for (const group of groups) {
    if (group.id === groupId) return group;

    const foundChild = findGroupById(group.children ?? [], groupId);
    if (foundChild) return foundChild;
  }

  return null;
};

const buildParentGroupIdMap = (groups: GroupTreeDto[], parentGroupId: number | null = null): Map<number, number | null> => {
  const result = new Map<number, number | null>();

  const visit = (items: GroupTreeDto[], parentId: number | null) => {
    items.forEach((group) => {
      result.set(group.id, parentId);
      visit(group.children ?? [], group.id);
    });
  };

  visit(groups, parentGroupId);
  return result;
};

const getBranchGroupIds = (group: GroupTreeDto | null): Set<number> =>
  new Set(group ? [group.id, ...flattenGroups(group.children ?? []).map((child) => child.id)] : []);

const isInteractiveElement = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  Boolean(target.closest("button, a, input, select, textarea, [role='button']"));

const getApiErrorMessage = (error: unknown, fallback: string) => {
  const responseData = (error as { response?: { data?: unknown } })?.response?.data;
  if (typeof responseData === "string" && responseData.trim()) return responseData;
  if (
    responseData &&
    typeof responseData === "object" &&
    "message" in responseData &&
    typeof (responseData as { message?: unknown }).message === "string"
  ) {
    return (responseData as { message: string }).message;
  }

  return fallback;
};

const GroupNode = ({
  group,
  parentGroup,
  isRoot = false,
  canCreate,
  highlightedGroupId,
  activeBranchGroupIds,
  draggedGroupId,
  dragOverGroupId,
  collapsedGroupIds,
  onToggleCollapse,
  onCreateChild,
  onEdit,
  onDelete,
  canDropOnGroup,
  onGroupMouseDown,
  onGroupDragStart,
  onGroupDragOver,
  onGroupDragLeave,
  onGroupDrop,
  onGroupDragEnd,
}: GroupNodeProps) => {
  const children = group.children ?? [];
  const hasChildren = children.length > 0;
  const isCollapsed = collapsedGroupIds.has(group.id);
  const isDragBranch = activeBranchGroupIds.has(group.id);
  const isDropTarget = dragOverGroupId === group.id;
  const canDropHere = isDropTarget && canDropOnGroup(group);

  return (
  <li className="group-tree-item">
    <article
      id={`group-node-${group.id}`}
      draggable={canCreate && !isRoot}
      className={[
        "group-tree-node",
        canCreate && !isRoot ? "group-tree-node-draggable" : "",
        group.quota === 0 ? "group-tree-node-zero-quota" : "",
        highlightedGroupId === group.id ? "group-tree-node-highlighted" : "",
        isDragBranch ? "group-tree-node-drag-branch" : "",
        draggedGroupId === group.id ? "group-tree-node-drag-source" : "",
        isDropTarget ? (canDropHere ? "group-tree-node-drop-target" : "group-tree-node-drop-disabled") : "",
      ].filter(Boolean).join(" ")}
      onMouseDown={(event) => onGroupMouseDown(event, group, isRoot)}
      onDragStart={(event) => onGroupDragStart(event, group, isRoot)}
      onDragOver={(event) => onGroupDragOver(event, group)}
      onDragLeave={(event) => onGroupDragLeave(event, group)}
      onDrop={(event) => onGroupDrop(event, group)}
      onDragEnd={onGroupDragEnd}
    >
      <div className="group-tree-node-content">
        <strong>{group.name}</strong>
        <span>Квота: {group.quota}</span>
      </div>
      {(canCreate || hasChildren) && (
        <div className="group-tree-node-actions">
          {canCreate && (
            <>
              <button
                className="icon-button"
                type="button"
                aria-label={`Редактировать группу ${group.name}`}
                title="Редактировать группу"
                onClick={() => onEdit(group, parentGroup)}
              >
                <EditIcon />
              </button>
              {!isRoot && (
                <button
                  className="icon-button icon-button-danger"
                  type="button"
                  aria-label={`Удалить группу ${group.name}`}
                  title="Удалить группу"
                  onClick={() => onDelete(group)}
                >
                  <DeleteIcon />
                </button>
              )}
              <button
                className="icon-button group-tree-add-inline"
                type="button"
                aria-label={`Создать дочернюю группу для ${group.name}`}
                title="Создать дочернюю группу"
                onClick={() => onCreateChild(group)}
              >
                +
              </button>
            </>
          )}
          {hasChildren && (
            <button
              className="group-tree-collapse-toggle"
              type="button"
              aria-expanded={!isCollapsed}
              aria-label={`${isCollapsed ? "Развернуть" : "Свернуть"} группу ${group.name}`}
              title={isCollapsed ? "Развернуть ветку" : "Свернуть ветку"}
              onClick={() => onToggleCollapse(group.id)}
            >
              {isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
            </button>
          )}
        </div>
      )}
    </article>

    {hasChildren && !isCollapsed && (
      <ul className="group-tree-children">
        {children.map((child) => (
          <GroupNode
            key={child.id}
            group={child}
            parentGroup={group}
            canCreate={canCreate}
            highlightedGroupId={highlightedGroupId}
            activeBranchGroupIds={activeBranchGroupIds}
            draggedGroupId={draggedGroupId}
            dragOverGroupId={dragOverGroupId}
            collapsedGroupIds={collapsedGroupIds}
            onToggleCollapse={onToggleCollapse}
            onCreateChild={onCreateChild}
            onEdit={onEdit}
            onDelete={onDelete}
            canDropOnGroup={canDropOnGroup}
            onGroupMouseDown={onGroupMouseDown}
            onGroupDragStart={onGroupDragStart}
            onGroupDragOver={onGroupDragOver}
            onGroupDragLeave={onGroupDragLeave}
            onGroupDrop={onGroupDrop}
            onGroupDragEnd={onGroupDragEnd}
          />
        ))}
      </ul>
    )}
  </li>
  );
};

const OrganizationDepartmentNode: React.FC<{
  department: OrganizationDepartmentTreeItemDto;
  query: string;
  depth: number;
  selectedEmployeeId: number | null;
  onSelectEmployee: (employee: OrganizationEmployeeTreeItemDto) => void;
}> = ({ department, query, depth, selectedEmployeeId, onSelectEmployee }) => {
  const [isOpen, setIsOpen] = useState(depth < 1);
  const normalizedQuery = normalizeSearch(query);
  const visibleEmployees = normalizedQuery
    ? department.employees.filter((employee) =>
        normalizeSearch(`${employee.fullName} ${employee.position}`).includes(normalizedQuery)
      )
    : department.employees;
  const visibleChildren = department.children.filter((child) => departmentMatchesSearch(child, normalizedQuery));
  const hasContent = visibleEmployees.length > 0 || visibleChildren.length > 0;

  useEffect(() => {
    if (normalizedQuery && hasContent) setIsOpen(true);
  }, [normalizedQuery, hasContent]);

  if (!hasContent && normalizedQuery) return null;

  return (
    <li className="org-tree-department">
      <button
        className="org-tree-department-button"
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        style={{ paddingLeft: 10 + depth * 12 }}
      >
        <span aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
        <strong>
          <HighlightedText value={department.name} query={query} />
        </strong>
        <small>{department.employees.length}</small>
      </button>
      {isOpen && (
        <div className="org-tree-department-content">
          {visibleEmployees.map((employee) => (
            <button
              className={`org-tree-employee${selectedEmployeeId === employee.id ? " selected" : ""}`}
              key={employee.id}
              type="button"
              onClick={() => onSelectEmployee(employee)}
              style={{ paddingLeft: 30 + depth * 12 }}
            >
              <span>
                <HighlightedText value={employee.fullName} query={query} />
              </span>
              <small>
                <HighlightedText value={employee.position} query={query} />
              </small>
            </button>
          ))}
          {visibleChildren.length > 0 && (
            <ul className="org-tree-list">
              {visibleChildren.map((child) => (
                <OrganizationDepartmentNode
                  key={child.id}
                  department={child}
                  query={query}
                  depth={depth + 1}
                  selectedEmployeeId={selectedEmployeeId}
                  onSelectEmployee={onSelectEmployee}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
};

export const GroupsPage = () => {
  const { eventId = "" } = useParams<{ eventId: string }>();
  const { currentUser, currentEvent, events } = useAuth();
  const originalStructureInputRef = useRef<HTMLInputElement | null>(null);
  const groupsTreeScrollRef = useRef<HTMLDivElement | null>(null);
  const groupsTreePanRef = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [groups, setGroups] = useState<GroupTreeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [structureLoading, setStructureLoading] = useState(false);
  const [structureMessage, setStructureMessage] = useState<string | null>(null);
  const [structureWarnings, setStructureWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaveTemplateModalOpen, setIsSaveTemplateModalOpen] = useState(false);
  const [isApplyTemplateModalOpen, setIsApplyTemplateModalOpen] = useState(false);
  const [templates, setTemplates] = useState<GroupTemplateDto[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [templateForm, setTemplateForm] = useState({ name: "", description: "" });
  const [parentGroup, setParentGroup] = useState<GroupTreeDto | null>(null);
  const [editingGroup, setEditingGroup] = useState<{
    group: GroupTreeDto;
    parentGroup?: GroupTreeDto;
  } | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<GroupTreeDto | null>(null);
  const [isResetGroupsModalOpen, setIsResetGroupsModalOpen] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");
  const [groupSearchMessage, setGroupSearchMessage] = useState<string | null>(null);
  const [isGroupSearchOpen, setIsGroupSearchOpen] = useState(false);
  const [activeGroupSearchOptionIndex, setActiveGroupSearchOptionIndex] = useState(0);
  const [highlightedGroupId, setHighlightedGroupId] = useState<number | null>(null);
  const [pressedGroupId, setPressedGroupId] = useState<number | null>(null);
  const [draggedGroupId, setDraggedGroupId] = useState<number | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<number | null>(null);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<number>>(() => new Set());
  const [groupTreeZoom, setGroupTreeZoom] = useState(1);
  const [isGroupTreePanning, setIsGroupTreePanning] = useState(false);
  const [moveParentSearch, setMoveParentSearch] = useState("");
  const [isMoveParentSearchOpen, setIsMoveParentSearchOpen] = useState(false);
  const [activeMoveParentOptionIndex, setActiveMoveParentOptionIndex] = useState(0);
  const [form, setForm] = useState({ name: "", quota: 1 });
  const [editForm, setEditForm] = useState({ name: "", quota: 0, parentGroupId: null as number | null });
  const [activeEditTab, setActiveEditTab] = useState<GroupEditTab>("settings");
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [referencesLoading, setReferencesLoading] = useState(false);
  const [employeeFormData, setEmployeeFormData] = useState(emptyEmployeeForm());
  const [employeeLoginManuallyEdited, setEmployeeLoginManuallyEdited] = useState(false);
  const [organizationTree, setOrganizationTree] = useState<OrganizationStructureTreeDto | null>(null);
  const [organizationTreeLoading, setOrganizationTreeLoading] = useState(false);
  const [organizationTreeError, setOrganizationTreeError] = useState<string | null>(null);
  const [organizationTreeSearch, setOrganizationTreeSearch] = useState("");
  const [showOnlyCurrentDepartmentEmployees, setShowOnlyCurrentDepartmentEmployees] = useState(true);
  const [selectedOrganizationEmployeeId, setSelectedOrganizationEmployeeId] = useState<number | null>(null);
  const [selectedOrganizationEmployeePosition, setSelectedOrganizationEmployeePosition] = useState<string | null>(null);
  const [similarUsers, setSimilarUsers] = useState<UserSearchResultDto[]>([]);
  const [similarUsersLoading, setSimilarUsersLoading] = useState(false);
  const [similarUsersError, setSimilarUsersError] = useState<string | null>(null);
  const [groupUsers, setGroupUsers] = useState<UserDto[]>([]);
  const [groupUsersLoading, setGroupUsersLoading] = useState(false);
  const [groupUsersError, setGroupUsersError] = useState<string | null>(null);

  const selectedEvent = useMemo(() => events.find((event) => String(event.id) === eventId) ?? currentEvent, [events, eventId, currentEvent]);
  const hasCreatePermission = currentUser?.permissions.includes("create_group") ?? false;
  const hasCreateUserPermission = currentUser?.permissions.includes("create_user") ?? false;
  const isArchived = selectedEvent?.isArchived ?? false;
  const canManageOriginalStructure = (currentUser?.permissions.includes("create_event") ?? false) && !isArchived;
  const canCreate = hasCreatePermission && !isArchived;
  const groupsCount = useMemo(() => countGroups(groups), [groups]);
  const maxGroupDepth = useMemo(() => Math.max(1, getMaxGroupDepth(groups)), [groups]);
  const groupDepthLevels = useMemo(
    () => Array.from({ length: maxGroupDepth }, (_, index) => index + 1),
    [maxGroupDepth]
  );
  const groupSearchOptions = useMemo(() => buildGroupSearchOptions(groups), [groups]);
  const parentGroupIdByGroupId = useMemo(() => buildParentGroupIdMap(groups), [groups]);
  const activeBranchSourceGroup = useMemo(
    () => findGroupById(groups, draggedGroupId ?? pressedGroupId ?? 0),
    [groups, draggedGroupId, pressedGroupId]
  );
  const activeBranchGroupIds = useMemo(
    () => getBranchGroupIds(activeBranchSourceGroup),
    [activeBranchSourceGroup]
  );
  const draggedGroup = useMemo(
    () => (draggedGroupId ? findGroupById(groups, draggedGroupId) : null),
    [groups, draggedGroupId]
  );
  const filteredGroupSearchOptions = useMemo(
    () => filterGroupSearchOptions(groupSearchOptions, groupSearch),
    [groupSearchOptions, groupSearch]
  );
  const activeGroupSearchOption = filteredGroupSearchOptions[activeGroupSearchOptionIndex] ?? null;
  const editingGroupDescendantIds = useMemo(
    () => new Set(editingGroup ? flattenGroups(editingGroup.group.children ?? []).map((group) => group.id) : []),
    [editingGroup]
  );
  const moveParentOptions = useMemo(
    () =>
      editingGroup
        ? groupSearchOptions.filter(
            (option) =>
              option.group.id !== editingGroup.group.id &&
              !editingGroupDescendantIds.has(option.group.id)
          )
        : [],
    [editingGroup, editingGroupDescendantIds, groupSearchOptions]
  );
  const filteredMoveParentOptions = useMemo(
    () => filterGroupSearchOptions(moveParentOptions, moveParentSearch),
    [moveParentOptions, moveParentSearch]
  );
  const activeMoveParentOption = filteredMoveParentOptions[activeMoveParentOptionIndex] ?? null;
  const initialEditParentGroupId = editingGroup?.parentGroup?.id ?? null;
  const selectedEditParentGroup = editForm.parentGroupId
    ? groupSearchOptions.find((option) => option.group.id === editForm.parentGroupId)?.group ?? null
    : null;
  const selectedTemplate = selectedTemplateId
    ? templates.find((template) => template.id === selectedTemplateId) ?? null
    : null;
  const editingGroupSearchOption = editingGroup
    ? groupSearchOptions.find((option) => option.group.id === editingGroup.group.id) ?? null
    : null;
  const editingGroupDepartmentPath = useMemo(
    () => getGroupDepartmentPath(editingGroupSearchOption),
    [editingGroupSearchOption]
  );
  const matchingOrganizationDepartment = useMemo(
    () =>
      organizationTree
        ? findMatchingOrganizationDepartment(organizationTree.departments, editingGroupDepartmentPath)
        : null,
    [editingGroupDepartmentPath, organizationTree]
  );
  const displayedOrganizationDepartments = useMemo(
    () =>
      showOnlyCurrentDepartmentEmployees && matchingOrganizationDepartment
        ? [matchingOrganizationDepartment]
        : organizationTree?.departments ?? [],
    [matchingOrganizationDepartment, organizationTree, showOnlyCurrentDepartmentEmployees]
  );
  const isOrganizationDepartmentFilterEmpty =
    showOnlyCurrentDepartmentEmployees &&
    Boolean(organizationTree) &&
    editingGroupDepartmentPath.length > 0 &&
    !matchingOrganizationDepartment;
  const isMovingGroup = editingGroup !== null && editForm.parentGroupId !== initialEditParentGroupId;
  const parentAvailableQuota = parentGroup ? getAvailableChildQuota(parentGroup) : 0;
  const editMinimumQuota = editingGroup
    ? isMovingGroup
      ? 0
      : (editingGroup.group.children ?? []).reduce((total, child) => total + child.quota, 0)
    : 0;
  const editMaximumQuota = editingGroup?.parentGroup
    ? (selectedEditParentGroup ?? editingGroup.parentGroup).quota -
      ((selectedEditParentGroup ?? editingGroup.parentGroup).children ?? [])
        .filter((child) => child.id !== editingGroup.group.id)
        .reduce((total, child) => total + child.quota, 0)
    : undefined;
  const isEditDirty = editingGroup !== null && (
    editForm.name.trim() !== editingGroup.group.name ||
    editForm.quota !== editingGroup.group.quota ||
    isMovingGroup
  );
  const isEmployeeRoleAdministrator = (roleId: string) => {
    const role = roles.find((item) => String(item.id) === roleId);
    return isAdministratorRoleName(role?.name);
  };
  const visibleGroupUsers = useMemo(
    () =>
      editingGroup
        ? groupUsers
            .filter((user) => user.groupId === editingGroup.group.id)
            .sort((left, right) => formatUserName(left).localeCompare(formatUserName(right), "ru-RU"))
        : [],
    [editingGroup, groupUsers]
  );

  const loadGroups = async () => {
    if (!eventId || !hasCreatePermission) {
      setGroups([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setGroups(await apiClient.getGroupTree(eventId));
    } catch (loadError) {
      console.error(loadError);
      setError("Не удалось загрузить дерево групп.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, hasCreatePermission]);

  useEffect(() => {
    setActiveGroupSearchOptionIndex(filteredGroupSearchOptions.length > 0 ? 0 : -1);
  }, [groupSearch, filteredGroupSearchOptions.length]);

  useEffect(() => {
    setActiveMoveParentOptionIndex(filteredMoveParentOptions.length > 0 ? 0 : -1);
  }, [moveParentSearch, filteredMoveParentOptions.length]);

  useEffect(() => {
    if (!pressedGroupId) return;

    const clearPressedGroup = () => {
      setPressedGroupId(null);
    };

    window.addEventListener("mouseup", clearPressedGroup);
    return () => window.removeEventListener("mouseup", clearPressedGroup);
  }, [pressedGroupId]);

  useEffect(() => {
    if (!isGroupTreePanning) return;

    const handleMouseMove = (event: globalThis.MouseEvent) => {
      const panState = groupsTreePanRef.current;
      const container = groupsTreeScrollRef.current;
      if (!panState || !container) return;

      event.preventDefault();
      container.scrollLeft = panState.scrollLeft - (event.clientX - panState.startX);
      container.scrollTop = panState.scrollTop - (event.clientY - panState.startY);
    };

    const stopPanning = () => {
      groupsTreePanRef.current = null;
      setIsGroupTreePanning(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopPanning);
    window.addEventListener("blur", stopPanning);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopPanning);
      window.removeEventListener("blur", stopPanning);
    };
  }, [isGroupTreePanning]);

  useEffect(() => {
    if (!editingGroup || activeEditTab !== "create-user" || roles.length > 0 || referencesLoading) return;

    const loadReferences = async () => {
      if (!eventId) return;

      setReferencesLoading(true);
      setError(null);
      try {
        const loadedRoles = await apiClient.getRoles(eventId);
        setRoles(loadedRoles);
        setEmployeeFormData((current) => ({
          ...current,
          roleId: current.roleId || String(loadedRoles[0]?.id ?? ""),
          groupId: String(editingGroup.group.id),
        }));
      } catch (loadError) {
        console.error(loadError);
        setError("Не удалось загрузить роли для создания сотрудника.");
      } finally {
        setReferencesLoading(false);
      }
    };

    void loadReferences();
  }, [activeEditTab, editingGroup, eventId, referencesLoading, roles.length]);

  useEffect(() => {
    if (!editingGroup || activeEditTab !== "create-user" || organizationTree || organizationTreeLoading) return;

    const loadOrganizationTree = async () => {
      if (!eventId) return;

      setOrganizationTreeLoading(true);
      setOrganizationTreeError(null);
      try {
        setOrganizationTree(await apiClient.getOrganizationStructureTree(eventId));
      } catch (loadError) {
        console.error(loadError);
        setOrganizationTreeError("Не удалось загрузить оригинальную структуру.");
      } finally {
        setOrganizationTreeLoading(false);
      }
    };

    void loadOrganizationTree();
  }, [activeEditTab, editingGroup, eventId, organizationTree, organizationTreeLoading]);

  useEffect(() => {
    if (!editingGroup || activeEditTab !== "users") return;

    const loadGroupUsers = async () => {
      if (!eventId) return;

      setGroupUsersLoading(true);
      setGroupUsersError(null);
      try {
        setGroupUsers(await apiClient.getUsers(eventId));
      } catch (loadError) {
        console.error(loadError);
        setGroupUsersError("Не удалось загрузить сотрудников группы.");
      } finally {
        setGroupUsersLoading(false);
      }
    };

    void loadGroupUsers();
  }, [activeEditTab, editingGroup, eventId]);

  useEffect(() => {
    if (!editingGroup || activeEditTab !== "create-user") return;

    const searchValue = {
      login: employeeFormData.login.trim(),
      surname: employeeFormData.surname.trim(),
      name: employeeFormData.name.trim(),
      email: employeeFormData.email.trim(),
    };
    const hasQuery = Object.values(searchValue).some((value) => value.length >= 2);
    if (!hasQuery) {
      setSimilarUsers([]);
      setSimilarUsersLoading(false);
      setSimilarUsersError(null);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setSimilarUsersLoading(true);
      setSimilarUsersError(null);
      try {
        setSimilarUsers(await apiClient.searchUsers(eventId, searchValue, controller.signal));
      } catch (searchError) {
        if (controller.signal.aborted) return;

        console.error(searchError);
        setSimilarUsers([]);
        setSimilarUsersError("Не удалось найти похожих сотрудников.");
      } finally {
        if (!controller.signal.aborted) setSimilarUsersLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    activeEditTab,
    editingGroup,
    employeeFormData.email,
    employeeFormData.login,
    employeeFormData.name,
    employeeFormData.surname,
    eventId,
  ]);

  const clearGroupDragState = () => {
    setPressedGroupId(null);
    setDraggedGroupId(null);
    setDragOverGroupId(null);
  };

  const canDropOnGroup = (targetGroup: GroupTreeDto) => {
    if (!draggedGroup || !canCreate || saving) return false;
    if (targetGroup.id === draggedGroup.id) return false;
    if (activeBranchGroupIds.has(targetGroup.id)) return false;

    const currentParentGroupId = parentGroupIdByGroupId.get(draggedGroup.id) ?? null;
    return targetGroup.id !== currentParentGroupId;
  };

  const expandGroupBranch = (group: GroupTreeDto) => {
    const branchIds = getBranchGroupIds(group);
    setCollapsedGroupIds((current) => {
      const next = new Set(current);
      branchIds.forEach((groupId) => next.delete(groupId));
      return next;
    });
  };

  const handleGroupMouseDown = (
    event: MouseEvent<HTMLElement>,
    group: GroupTreeDto,
    isRoot: boolean
  ) => {
    if (event.button !== 0 || isInteractiveElement(event.target)) return;

    setPressedGroupId(group.id);
    expandGroupBranch(group);
  };

  const handleGroupDragStart = (
    event: DragEvent<HTMLElement>,
    group: GroupTreeDto,
    isRoot: boolean
  ) => {
    if (isRoot || !canCreate || isInteractiveElement(event.target)) {
      event.preventDefault();
      return;
    }

    setPressedGroupId(group.id);
    setDraggedGroupId(group.id);
    setDragOverGroupId(null);
    expandGroupBranch(group);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(group.id));
  };

  const handleGroupDragOver = (event: DragEvent<HTMLElement>, group: GroupTreeDto) => {
    if (!draggedGroupId) return;

    setDragOverGroupId(group.id);
    if (canDropOnGroup(group)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    } else {
      event.dataTransfer.dropEffect = "none";
    }
  };

  const handleGroupDragLeave = (event: DragEvent<HTMLElement>, group: GroupTreeDto) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;

    setDragOverGroupId((current) => (current === group.id ? null : current));
  };

  const handleGroupDrop = async (event: DragEvent<HTMLElement>, targetGroup: GroupTreeDto) => {
    event.preventDefault();
    event.stopPropagation();

    const groupToMove = draggedGroup;
    if (!eventId || !groupToMove || !canDropOnGroup(targetGroup)) {
      clearGroupDragState();
      return;
    }

    clearGroupDragState();
    setSaving(true);
    setStructureMessage(null);
    setStructureWarnings([]);
    setError(null);
    try {
      await apiClient.updateGroup(eventId, groupToMove.id, {
        name: groupToMove.name,
        quota: 0,
        parentGroupId: targetGroup.id,
        moveToParent: true,
      });
      setStructureMessage(`Группа «${groupToMove.name}» перенесена в «${targetGroup.name}». Квоты перенесённой ветки сброшены в 0.`);
      await loadGroups();
    } catch (dropError) {
      console.error(dropError);
      setError(getApiErrorMessage(dropError, "Не удалось перенести группу."));
    } finally {
      setSaving(false);
    }
  };

  const toggleGroupCollapse = (groupId: number) => {
    setCollapsedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }

      return next;
    });
  };

  const collapseAllGroups = () => {
    setCollapsedGroupIds(new Set(getCollapsibleGroupIds(groups)));
  };

  const expandAllGroups = () => {
    setCollapsedGroupIds(new Set());
  };

  const collapseGroupsToDepth = (depth: number) => {
    if (depth >= maxGroupDepth) {
      expandAllGroups();
      return;
    }

    setCollapsedGroupIds(new Set(getCollapsedGroupIdsForVisibleDepth(groups, depth)));
  };

  const updateGroupTreeZoom = (nextZoomValue: number, anchor?: { clientX: number; clientY: number }) => {
    const container = groupsTreeScrollRef.current;
    const currentZoom = groupTreeZoom;
    const nextZoom = clampGroupTreeZoom(nextZoomValue);
    if (nextZoom === currentZoom) return;

    if (container && anchor) {
      const rect = container.getBoundingClientRect();
      const anchorX = anchor.clientX - rect.left;
      const anchorY = anchor.clientY - rect.top;
      const contentX = container.scrollLeft + anchorX;
      const contentY = container.scrollTop + anchorY;
      const zoomRatio = nextZoom / currentZoom;

      window.requestAnimationFrame(() => {
        container.scrollLeft = contentX * zoomRatio - anchorX;
        container.scrollTop = contentY * zoomRatio - anchorY;
      });
    }

    setGroupTreeZoom(nextZoom);
  };

  const zoomGroupTree = (direction: 1 | -1, anchor?: { clientX: number; clientY: number }) => {
    updateGroupTreeZoom(groupTreeZoom + direction * GROUP_TREE_ZOOM_STEP, anchor);
  };

  const zoomGroupTreeFromCenter = (direction: 1 | -1) => {
    const container = groupsTreeScrollRef.current;
    if (!container) {
      zoomGroupTree(direction);
      return;
    }

    const rect = container.getBoundingClientRect();
    zoomGroupTree(direction, {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    });
  };

  const handleGroupTreeWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    zoomGroupTree(event.deltaY < 0 ? 1 : -1, {
      clientX: event.clientX,
      clientY: event.clientY,
    });
  };

  const handleGroupTreePanStart = (event: MouseEvent<HTMLDivElement>) => {
    if (
      event.button !== 0 ||
      isInteractiveElement(event.target) ||
      (event.target instanceof HTMLElement && event.target.closest(".group-tree-node"))
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    groupsTreePanRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: event.currentTarget.scrollLeft,
      scrollTop: event.currentTarget.scrollTop,
    };
    setIsGroupTreePanning(true);
  };

  const scrollGroupsTree = (direction: "top" | "bottom") => {
    const container = groupsTreeScrollRef.current;
    if (!container) return;

    container.scrollTo({
      top: direction === "top" ? 0 : container.scrollHeight,
      behavior: "smooth",
    });
  };

  const navigateToGroup = (foundGroup: GroupTreeDto) => {
    setHighlightedGroupId(foundGroup.id);
    setGroupSearchMessage(`Найдена: ${foundGroup.name}`);
    setIsGroupSearchOpen(false);
    const foundPath = findGroupPathById(groups, foundGroup.id) ?? [foundGroup.id];
    const ancestorIds = new Set(foundPath.slice(0, -1));
    setCollapsedGroupIds((current) => {
      const next = new Set(current);
      ancestorIds.forEach((groupId) => next.delete(groupId));
      return next;
    });

    window.setTimeout(() => {
      document.getElementById(`group-node-${foundGroup.id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
    });
  };

  const selectGroupSearchOption = (option: GroupSearchOption) => {
    setGroupSearch(option.group.name);
    navigateToGroup(option.group);
  };

  const selectMoveParentOption = (option: GroupSearchOption) => {
    const isNewParent = option.group.id !== initialEditParentGroupId;
    setEditForm((current) => ({
      ...current,
      parentGroupId: option.group.id,
      quota: isNewParent ? 0 : editingGroup?.group.quota ?? current.quota,
    }));
    setMoveParentSearch(option.path);
    setIsMoveParentSearchOpen(false);
  };

  const runGroupSearch = (selectedGroup?: GroupTreeDto | null) => {
    const searchValue = groupSearch.trim();
    if (!searchValue && !selectedGroup) {
      setHighlightedGroupId(null);
      setGroupSearchMessage("Введите название группы.");
      return;
    }

    const foundGroup = selectedGroup ?? activeGroupSearchOption?.group ?? findGroupByName(groups, searchValue);
    if (!foundGroup) {
      setHighlightedGroupId(null);
      setGroupSearchMessage("Группа не найдена.");
      return;
    }

    setGroupSearch(foundGroup.name);
    navigateToGroup(foundGroup);
  };

  const useOrganizationEmployee = (employee: OrganizationEmployeeTreeItemDto) => {
    setSelectedOrganizationEmployeeId(employee.id);
    setSelectedOrganizationEmployeePosition(employee.position);
    setEmployeeFormData((current) => {
      const nextEmail = current.email;
      return {
        ...current,
        surname: employee.surname ?? current.surname,
        name: employee.name ?? current.name,
        additionalName: employee.additionalName ?? "",
        email: nextEmail,
        login: employeeLoginManuallyEdited ? current.login : nextEmail || current.login,
      };
    });
  };

  const useSimilarUser = (user: UserSearchResultDto) => {
    const role = roles.find((item) =>
      item.name.localeCompare(user.roleName ?? "", undefined, { sensitivity: "accent" }) === 0
    );

    setSelectedOrganizationEmployeeId(null);
    setSelectedOrganizationEmployeePosition(null);
    setEmployeeLoginManuallyEdited(true);
    setEmployeeFormData((current) => ({
      ...current,
      login: user.login,
      surname: user.surname,
      name: user.name,
      additionalName: user.additionalName ?? "",
      email: user.email ?? "",
      tel: user.tel ?? "",
      roleId: String(role?.id ?? current.roleId),
      groupId: editingGroup ? String(editingGroup.group.id) : current.groupId,
    }));
  };

  const createEmployeeInEditingGroup = async () => {
    if (
      !eventId ||
      !editingGroup ||
      !employeeFormData.login.trim() ||
      !employeeFormData.name.trim() ||
      !employeeFormData.surname.trim() ||
      !employeeFormData.email.trim() ||
      !employeeFormData.roleId
    ) return;

    setSaving(true);
    setError(null);
    try {
      await apiClient.createUser(eventId, {
        login: employeeFormData.login.trim(),
        name: employeeFormData.name.trim(),
        surname: employeeFormData.surname.trim(),
        additionalName: employeeFormData.additionalName.trim() || undefined,
        email: employeeFormData.email.trim(),
        tel: employeeFormData.tel.trim() || undefined,
        roleId: Number(employeeFormData.roleId),
        groupId: editingGroup.group.id,
        organizationEmployeeId: selectedOrganizationEmployeeId ?? undefined,
      });

      setEmployeeFormData(emptyEmployeeForm(String(editingGroup.group.id), employeeFormData.roleId));
      setEmployeeLoginManuallyEdited(false);
      setSelectedOrganizationEmployeeId(null);
      setSelectedOrganizationEmployeePosition(null);
      setSimilarUsers([]);
      setActiveEditTab("users");
      setGroupUsers(await apiClient.getUsers(eventId));
    } catch (createError) {
      console.error(createError);
      setError(getApiErrorMessage(createError, "Не удалось создать сотрудника. Проверьте логин, роль и группу."));
    } finally {
      setSaving(false);
    }
  };

  const openCreateModal = (group: GroupTreeDto) => {
    const availableQuota = getAvailableChildQuota(group);
    setParentGroup(group);
    setForm({ name: "", quota: Math.min(1, availableQuota) });
    setError(null);
  };

  const closeCreateModal = () => {
    if (saving) return;
    setParentGroup(null);
    setForm({ name: "", quota: 1 });
    setError(null);
  };

  const createGroup = async () => {
    if (
      !eventId ||
      !parentGroup ||
      !form.name.trim() ||
      form.quota < 0 ||
      form.quota > parentAvailableQuota
    ) return;

    setSaving(true);
    setError(null);
    try {
      await apiClient.createGroup(eventId, {
        name: form.name.trim(),
        quota: form.quota,
        parentGroupId: parentGroup.id,
      });
      setParentGroup(null);
      setForm({ name: "", quota: 1 });
      await loadGroups();
    } catch (createError) {
      console.error(createError);
      setError("Не удалось создать группу. Проверьте название и доступную квоту родительской группы.");
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (group: GroupTreeDto, groupParent?: GroupTreeDto) => {
    setEditingGroup({ group, parentGroup: groupParent });
    setEditForm({ name: group.name, quota: group.quota, parentGroupId: groupParent?.id ?? null });
    setActiveEditTab("settings");
    setEmployeeFormData(emptyEmployeeForm(String(group.id), String(roles[0]?.id ?? "")));
    setEmployeeLoginManuallyEdited(false);
    setSelectedOrganizationEmployeeId(null);
    setSelectedOrganizationEmployeePosition(null);
    setSimilarUsers([]);
    setSimilarUsersError(null);
    setGroupUsers([]);
    setGroupUsersError(null);
    setOrganizationTreeSearch("");
    setShowOnlyCurrentDepartmentEmployees(true);
    setMoveParentSearch("");
    setIsMoveParentSearchOpen(false);
    setActiveMoveParentOptionIndex(0);
    setError(null);
  };

  const closeEditModal = () => {
    if (saving) return;
    setEditingGroup(null);
    setActiveEditTab("settings");
    setEmployeeFormData(emptyEmployeeForm());
    setEmployeeLoginManuallyEdited(false);
    setSelectedOrganizationEmployeeId(null);
    setSelectedOrganizationEmployeePosition(null);
    setSimilarUsers([]);
    setSimilarUsersError(null);
    setGroupUsers([]);
    setGroupUsersError(null);
    setOrganizationTreeSearch("");
    setShowOnlyCurrentDepartmentEmployees(true);
    setMoveParentSearch("");
    setIsMoveParentSearchOpen(false);
    setError(null);
  };

  const updateGroup = async () => {
    if (
      !eventId ||
      !editingGroup ||
      !isEditDirty ||
      !editForm.name.trim() ||
      (isMovingGroup && !editForm.parentGroupId) ||
      editForm.quota < editMinimumQuota ||
      (!isMovingGroup && editMaximumQuota !== undefined && editForm.quota > editMaximumQuota)
    ) return;

    setSaving(true);
    setError(null);
    try {
      await apiClient.updateGroup(eventId, editingGroup.group.id, {
        name: editForm.name.trim(),
        quota: editForm.quota,
        parentGroupId: isMovingGroup ? editForm.parentGroupId : undefined,
        moveToParent: isMovingGroup,
      });
      setEditingGroup(null);
      await loadGroups();
    } catch (updateError) {
      console.error(updateError);
      setError("Не удалось изменить группу. Проверьте название и ограничения квоты.");
    } finally {
      setSaving(false);
    }
  };

  const openDeleteModal = (group: GroupTreeDto) => {
    setDeleteGroup(group);
    setError(null);
  };

  const closeDeleteModal = () => {
    if (saving) return;
    setDeleteGroup(null);
    setError(null);
  };

  const confirmDeleteGroup = async () => {
    if (!eventId || !deleteGroup) return;

    setSaving(true);
    setError(null);
    try {
      await apiClient.deleteGroup(eventId, deleteGroup.id);
      setDeleteGroup(null);
      await loadGroups();
    } catch (deleteError) {
      console.error(deleteError);
      setError("Не удалось удалить ветку. Убедитесь, что в её группах нет сотрудников или гостей.");
    } finally {
      setSaving(false);
    }
  };

  const formatImportResult = (result: OrganizationImportResultDto) =>
    `Оригинальная структура загружена: отделов ${result.departmentsCreated}, сотрудников ${result.employeesCreated}, виртуальных родителей ${result.generatedParentsCreated}.`;

  const formatApplyResult = (result: ApplyOriginalStructureResultDto) =>
    `Оригинальная структура применена: создано групп ${result.groupsCreated}, переиспользовано ${result.groupsReused}, переименовано ${result.groupsRenamed}, квоты обновлены ${result.groupsQuotaUpdated}.`;

  const formatResetResult = (result: ResetGroupsResultDto) =>
    `Группы сброшены: удалено ${result.groupsDeleted}, гостей перенесено ${result.guestsMoved}, сотрудников перенесено ${result.usersMoved}, квота корня ${result.rootQuota}.`;

  const formatTemplateApplyResult = (result: ApplyGroupTemplateResultDto) =>
    `Шаблон «${result.templateName}» применён: удалено групп ${result.groupsDeleted}, создано ${result.groupsCreated}. Корневая группа сохранена.`;

  const openSaveTemplateModal = () => {
    if (!canManageOriginalStructure || structureLoading) return;

    setTemplateForm({
      name: `${selectedEvent?.name ?? "Мероприятие"} — структура групп`,
      description: "",
    });
    setError(null);
    setIsSaveTemplateModalOpen(true);
  };

  const saveGroupTemplate = async () => {
    if (!eventId || !canManageOriginalStructure || !templateForm.name.trim()) return;

    setStructureLoading(true);
    setStructureMessage(null);
    setStructureWarnings([]);
    setError(null);
    try {
      const template = await apiClient.createGroupTemplate(eventId, {
        name: templateForm.name.trim(),
        description: templateForm.description.trim() || null,
      });
      setStructureMessage(`Шаблон «${template.name}» сохранён. Групп в шаблоне: ${template.groupsCount}.`);
      setIsSaveTemplateModalOpen(false);
      setTemplateForm({ name: "", description: "" });
    } catch (templateError) {
      console.error(templateError);
      setError(getApiErrorMessage(templateError, "Не удалось сохранить шаблон групп."));
    } finally {
      setStructureLoading(false);
    }
  };

  const openApplyTemplateModal = async () => {
    if (!eventId || !canManageOriginalStructure || structureLoading) return;

    setIsApplyTemplateModalOpen(true);
    setTemplatesLoading(true);
    setSelectedTemplateId(null);
    setError(null);
    try {
      const loadedTemplates = await apiClient.getGroupTemplates(eventId);
      setTemplates(loadedTemplates);
      setSelectedTemplateId(loadedTemplates[0]?.id ?? null);
    } catch (templatesError) {
      console.error(templatesError);
      setError(getApiErrorMessage(templatesError, "Не удалось загрузить список шаблонов."));
    } finally {
      setTemplatesLoading(false);
    }
  };

  const applyGroupTemplate = async () => {
    if (!eventId || !canManageOriginalStructure || !selectedTemplateId) return;

    setStructureLoading(true);
    setStructureMessage(null);
    setStructureWarnings([]);
    setError(null);
    try {
      const result = await apiClient.applyGroupTemplate(eventId, selectedTemplateId);
      setStructureMessage(formatTemplateApplyResult(result));
      setStructureWarnings(result.warnings);
      setIsApplyTemplateModalOpen(false);
      await loadGroups();
    } catch (templateError) {
      console.error(templateError);
      setError(getApiErrorMessage(templateError, "Не удалось применить шаблон групп."));
    } finally {
      setStructureLoading(false);
    }
  };

  const openOriginalStructureFileDialog = () => {
    if (!canManageOriginalStructure || structureLoading) return;
    originalStructureInputRef.current?.click();
  };

  const importOriginalStructure = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!eventId || !file) return;

    setStructureLoading(true);
    setStructureMessage(null);
    setStructureWarnings([]);
    setError(null);
    try {
      const result = await apiClient.importOriginalStructure(eventId, file);
      setStructureMessage(formatImportResult(result));
      setStructureWarnings(result.warnings);
    } catch (importError) {
      console.error(importError);
      setError("Не удалось загрузить оригинальную структуру. Проверьте XLSX-файл.");
    } finally {
      setStructureLoading(false);
    }
  };

  const applyOriginalStructure = async () => {
    if (!eventId || !canManageOriginalStructure) return;

    setStructureLoading(true);
    setStructureMessage(null);
    setStructureWarnings([]);
    setError(null);
    try {
      const result = await apiClient.applyOriginalStructure(eventId);
      setStructureMessage(formatApplyResult(result));
      setStructureWarnings(result.warnings);
      await loadGroups();
    } catch (applyError) {
      console.error(applyError);
      setError("Не удалось применить оригинальную структуру. Убедитесь, что структура загружена.");
    } finally {
      setStructureLoading(false);
    }
  };

  const resetGroups = async () => {
    if (!eventId || !canManageOriginalStructure) return;

    setStructureLoading(true);
    setStructureMessage(null);
    setStructureWarnings([]);
    setError(null);
    try {
      const result = await apiClient.resetGroups(eventId);
      setStructureMessage(formatResetResult(result));
      setIsResetGroupsModalOpen(false);
      await loadGroups();
    } catch (resetError) {
      console.error(resetError);
      setError("Не удалось сбросить группы.");
    } finally {
      setStructureLoading(false);
    }
  };

  return (
    <div className="tab-content">
      <div className="section-heading groups-heading">
        <div>
          <div className="section-title-row">
            <h2>Группы</h2>
            <span className="badge">Всего: {groupsCount}</span>
          </div>
          <p>Дочерние группы расположены справа от родительских. Нажмите «+» на группе, чтобы добавить в неё новую.</p>
        </div>
      </div>

      {!hasCreatePermission && (
        <section className="panel empty-state">
          У вас нет права на просмотр и создание групп.
        </section>
      )}

      {hasCreatePermission && (
        <section className="panel groups-tree-panel">
          <div className="groups-search-row">
            <div className="field groups-search-field groups-search-combobox">
              <div className="groups-search-input-wrap">
                <input
                  value={groupSearch}
                  onChange={(event) => {
                    setGroupSearch(event.target.value);
                    setGroupSearchMessage(null);
                    setHighlightedGroupId(null);
                    setIsGroupSearchOpen(true);
                  }}
                  onFocus={() => setIsGroupSearchOpen(true)}
                  onBlur={() => window.setTimeout(() => setIsGroupSearchOpen(false), 120)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setIsGroupSearchOpen(true);
                      setActiveGroupSearchOptionIndex((current) =>
                        filteredGroupSearchOptions.length === 0
                          ? -1
                          : current < 0
                            ? 0
                            : (current + 1) % filteredGroupSearchOptions.length
                      );
                    }

                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setIsGroupSearchOpen(true);
                      setActiveGroupSearchOptionIndex((current) =>
                        filteredGroupSearchOptions.length === 0
                          ? -1
                          : current <= 0
                            ? filteredGroupSearchOptions.length - 1
                            : current - 1
                      );
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      setIsGroupSearchOpen(false);
                    }

                    if (event.key === "Enter") {
                      event.preventDefault();
                      runGroupSearch(activeGroupSearchOption?.group);
                    }
                  }}
                  placeholder="Начните вводить название или выберите из списка"
                  disabled={loading}
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={isGroupSearchOpen}
                  aria-controls="groups-search-options"
                  aria-activedescendant={activeGroupSearchOption ? `group-search-option-${activeGroupSearchOption.group.id}` : undefined}
                />
                {isGroupSearchOpen && !loading && (
                  <div className="groups-search-dropdown" id="groups-search-options" role="listbox">
                    {filteredGroupSearchOptions.length === 0 ? (
                      <div className="groups-search-empty">Совпадений нет</div>
                    ) : (
                      filteredGroupSearchOptions.map((option, index) => (
                        <button
                          key={option.group.id}
                          id={`group-search-option-${option.group.id}`}
                          className={`groups-search-option${index === activeGroupSearchOptionIndex ? " active" : ""}`}
                          type="button"
                          role="option"
                          aria-selected={index === activeGroupSearchOptionIndex}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            selectGroupSearchOption(option);
                          }}
                        >
                          <span>{option.group.name}</span>
                          <small>{option.path}</small>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            {groupSearchMessage && (
              <span className={`groups-search-message${highlightedGroupId ? " groups-search-message-success" : ""}`}>
                {groupSearchMessage}
              </span>
            )}
            {canManageOriginalStructure && (
              <div className="group-template-actions">
                <button
                  className="secondary-button original-structure-button"
                  type="button"
                  onClick={openSaveTemplateModal}
                  disabled={structureLoading || loading || groups.length === 0}
                >
                  Сохранить в шаблон
                </button>
                <button
                  className="secondary-button original-structure-button"
                  type="button"
                  onClick={() => void openApplyTemplateModal()}
                  disabled={structureLoading}
                >
                  Подгрузить из шаблона
                </button>
              </div>
            )}
          </div>
          {loading ? (
            <div className="empty-state">Загружаем дерево групп...</div>
          ) : groups.length === 0 ? (
            <div className="empty-state">Группы пока не созданы.</div>
          ) : (
            <div className="groups-tree-view">
              <div className="groups-tree-toolbar" aria-label="Управление деревом групп">
                <button
                  className="groups-tree-tool-button"
                  type="button"
                  title="Свернуть все"
                  aria-label="Свернуть все группы"
                  onClick={collapseAllGroups}
                >
                  <CollapseAllIcon />
                </button>
                <button
                  className="groups-tree-tool-button"
                  type="button"
                  title="Развернуть все"
                  aria-label="Развернуть все группы"
                  onClick={expandAllGroups}
                >
                  <ExpandAllIcon />
                </button>
              </div>
              <div className="groups-tree-depth-actions" aria-label="Свернуть дерево до уровня">
                {groupDepthLevels.map((level) => (
                  <button
                    className="groups-tree-depth-button"
                    type="button"
                    key={level}
                    title={`Показать уровни до ${level}`}
                    aria-label={`Показать дерево до уровня ${level}`}
                    onClick={() => collapseGroupsToDepth(level)}
                  >
                    {level}
                  </button>
                ))}
              </div>
              <div
                className={`groups-tree-scroll${isGroupTreePanning ? " groups-tree-scroll-panning" : ""}`}
                ref={groupsTreeScrollRef}
                onWheel={handleGroupTreeWheel}
                onMouseDown={handleGroupTreePanStart}
                onAuxClick={(event) => {
                  if (event.button === 1) event.preventDefault();
                }}
              >
                <ul
                  className="groups-tree"
                  style={{ "--groups-tree-zoom": groupTreeZoom } as React.CSSProperties}
                >
                  {groups.map((group) => (
                    <GroupNode
                      key={group.id}
                      group={group}
                      isRoot
                      canCreate={canCreate}
                      highlightedGroupId={highlightedGroupId}
                      activeBranchGroupIds={activeBranchGroupIds}
                      draggedGroupId={draggedGroupId}
                      dragOverGroupId={dragOverGroupId}
                      collapsedGroupIds={collapsedGroupIds}
                      onToggleCollapse={toggleGroupCollapse}
                      onCreateChild={openCreateModal}
                      onEdit={openEditModal}
                      onDelete={openDeleteModal}
                      canDropOnGroup={canDropOnGroup}
                      onGroupMouseDown={handleGroupMouseDown}
                      onGroupDragStart={handleGroupDragStart}
                      onGroupDragOver={handleGroupDragOver}
                      onGroupDragLeave={handleGroupDragLeave}
                      onGroupDrop={handleGroupDrop}
                      onGroupDragEnd={clearGroupDragState}
                    />
                  ))}
                </ul>
              </div>
              <div className="groups-tree-zoom-actions" aria-label="Масштаб дерева групп">
                <button
                  className="groups-tree-scroll-button"
                  type="button"
                  title="Увеличить масштаб"
                  aria-label="Увеличить масштаб дерева групп"
                  disabled={groupTreeZoom >= GROUP_TREE_MAX_ZOOM}
                  onClick={() => zoomGroupTreeFromCenter(1)}
                >
                  +
                </button>
                <button
                  className="groups-tree-scroll-button"
                  type="button"
                  title="Уменьшить масштаб"
                  aria-label="Уменьшить масштаб дерева групп"
                  disabled={groupTreeZoom <= GROUP_TREE_MIN_ZOOM}
                  onClick={() => zoomGroupTreeFromCenter(-1)}
                >
                  −
                </button>
              </div>
              <div className="groups-tree-scroll-actions" aria-label="Быстрая прокрутка дерева групп">
                <button
                  className="groups-tree-scroll-button"
                  type="button"
                  title="Наверх"
                  aria-label="Прокрутить группы вверх"
                  onClick={() => scrollGroupsTree("top")}
                >
                  <ArrowUpIcon />
                </button>
                <button
                  className="groups-tree-scroll-button"
                  type="button"
                  title="Вниз"
                  aria-label="Прокрутить группы вниз"
                  onClick={() => scrollGroupsTree("bottom")}
                >
                  <ArrowDownIcon />
                </button>
              </div>
            </div>
          )}
          {error && !parentGroup && !editingGroup && !deleteGroup && !isSaveTemplateModalOpen && !isApplyTemplateModalOpen && (
            <div className="alert alert-error">{error}</div>
          )}
          {isArchived && (
            <div className="alert alert-info">
              Мероприятие завершено. Дерево групп доступно только для просмотра. Для изменений верните мероприятие в активные.
            </div>
          )}
          {canManageOriginalStructure && (
            <div className="original-structure-actions">
              <input
                ref={originalStructureInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={importOriginalStructure}
                hidden
              />
              <div className="original-structure-buttons">
                <button
                  className="secondary-button original-structure-button"
                  type="button"
                  onClick={openOriginalStructureFileDialog}
                  disabled={structureLoading}
                >
                  {structureLoading ? "Обрабатываем..." : "Загрузить оригинальную структуру"}
                </button>
                <button
                  className="secondary-button original-structure-button"
                  type="button"
                  onClick={() => void applyOriginalStructure()}
                  disabled={structureLoading}
                >
                  Применить оригинальную структуру
                </button>
                <button
                  className="secondary-button original-structure-button original-structure-reset-button"
                  type="button"
                  onClick={() => setIsResetGroupsModalOpen(true)}
                  disabled={structureLoading}
                >
                  Сбросить группы
                </button>
              </div>
              {structureMessage && <div className="original-structure-message">{structureMessage}</div>}
              {structureWarnings.length > 0 && (
                <div className="original-structure-warnings">
                  {structureWarnings.slice(0, 5).map((warning) => (
                    <div key={warning}>{warning}</div>
                  ))}
                  {structureWarnings.length > 5 && <div>И ещё предупреждений: {structureWarnings.length - 5}</div>}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {isSaveTemplateModalOpen && (
        <Modal
          title="Сохранение шаблона групп"
          onClose={() => {
            if (!structureLoading) setIsSaveTemplateModalOpen(false);
          }}
          className="employee-form-modal"
        >
          <form
            className="form employee-form"
            onSubmit={(event) => {
              event.preventDefault();
              void saveGroupTemplate();
            }}
          >
            <p className="group-create-context">
              В шаблон будет сохранена текущая структура групп с иерархией и квотами. Применение шаблона к другим мероприятиям не заменяет их корневую группу.
            </p>

            <label className="field">
              <span>Название шаблона *</span>
              <input
                disabled={structureLoading}
                required
                value={templateForm.name}
                onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Например: Структура RMG"
              />
            </label>

            <label className="field">
              <span>Описание</span>
              <textarea
                disabled={structureLoading}
                rows={3}
                value={templateForm.description}
                onChange={(event) => setTemplateForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Краткое описание шаблона"
              />
            </label>

            {error && <div className="alert alert-error employee-form-message">{error}</div>}

            <div className="modal-actions">
              <button className="secondary-button" type="button" disabled={structureLoading} onClick={() => setIsSaveTemplateModalOpen(false)}>
                Закрыть
              </button>
              <button
                className="primary-button"
                type="submit"
                disabled={structureLoading || !templateForm.name.trim()}
              >
                {structureLoading ? "Сохраняем..." : "Сохранить"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {isApplyTemplateModalOpen && (
        <Modal
          title="Подгрузить из шаблона"
          onClose={() => {
            if (!structureLoading) setIsApplyTemplateModalOpen(false);
          }}
          className="employee-form-modal"
        >
          <form
            className="form employee-form"
            onSubmit={(event) => {
              event.preventDefault();
              void applyGroupTemplate();
            }}
          >
            <p className="group-create-context">
              Текущая структура групп будет заменена дочерними группами выбранного шаблона. Корневая группа мероприятия сохранится.
            </p>

            <label className="field">
              <span>Шаблон *</span>
              <select
                disabled={structureLoading || templatesLoading || templates.length === 0}
                value={selectedTemplateId ?? ""}
                onChange={(event) => setSelectedTemplateId(event.target.value ? Number(event.target.value) : null)}
              >
                <option value="">Выберите шаблон</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} · групп: {template.groupsCount}
                  </option>
                ))}
              </select>
            </label>

            {templatesLoading && <div className="empty-state">Загружаем шаблоны...</div>}
            {!templatesLoading && templates.length === 0 && (
              <div className="alert alert-info employee-form-message">Пока нет сохранённых шаблонов групп.</div>
            )}
            {selectedTemplate && (
              <div className="group-template-preview">
                <strong>{selectedTemplate.name}</strong>
                <span>Групп в шаблоне: {selectedTemplate.groupsCount}</span>
                <span>Создан: {new Date(selectedTemplate.createdAt).toLocaleString("ru-RU")}</span>
                {selectedTemplate.description && <p>{selectedTemplate.description}</p>}
              </div>
            )}
            <div className="alert alert-info employee-form-message">
              Если в мероприятии уже есть сотрудники или гости, применить шаблон можно только когда текущая структура состоит из одной корневой группы.
            </div>
            {error && <div className="alert alert-error employee-form-message">{error}</div>}

            <div className="modal-actions">
              <button className="secondary-button" type="button" disabled={structureLoading} onClick={() => setIsApplyTemplateModalOpen(false)}>
                Закрыть
              </button>
              <button
                className="primary-button"
                type="submit"
                disabled={structureLoading || templatesLoading || !selectedTemplateId}
              >
                {structureLoading ? "Применяем..." : "Применить шаблон"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {parentGroup && (
        <Modal
          title="Создание группы"
          onClose={closeCreateModal}
          className="employee-form-modal"
        >
          <form
            className="form employee-form"
            onSubmit={(event) => {
              event.preventDefault();
              void createGroup();
            }}
          >
            <p className="group-create-context">
              Родительская группа: <strong>{parentGroup.name}</strong>. Доступно квоты:{" "}
              <strong>{parentAvailableQuota}</strong>
            </p>

            <label className="field">
              <span>Название *</span>
              <input
                autoFocus
                disabled={saving}
                required
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Название группы"
              />
            </label>

            <label className="field">
              <span>Квота *</span>
              <input
                disabled={saving}
                required
                min={0}
                max={parentAvailableQuota}
                type="number"
                value={form.quota}
                onChange={(event) =>
                  setForm((current) => ({ ...current, quota: Number(event.target.value) }))
                }
              />
            </label>

            {error && <div className="alert alert-error employee-form-message">{error}</div>}

            <div className="modal-actions">
              <button className="secondary-button" type="button" disabled={saving} onClick={closeCreateModal}>
                Закрыть
              </button>
              <button
                className="primary-button"
                type="submit"
                disabled={
                  saving ||
                  !form.name.trim() ||
                  form.quota < 0 ||
                  form.quota > parentAvailableQuota
                }
              >
                {saving ? "Создаём..." : "Создать"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editingGroup && (
        <Modal
          title="Редактирование группы"
          onClose={closeEditModal}
          className="employee-form-modal group-edit-modal"
        >
          <div className="group-edit-tabs" role="tablist" aria-label="Разделы редактирования группы">
            <button
              className={`group-edit-tab${activeEditTab === "settings" ? " active" : ""}`}
              type="button"
              onClick={() => setActiveEditTab("settings")}
            >
              Группа
            </button>
            <button
              className={`group-edit-tab${activeEditTab === "create-user" ? " active" : ""}`}
              type="button"
              onClick={() => setActiveEditTab("create-user")}
              disabled={!hasCreateUserPermission}
            >
              Создать сотрудника
            </button>
            <button
              className={`group-edit-tab${activeEditTab === "users" ? " active" : ""}`}
              type="button"
              onClick={() => setActiveEditTab("users")}
            >
              Сотрудники
            </button>
          </div>

          {activeEditTab === "settings" && (
            <form
              className="form employee-form group-edit-settings-form"
              onSubmit={(event) => {
                event.preventDefault();
                void updateGroup();
              }}
            >
              <p className="group-create-context">
                Минимальная квота по дочерним группам: <strong>{editMinimumQuota}</strong>
                {!isMovingGroup && editMaximumQuota !== undefined && (
                  <>. Максимально доступно в родительской группе: <strong>{editMaximumQuota}</strong></>
                )}
              </p>

              <label className="field">
                <span>Название *</span>
                <input
                  disabled={saving}
                  required
                  value={editForm.name}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>

              {editingGroup.parentGroup ? (
                <div className="field group-move-field groups-search-combobox">
                  <span>Переместить в</span>
                  <div className="groups-search-input-wrap">
                    <input
                      disabled={saving}
                      value={moveParentSearch}
                      onChange={(event) => {
                        setMoveParentSearch(event.target.value);
                        setEditForm((current) => ({ ...current, parentGroupId: null }));
                        setIsMoveParentSearchOpen(true);
                      }}
                      onFocus={() => setIsMoveParentSearchOpen(true)}
                      onBlur={() => window.setTimeout(() => setIsMoveParentSearchOpen(false), 120)}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          setIsMoveParentSearchOpen(true);
                          setActiveMoveParentOptionIndex((current) =>
                            filteredMoveParentOptions.length === 0
                              ? -1
                              : current < 0
                                ? 0
                                : (current + 1) % filteredMoveParentOptions.length
                          );
                        }

                        if (event.key === "ArrowUp") {
                          event.preventDefault();
                          setIsMoveParentSearchOpen(true);
                          setActiveMoveParentOptionIndex((current) =>
                            filteredMoveParentOptions.length === 0
                              ? -1
                              : current <= 0
                                ? filteredMoveParentOptions.length - 1
                                : current - 1
                          );
                        }

                        if (event.key === "Escape") {
                          event.preventDefault();
                          setIsMoveParentSearchOpen(false);
                        }

                        if (event.key === "Enter") {
                          event.preventDefault();
                          if (activeMoveParentOption) {
                            selectMoveParentOption(activeMoveParentOption);
                          }
                        }
                      }}
                      placeholder="Выберите группу для переноса"
                      autoComplete="off"
                      role="combobox"
                      aria-expanded={isMoveParentSearchOpen}
                      aria-controls="group-move-parent-options"
                      aria-activedescendant={activeMoveParentOption ? `group-move-parent-option-${activeMoveParentOption.group.id}` : undefined}
                    />
                    {isMoveParentSearchOpen && (
                      <div className="groups-search-dropdown group-move-dropdown" id="group-move-parent-options" role="listbox">
                        {filteredMoveParentOptions.length === 0 ? (
                          <div className="groups-search-empty">Подходящих групп нет</div>
                        ) : (
                          filteredMoveParentOptions.map((option, index) => (
                            <button
                              key={option.group.id}
                              id={`group-move-parent-option-${option.group.id}`}
                              className={`groups-search-option${index === activeMoveParentOptionIndex ? " active" : ""}`}
                              type="button"
                              role="option"
                              aria-selected={index === activeMoveParentOptionIndex}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                selectMoveParentOption(option);
                              }}
                            >
                              <span>{option.group.name}</span>
                              <small>{option.path}</small>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="muted group-move-note">Корневую группу нельзя перемещать.</p>
              )}

              {isMovingGroup && (
                <div className="alert alert-info group-move-warning">
                  При перемещении квоты этой группы и всех её дочерних групп будут сброшены в 0. Проставьте нужные значения самостоятельно после переноса.
                </div>
              )}

              <label className="field">
                <span>Квота *</span>
                <input
                  disabled={saving || isMovingGroup}
                  required
                  min={editMinimumQuota}
                  max={isMovingGroup ? 0 : editMaximumQuota}
                  type="number"
                  value={editForm.quota}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, quota: Number(event.target.value) }))
                  }
                />
              </label>

              {error && <div className="alert alert-error employee-form-message">{error}</div>}

              <div className="modal-actions">
                <button className="secondary-button" type="button" disabled={saving} onClick={closeEditModal}>
                  Закрыть
                </button>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={
                    saving ||
                    !isEditDirty ||
                    !editForm.name.trim() ||
                    (isMovingGroup && !editForm.parentGroupId) ||
                    editForm.quota < editMinimumQuota ||
                    (!isMovingGroup && editMaximumQuota !== undefined && editForm.quota > editMaximumQuota)
                  }
                >
                  {saving ? "Сохраняем..." : "Сохранить"}
                </button>
              </div>
            </form>
          )}

          {activeEditTab === "create-user" && (
            hasCreateUserPermission ? (
              <div className="employee-create-layout group-employee-create-layout">
                <aside className="organization-picker" aria-label="Оригинальная структура">
                  <div className="organization-picker-header">
                    <strong>Оригинальная структура</strong>
                    {organizationTree && (
                      <span>{organizationTree.departmentsCount} отделов · {organizationTree.employeesCount} сотрудников</span>
                    )}
                  </div>
                  <label className="organization-picker-filter">
                    <input
                      type="checkbox"
                      checked={showOnlyCurrentDepartmentEmployees}
                      onChange={(event) => setShowOnlyCurrentDepartmentEmployees(event.target.checked)}
                      disabled={organizationTreeLoading}
                    />
                    <span>Отобразить сотрудников отдела</span>
                  </label>
                  <input
                    className="organization-picker-search"
                    value={organizationTreeSearch}
                    onChange={(event) => setOrganizationTreeSearch(event.target.value)}
                    placeholder="Поиск отдела или сотрудника"
                    disabled={organizationTreeLoading}
                  />
                  {organizationTreeLoading ? (
                    <div className="organization-picker-message">Загружаем структуру...</div>
                  ) : organizationTreeError ? (
                    <div className="organization-picker-message error-text">{organizationTreeError}</div>
                  ) : !organizationTree || organizationTree.employeesCount === 0 ? (
                    <div className="organization-picker-message">Оригинальная структура пока не загружена.</div>
                  ) : isOrganizationDepartmentFilterEmpty ? (
                    <div className="organization-picker-message">
                      Для группы «{editingGroup.group.name}» не найден соответствующий отдел в оригинальной структуре. Снимите галочку, чтобы искать по всей структуре.
                    </div>
                  ) : (
                    <ul className="org-tree-list org-tree-root">
                      {displayedOrganizationDepartments
                        .filter((department) => departmentMatchesSearch(department, normalizeSearch(organizationTreeSearch)))
                        .map((department) => (
                          <OrganizationDepartmentNode
                            key={department.id}
                            department={department}
                            query={organizationTreeSearch}
                            depth={0}
                            selectedEmployeeId={selectedOrganizationEmployeeId}
                            onSelectEmployee={useOrganizationEmployee}
                          />
                        ))}
                    </ul>
                  )}
                </aside>

                <div className="employee-create-form-side">
                  <div className="alert alert-info employee-source-message">
                    Сотрудник будет создан в группе: <strong>{editingGroup.group.name}</strong>.
                    {selectedOrganizationEmployeePosition && (
                      <> Должность из оригинальной структуры: <strong>{selectedOrganizationEmployeePosition}</strong>.</>
                    )}
                  </div>
                  {error && <div className="alert alert-error">{error}</div>}

                  <form
                    className="form employee-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void createEmployeeInEditingGroup();
                    }}
                  >
                    <div className="employee-form-fields">
                      <label className="field">
                        <span>Фамилия *</span>
                        <input value={employeeFormData.surname} onChange={(event) => setEmployeeFormData({ ...employeeFormData, surname: event.target.value })} disabled={saving} required />
                      </label>
                      <label className="field">
                        <span>Имя *</span>
                        <input value={employeeFormData.name} onChange={(event) => setEmployeeFormData({ ...employeeFormData, name: event.target.value })} disabled={saving} required />
                      </label>
                      <label className="field">
                        <span>Отчество</span>
                        <input value={employeeFormData.additionalName} onChange={(event) => setEmployeeFormData({ ...employeeFormData, additionalName: event.target.value })} disabled={saving} />
                      </label>
                      <label className="field">
                        <span>Email *</span>
                        <input
                          type="email"
                          value={employeeFormData.email}
                          onChange={(event) => {
                            const email = event.target.value;
                            setEmployeeFormData((value) => ({
                              ...value,
                              email,
                              login: employeeLoginManuallyEdited ? value.login : email,
                            }));
                          }}
                          disabled={saving}
                          required
                        />
                      </label>
                      <label className="field">
                        <span>Логин *</span>
                        <input
                          value={employeeFormData.login}
                          onChange={(event) => {
                            setEmployeeLoginManuallyEdited(true);
                            setEmployeeFormData({ ...employeeFormData, login: event.target.value });
                          }}
                          disabled={saving}
                          required
                        />
                      </label>
                      <label className="field">
                        <span>Телефон</span>
                        <input type="tel" value={employeeFormData.tel} onChange={(event) => setEmployeeFormData({ ...employeeFormData, tel: event.target.value })} disabled={saving} />
                      </label>
                      <label className="field">
                        <span>Роль *</span>
                        <select
                          value={employeeFormData.roleId}
                          className={isEmployeeRoleAdministrator(employeeFormData.roleId) ? "role-select-administrator" : undefined}
                          onChange={(event) => setEmployeeFormData({ ...employeeFormData, roleId: event.target.value })}
                          disabled={saving || referencesLoading}
                          required
                        >
                          {referencesLoading ? (
                            <option value="">Загрузка ролей...</option>
                          ) : roles.length === 0 ? (
                            <option value="">Роли не найдены</option>
                          ) : (
                            roles.map((role) => (
                              <option
                                key={role.id}
                                value={role.id}
                                className={isAdministratorRoleName(role.name) ? "role-option-administrator" : undefined}
                              >
                                {role.name}
                              </option>
                            ))
                          )}
                        </select>
                      </label>
                      <label className="field">
                        <span>Группа</span>
                        <input value={editingGroup.group.name} disabled readOnly />
                      </label>
                      <div className="similar-employees" aria-live="polite">
                        <div className="similar-employees-heading">
                          <strong>Похожие сотрудники</strong>
                          {similarUsersLoading && <span>Ищем...</span>}
                        </div>
                        {similarUsersError ? (
                          <div className="similar-employees-message error-text">{similarUsersError}</div>
                        ) : similarUsers.length > 0 ? (
                          <div className="similar-employees-list">
                            <div className="similar-employee-row similar-employee-header" aria-hidden="true">
                              <div className="similar-employee-data">
                                <span>Логин</span>
                                <span>ФИО</span>
                                <span>Email</span>
                                <span>Мероприятие</span>
                                <span>Роль</span>
                                <span>Группа</span>
                              </div>
                              <span className="similar-employee-header-action">Действие</span>
                            </div>
                            {similarUsers.map((user) => (
                              <div className="similar-employee-row" key={user.id}>
                                <div className="similar-employee-data">
                                  <span>{user.login}</span>
                                  <span>{[user.surname, user.name, user.additionalName].filter(Boolean).join(" ")}</span>
                                  <span>{user.email || "—"}</span>
                                  <span title={user.eventName || undefined}>{user.eventName || "—"}</span>
                                  <span>{user.roleName || "—"}</span>
                                  <span>{user.groupName || "—"}</span>
                                </div>
                                <button
                                  className="secondary-button similar-employee-use"
                                  type="button"
                                  onClick={() => useSimilarUser(user)}
                                  disabled={saving || referencesLoading}
                                >
                                  Использовать
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="similar-employees-message">
                            {similarUsersLoading
                              ? "Поиск по логину, ФИО и email..."
                              : "Введите не менее двух символов в логине, фамилии, имени или email."}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="modal-actions">
                      <button className="secondary-button" type="button" disabled={saving} onClick={closeEditModal}>
                        Закрыть
                      </button>
                      <button className="primary-button" type="submit" disabled={saving || referencesLoading || roles.length === 0}>
                        {saving ? "Создаём..." : "Создать"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ) : (
              <div className="alert alert-info employee-form-message">У вас нет прав на создание сотрудников.</div>
            )
          )}

          {activeEditTab === "users" && (
            <div className="group-users-panel">
              {groupUsersLoading ? (
                <div className="empty-state">Загружаем сотрудников группы...</div>
              ) : groupUsersError ? (
                <div className="alert alert-error">{groupUsersError}</div>
              ) : visibleGroupUsers.length === 0 ? (
                <div className="empty-state">В этой группе пока нет сотрудников.</div>
              ) : (
                <div className="table-wrap group-users-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ФИО</th>
                        <th>Должность</th>
                        <th>Отдел</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleGroupUsers.map((user) => (
                        <tr key={user.id}>
                          <td>{formatUserName(user)}</td>
                          <td>{user.position || "—"}</td>
                          <td>{user.departmentName || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="modal-actions">
                <button className="secondary-button" type="button" disabled={saving} onClick={closeEditModal}>
                  Закрыть
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {deleteGroup && (
        <Modal title="Удаление группы" onClose={closeDeleteModal}>
          <p>
            Вы уверены, что хотите удалить группу «{deleteGroup.name}»
            {deleteGroup.children.length > 0 ? " вместе со всеми дочерними группами" : ""}?
          </p>
          <p className="muted">
            Действие нельзя отменить. Ветка со связанными сотрудниками или гостями не может быть удалена.
          </p>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="modal-actions">
            <button className="secondary-button" type="button" disabled={saving} onClick={closeDeleteModal}>
              Нет
            </button>
            <button className="danger-button" type="button" disabled={saving} onClick={() => void confirmDeleteGroup()}>
              {saving ? "Удаляем..." : "Да, удалить"}
            </button>
          </div>
        </Modal>
      )}

      {isResetGroupsModalOpen && (
        <Modal title="Сбросить группы" onClose={() => !structureLoading && setIsResetGroupsModalOpen(false)}>
          <p>
            Будут удалены все группы мероприятия, кроме корневой. Гости и сотрудники будут перенесены в корневую группу,
            а квота корневой группы будет сброшена до 10000.
          </p>
          <p className="muted">Действие нельзя отменить.</p>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="modal-actions">
            <button className="secondary-button" type="button" disabled={structureLoading} onClick={() => setIsResetGroupsModalOpen(false)}>
              Отмена
            </button>
            <button className="danger-button" type="button" disabled={structureLoading} onClick={() => void resetGroups()}>
              {structureLoading ? "Сбрасываем..." : "Да, сбросить"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Modal } from "../components/Modal";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";
import type { ApplyOriginalStructureResultDto, GroupTreeDto, OrganizationImportResultDto, ResetGroupsResultDto } from "../types";

type GroupNodeProps = {
  group: GroupTreeDto;
  parentGroup?: GroupTreeDto;
  isRoot?: boolean;
  canCreate: boolean;
  highlightedGroupId?: number | null;
  collapsedGroupIds: Set<number>;
  onToggleCollapse: (groupId: number) => void;
  onCreateChild: (group: GroupTreeDto) => void;
  onEdit: (group: GroupTreeDto, parentGroup?: GroupTreeDto) => void;
  onDelete: (group: GroupTreeDto) => void;
};

type GroupSearchOption = {
  group: GroupTreeDto;
  path: string;
  depth: number;
};

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

const countGroups = (groups: GroupTreeDto[]): number =>
  groups.reduce((total, group) => total + 1 + countGroups(group.children ?? []), 0);

const getAvailableChildQuota = (group: GroupTreeDto): number =>
  Math.max(0, group.quota - (group.children ?? []).reduce((total, child) => total + child.quota, 0));

const normalizeGroupSearch = (value: string) => value.trim().toLocaleLowerCase("ru-RU");

const flattenGroups = (groups: GroupTreeDto[]): GroupTreeDto[] =>
  groups.flatMap((group) => [group, ...flattenGroups(group.children ?? [])]);

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

const GroupNode = ({
  group,
  parentGroup,
  isRoot = false,
  canCreate,
  highlightedGroupId,
  collapsedGroupIds,
  onToggleCollapse,
  onCreateChild,
  onEdit,
  onDelete,
}: GroupNodeProps) => {
  const children = group.children ?? [];
  const hasChildren = children.length > 0;
  const isCollapsed = collapsedGroupIds.has(group.id);

  return (
  <li className="group-tree-item">
    <article
      id={`group-node-${group.id}`}
      className={`group-tree-node${highlightedGroupId === group.id ? " group-tree-node-highlighted" : ""}`}
    >
      {hasChildren && (
        <button
          className="group-tree-collapse-toggle"
          type="button"
          aria-expanded={!isCollapsed}
          aria-label={`${isCollapsed ? "Развернуть" : "Свернуть"} группу ${group.name}`}
          title={isCollapsed ? "Развернуть ветку" : "Свернуть ветку"}
          onClick={() => onToggleCollapse(group.id)}
        >
          {isCollapsed ? "›" : "⌄"}
        </button>
      )}
      <div className="group-tree-node-content">
        <strong>{group.name}</strong>
        <span>Квота: {group.quota}</span>
      </div>
      {canCreate && (
        <div className="group-tree-node-actions">
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
            className="group-tree-add"
            type="button"
            aria-label={`Создать дочернюю группу для ${group.name}`}
            title="Создать дочернюю группу"
            onClick={() => onCreateChild(group)}
          >
            +
          </button>
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
            collapsedGroupIds={collapsedGroupIds}
            onToggleCollapse={onToggleCollapse}
            onCreateChild={onCreateChild}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </ul>
    )}
  </li>
  );
};

export const GroupsPage = () => {
  const { eventId = "" } = useParams<{ eventId: string }>();
  const { currentUser, currentEvent, events } = useAuth();
  const originalStructureInputRef = useRef<HTMLInputElement | null>(null);
  const [groups, setGroups] = useState<GroupTreeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [structureLoading, setStructureLoading] = useState(false);
  const [structureMessage, setStructureMessage] = useState<string | null>(null);
  const [structureWarnings, setStructureWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
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
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<number>>(() => new Set());
  const [form, setForm] = useState({ name: "", quota: 1 });
  const [editForm, setEditForm] = useState({ name: "", quota: 0 });

  const selectedEvent = useMemo(() => events.find((event) => String(event.id) === eventId) ?? currentEvent, [events, eventId, currentEvent]);
  const hasCreatePermission = currentUser?.permissions.includes("create_group") ?? false;
  const isArchived = selectedEvent?.isArchived ?? false;
  const canManageOriginalStructure = (currentUser?.permissions.includes("create_event") ?? false) && !isArchived;
  const canCreate = hasCreatePermission && !isArchived;
  const groupsCount = useMemo(() => countGroups(groups), [groups]);
  const groupSearchOptions = useMemo(() => buildGroupSearchOptions(groups), [groups]);
  const filteredGroupSearchOptions = useMemo(
    () => filterGroupSearchOptions(groupSearchOptions, groupSearch),
    [groupSearchOptions, groupSearch]
  );
  const activeGroupSearchOption = filteredGroupSearchOptions[activeGroupSearchOptionIndex] ?? null;
  const parentAvailableQuota = parentGroup ? getAvailableChildQuota(parentGroup) : 0;
  const editMinimumQuota = editingGroup
    ? (editingGroup.group.children ?? []).reduce((total, child) => total + child.quota, 0)
    : 0;
  const editMaximumQuota = editingGroup?.parentGroup
    ? editingGroup.parentGroup.quota -
      (editingGroup.parentGroup.children ?? [])
        .filter((child) => child.id !== editingGroup.group.id)
        .reduce((total, child) => total + child.quota, 0)
    : undefined;
  const isEditDirty = editingGroup !== null && (
    editForm.name.trim() !== editingGroup.group.name ||
    editForm.quota !== editingGroup.group.quota
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
    setEditForm({ name: group.name, quota: group.quota });
    setError(null);
  };

  const closeEditModal = () => {
    if (saving) return;
    setEditingGroup(null);
    setError(null);
  };

  const updateGroup = async () => {
    if (
      !eventId ||
      !editingGroup ||
      !isEditDirty ||
      !editForm.name.trim() ||
      editForm.quota < editMinimumQuota ||
      (editMaximumQuota !== undefined && editForm.quota > editMaximumQuota)
    ) return;

    setSaving(true);
    setError(null);
    try {
      await apiClient.updateGroup(eventId, editingGroup.group.id, {
        name: editForm.name.trim(),
        quota: editForm.quota,
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
              <span>Поиск группы</span>
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
          </div>
          {loading ? (
            <div className="empty-state">Загружаем дерево групп...</div>
          ) : groups.length === 0 ? (
            <div className="empty-state">Группы пока не созданы.</div>
          ) : (
            <div className="groups-tree-scroll">
              <ul className="groups-tree">
                {groups.map((group) => (
                  <GroupNode
                    key={group.id}
                    group={group}
                    isRoot
                    canCreate={canCreate}
                    highlightedGroupId={highlightedGroupId}
                    collapsedGroupIds={collapsedGroupIds}
                    onToggleCollapse={toggleGroupCollapse}
                    onCreateChild={openCreateModal}
                    onEdit={openEditModal}
                    onDelete={openDeleteModal}
                  />
                ))}
              </ul>
            </div>
          )}
          {error && !parentGroup && !editingGroup && !deleteGroup && (
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
          className="employee-form-modal"
        >
          <form
            className="form employee-form"
            onSubmit={(event) => {
              event.preventDefault();
              void updateGroup();
            }}
          >
            <p className="group-create-context">
              Минимальная квота по дочерним группам: <strong>{editMinimumQuota}</strong>
              {editMaximumQuota !== undefined && (
                <>. Максимально доступно в родительской группе: <strong>{editMaximumQuota}</strong></>
              )}
            </p>

            <label className="field">
              <span>Название *</span>
              <input
                autoFocus
                disabled={saving}
                required
                value={editForm.name}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>

            <label className="field">
              <span>Квота *</span>
              <input
                disabled={saving}
                required
                min={editMinimumQuota}
                max={editMaximumQuota}
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
                  editForm.quota < editMinimumQuota ||
                  (editMaximumQuota !== undefined && editForm.quota > editMaximumQuota)
                }
              >
                {saving ? "Сохраняем..." : "Сохранить"}
              </button>
            </div>
          </form>
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

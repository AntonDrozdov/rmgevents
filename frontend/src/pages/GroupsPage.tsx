import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Modal } from "../components/Modal";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";
import type { GroupTreeDto } from "../types";

type GroupNodeProps = {
  group: GroupTreeDto;
  parentGroup?: GroupTreeDto;
  isRoot?: boolean;
  canCreate: boolean;
  onCreateChild: (group: GroupTreeDto) => void;
  onEdit: (group: GroupTreeDto, parentGroup?: GroupTreeDto) => void;
  onDelete: (group: GroupTreeDto) => void;
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

const GroupNode = ({
  group,
  parentGroup,
  isRoot = false,
  canCreate,
  onCreateChild,
  onEdit,
  onDelete,
}: GroupNodeProps) => (
  <li className="group-tree-item">
    <article className="group-tree-node">
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

    {group.children?.length > 0 && (
      <ul className="group-tree-children">
        {group.children.map((child) => (
          <GroupNode
            key={child.id}
            group={child}
            parentGroup={group}
            canCreate={canCreate}
            onCreateChild={onCreateChild}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </ul>
    )}
  </li>
);

export const GroupsPage = () => {
  const { eventId = "" } = useParams<{ eventId: string }>();
  const { currentUser } = useAuth();
  const [groups, setGroups] = useState<GroupTreeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parentGroup, setParentGroup] = useState<GroupTreeDto | null>(null);
  const [editingGroup, setEditingGroup] = useState<{
    group: GroupTreeDto;
    parentGroup?: GroupTreeDto;
  } | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<GroupTreeDto | null>(null);
  const [form, setForm] = useState({ name: "", quota: 1 });
  const [editForm, setEditForm] = useState({ name: "", quota: 0 });

  const canCreate = currentUser?.permissions.includes("create_group") ?? false;
  const groupsCount = useMemo(() => countGroups(groups), [groups]);
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

  const loadGroups = async () => {
    if (!eventId || !canCreate) {
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
  }, [eventId, canCreate]);

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

      {!canCreate && (
        <section className="panel empty-state">
          У вас нет права на просмотр и создание групп.
        </section>
      )}

      {canCreate && (
        <section className="panel groups-tree-panel">
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
    </div>
  );
};

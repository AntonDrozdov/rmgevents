import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Modal } from "../components/Modal";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";
import type { GroupTreeDto } from "../types";

type GroupNodeProps = {
  group: GroupTreeDto;
  canCreate: boolean;
  onCreateChild: (group: GroupTreeDto) => void;
};

const countGroups = (groups: GroupTreeDto[]): number =>
  groups.reduce((total, group) => total + 1 + countGroups(group.children ?? []), 0);

const GroupNode = ({ group, canCreate, onCreateChild }: GroupNodeProps) => (
  <li className="group-tree-item">
    <article className="group-tree-node">
      <div className="group-tree-node-content">
        <strong>{group.name}</strong>
        <span>Квота: {group.quota}</span>
      </div>
      {canCreate && (
        <button
          className="group-tree-add"
          type="button"
          aria-label={`Создать дочернюю группу для ${group.name}`}
          title="Создать дочернюю группу"
          onClick={() => onCreateChild(group)}
        >
          +
        </button>
      )}
    </article>

    {group.children?.length > 0 && (
      <ul className="group-tree-children">
        {group.children.map((child) => (
          <GroupNode
            key={child.id}
            group={child}
            canCreate={canCreate}
            onCreateChild={onCreateChild}
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
  const [form, setForm] = useState({ name: "", quota: 1 });

  const canCreate = currentUser?.permissions.includes("create_group") ?? false;
  const groupsCount = useMemo(() => countGroups(groups), [groups]);

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
    setParentGroup(group);
    setForm({ name: "", quota: 1 });
    setError(null);
  };

  const closeCreateModal = () => {
    if (saving) return;
    setParentGroup(null);
    setForm({ name: "", quota: 1 });
    setError(null);
  };

  const createGroup = async () => {
    if (!eventId || !parentGroup || !form.name.trim() || form.quota < 0) return;

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
                    canCreate={canCreate}
                    onCreateChild={openCreateModal}
                  />
                ))}
              </ul>
            </div>
          )}
          {error && !parentGroup && <div className="alert alert-error">{error}</div>}
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
              Родительская группа: <strong>{parentGroup.name}</strong>
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
              <button className="primary-button" type="submit" disabled={saving || !form.name.trim()}>
                {saving ? "Создаём..." : "Создать"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

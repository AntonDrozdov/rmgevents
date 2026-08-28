import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Modal } from "../components/Modal";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";
import { GroupTreeDto } from "../types";
import { flattenGroups } from "../utils/groups";

const GroupNode: React.FC<{ group: GroupTreeDto; level?: number }> = ({ group, level = 0 }) => (
  <li className="tree-row" style={{ marginLeft: level * 18 }}>
    <div>
      <strong>{group.name}</strong>
      <small>ID: {group.id}</small>
    </div>
    <div className="quota-row">
      <span>Квота: {group.quota}</span>
      <span>Свободно: {group.availableQuota}</span>
    </div>
    {group.children.length > 0 && (
      <ul className="tree-list">
        {group.children.map((child) => (
          <GroupNode key={child.id} group={child} level={level + 1} />
        ))}
      </ul>
    )}
  </li>
);

export const GroupsPage: React.FC = () => {
  const { eventId = "" } = useParams<{ eventId: string }>();
  const { currentUser } = useAuth();
  const [groups, setGroups] = useState<GroupTreeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", quota: 1, parentGroupId: "" });

  const canCreate = currentUser?.permissions.includes("create_group") ?? false;
  const flatGroups = useMemo(() => flattenGroups(groups), [groups]);

  const loadGroups = async () => {
    setLoading(true);
    setError("");

    try {
      const tree = await apiClient.getGroupTree(eventId);
      setGroups(tree);
      setFormData((value) => ({
        ...value,
        parentGroupId: value.parentGroupId || String(flattenGroups(tree)[0]?.id ?? ""),
      }));
    } catch (err) {
      setError("Не удалось загрузить дерево групп.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canCreate) {
      setError("У вас нет прав для управления группами.");
      setLoading(false);
      return;
    }

    loadGroups();
  }, [eventId, canCreate]);

  const closeCreateModal = () => {
    if (saving) return;
    setIsCreateModalOpen(false);
    setError("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      await apiClient.createGroup(eventId, {
        name: formData.name.trim(),
        quota: Number(formData.quota),
        parentGroupId: formData.parentGroupId ? Number(formData.parentGroupId) : null,
      });
      setFormData({ name: "", quota: 1, parentGroupId: formData.parentGroupId });
      setIsCreateModalOpen(false);
      await loadGroups();
    } catch (err) {
      setError("Не удалось создать группу. Проверьте квоту родительской группы.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tab-content">
      <div className="section-heading">
        <div className="section-title-row">
          <h2>Группы</h2>
          <span className="badge">Всего: {flatGroups.length}</span>
        </div>
        <div className="section-actions">
          {canCreate && (
            <button className="primary-button create-action-button" onClick={() => setIsCreateModalOpen(true)}>
              Создать группу
            </button>
          )}
        </div>
      </div>

      {error && !isCreateModalOpen && <div className="alert alert-error">{error}</div>}

      <section className="panel">
        {loading ? (
          <div className="empty-state compact">Загрузка...</div>
        ) : groups.length === 0 ? (
          <div className="empty-state compact">Группы пока не найдены.</div>
        ) : (
          <ul className="tree-list root">
            {groups.map((group) => (
              <GroupNode key={group.id} group={group} />
            ))}
          </ul>
        )}
      </section>

      {isCreateModalOpen && (
        <Modal
          title="Создать группу"
          description="Выберите родительскую группу и задайте квоту для нового подразделения."
          onClose={closeCreateModal}
        >
          {error && <div className="alert alert-error">{error}</div>}

          <form className="form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Название</span>
              <input value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} disabled={saving} required />
            </label>
            <label className="field">
              <span>Квота</span>
              <input min={0} type="number" value={formData.quota} onChange={(event) => setFormData({ ...formData, quota: Number(event.target.value) })} disabled={saving} required />
            </label>
            <label className="field">
              <span>Родительская группа</span>
              <select value={formData.parentGroupId} onChange={(event) => setFormData({ ...formData, parentGroupId: event.target.value })} disabled={saving} required>
                {flatGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {"- ".repeat(group.level)}{group.name} · свободно {group.availableQuota}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={closeCreateModal} disabled={saving}>
                Закрыть
              </button>
              <button className="primary-button" type="submit" disabled={saving}>
                {saving ? "Создаём..." : "Создать"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

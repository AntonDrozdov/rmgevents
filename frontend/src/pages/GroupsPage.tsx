import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
  const navigate = useNavigate();
  const [groups, setGroups] = useState<GroupTreeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({ name: "", quota: 1, parentGroupId: "" });

  const canCreate = currentUser?.permissions.includes("create_group") ?? false;
  const flatGroups = useMemo(() => flattenGroups(groups), [groups]);

  const loadGroups = async () => {
    setLoading(true);
    setError("");

    try {
      const tree = await apiClient.getGroupTree(eventId);
      setGroups(tree);
      setFormData((value) => ({ ...value, parentGroupId: value.parentGroupId || flattenGroups(tree)[0]?.id || "" }));
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    try {
      await apiClient.createGroup(eventId, {
        name: formData.name.trim(),
        quota: Number(formData.quota),
        parentGroupId: formData.parentGroupId,
      });
      setFormData({ name: "", quota: 1, parentGroupId: formData.parentGroupId });
      await loadGroups();
    } catch (err) {
      setError("Не удалось создать группу. Проверьте квоту родительской группы.");
      console.error(err);
    }
  };

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Иерархия</p>
          <h1>Группы</h1>
          <p className="muted">Дерево групп мероприятия и ограничения по квотам.</p>
        </div>
        <button className="secondary-button" onClick={() => navigate("/dashboard")}>Назад</button>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {canCreate && (
        <section className="panel">
          <div className="section-heading">
            <h2>Создать дочернюю группу</h2>
          </div>
          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>Название</span>
              <input value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} required />
            </label>
            <label className="field">
              <span>Квота</span>
              <input min={0} type="number" value={formData.quota} onChange={(event) => setFormData({ ...formData, quota: Number(event.target.value) })} required />
            </label>
            <label className="field">
              <span>Родительская группа</span>
              <select value={formData.parentGroupId} onChange={(event) => setFormData({ ...formData, parentGroupId: event.target.value })} required>
                {flatGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {"- ".repeat(group.level)}{group.name} · свободно {group.availableQuota}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-button form-submit" type="submit">Создать группу</button>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="section-heading">
          <h2>Дерево групп</h2>
          <span className="badge">{flatGroups.length}</span>
        </div>

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
    </main>
  );
};

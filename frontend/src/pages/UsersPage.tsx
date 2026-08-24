import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";
import { GroupTreeDto, UserDto } from "../types";
import { flattenGroups, groupNameById } from "../utils/groups";

export const UsersPage: React.FC = () => {
  const { eventId = "" } = useParams<{ eventId: string }>();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserDto[]>([]);
  const [groups, setGroups] = useState<GroupTreeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    username: "",
    displayName: "",
    roleId: "",
    groupId: "",
  });

  const canCreate = currentUser?.permissions.includes("create_user") ?? false;
  const flatGroups = useMemo(() => flattenGroups(groups), [groups]);

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const [userList, groupTree] = await Promise.all([
        apiClient.getUsers(eventId),
        apiClient.getGroupTree(eventId),
      ]);
      setUsers(userList);
      setGroups(groupTree);
      setFormData((value) => ({ ...value, groupId: value.groupId || flattenGroups(groupTree)[0]?.id || "" }));
    } catch (err) {
      setError("Не удалось загрузить сотрудников.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canCreate) {
      setError("У вас нет прав для управления сотрудниками.");
      setLoading(false);
      return;
    }

    loadData();
  }, [eventId, canCreate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    try {
      await apiClient.createUser(eventId, {
        username: formData.username.trim(),
        displayName: formData.displayName.trim(),
        roleId: formData.roleId.trim(),
        groupId: formData.groupId,
      });
      setFormData({ username: "", displayName: "", roleId: "", groupId: flatGroups[0]?.id ?? "" });
      await loadData();
    } catch (err) {
      setError("Не удалось создать сотрудника. Бэкенд ожидает существующие ID логина и роли.");
      console.error(err);
    }
  };

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Команда</p>
          <h1>Сотрудники</h1>
          <p className="muted">Назначение пользователей на роли и группы внутри мероприятия.</p>
        </div>
        <button className="secondary-button" onClick={() => navigate("/dashboard")}>Назад</button>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {canCreate && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Создать сотрудника</h2>
              <p className="muted">Сейчас API принимает ID логина в поле логина и ID роли. Когда на бэке появится справочник ролей, селект можно подключить сюда.</p>
            </div>
          </div>

          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>ID логина</span>
              <input value={formData.username} onChange={(event) => setFormData({ ...formData, username: event.target.value })} required />
            </label>
            <label className="field">
              <span>Имя сотрудника</span>
              <input value={formData.displayName} onChange={(event) => setFormData({ ...formData, displayName: event.target.value })} required />
            </label>
            <label className="field">
              <span>ID роли</span>
              <input value={formData.roleId} onChange={(event) => setFormData({ ...formData, roleId: event.target.value })} required />
            </label>
            <label className="field">
              <span>Группа</span>
              <select value={formData.groupId} onChange={(event) => setFormData({ ...formData, groupId: event.target.value })} required>
                {flatGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {"- ".repeat(group.level)}{group.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-button form-submit" type="submit">Создать сотрудника</button>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="section-heading">
          <h2>Список сотрудников</h2>
          <span className="badge">{users.length}</span>
        </div>

        {loading ? (
          <div className="empty-state compact">Загрузка...</div>
        ) : users.length === 0 ? (
          <div className="empty-state compact">Сотрудники пока не найдены.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Имя</th>
                  <th>Группа</th>
                  <th>ID роли</th>
                  <th>ID логина</th>
                  <th>Создан</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.displayName}</td>
                    <td>{groupNameById(groups, user.groupId)}</td>
                    <td><code>{user.roleId}</code></td>
                    <td><code>{user.loginId}</code></td>
                    <td>{new Date(user.createdAt).toLocaleDateString("ru-RU")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
};

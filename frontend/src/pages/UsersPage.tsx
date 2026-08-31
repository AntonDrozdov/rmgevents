import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Modal } from "../components/Modal";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";
import { GroupTreeDto, UserDto } from "../types";
import { flattenGroups } from "../utils/groups";

const formatUserName = (user: Pick<UserDto, "surname" | "name" | "additionalName">) =>
  [user.surname, user.name, user.additionalName].filter(Boolean).join(" ");

const emptyForm = (groupId = "") => ({
  loginId: "",
  surname: "",
  name: "",
  additionalName: "",
  email: "",
  tel: "",
  roleId: "",
  groupId,
});

export const UsersPage: React.FC = () => {
  const { eventId = "" } = useParams<{ eventId: string }>();
  const { currentUser } = useAuth();
  const [users, setUsers] = useState<UserDto[]>([]);
  const [groups, setGroups] = useState<GroupTreeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm());

  const canCreate = currentUser?.permissions.includes("create_user") ?? false;
  const flatGroups = useMemo(() => flattenGroups(groups), [groups]);

  const loadUsers = async () => {
    if (!eventId) return;

    setLoading(true);
    setError("");

    try {
      const userList = await apiClient.getUsers(eventId);
      setUsers(userList);
    } catch (err) {
      setError("Не удалось загрузить сотрудников.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadGroupsForCreate = async () => {
    if (!eventId || groups.length > 0) return;

    setGroupsLoading(true);
    setError("");

    try {
      const groupTree = await apiClient.getGroupTree(eventId);
      setGroups(groupTree);
      setFormData((value) => ({
        ...value,
        groupId: value.groupId || String(flattenGroups(groupTree)[0]?.id ?? ""),
      }));
    } catch (err) {
      setError("Не удалось загрузить группы для создания сотрудника.");
      console.error(err);
    } finally {
      setGroupsLoading(false);
    }
  };

  useEffect(() => {
    if (!canCreate) {
      setError("У вас нет прав для управления сотрудниками.");
      setLoading(false);
      return;
    }

    loadUsers();
  }, [eventId, canCreate]);

  const openCreateModal = async () => {
    setIsCreateModalOpen(true);
    await loadGroupsForCreate();
  };

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
      await apiClient.createUser(eventId, {
        loginId: Number(formData.loginId),
        name: formData.name.trim(),
        surname: formData.surname.trim(),
        additionalName: formData.additionalName.trim() || undefined,
        email: formData.email.trim() || undefined,
        tel: formData.tel.trim() || undefined,
        roleId: Number(formData.roleId),
        groupId: Number(formData.groupId),
      });
      setFormData(emptyForm(String(flatGroups[0]?.id ?? "")));
      setIsCreateModalOpen(false);
      await loadUsers();
    } catch (err) {
      setError("Не удалось создать сотрудника. Проверьте ID логина, ID роли и группу.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tab-content">
      <div className="section-heading">
        <div className="section-title-row">
          <h2>Сотрудники</h2>
          <span className="badge">Всего: {users.length}</span>
        </div>
        <div className="section-actions">
          {canCreate && (
            <button className="primary-button create-action-button" onClick={openCreateModal}>
              Создать сотрудника
            </button>
          )}
        </div>
      </div>

      {error && !isCreateModalOpen && <div className="alert alert-error">{error}</div>}

      <section className="panel">
        {loading ? (
          <div className="empty-state compact">Загрузка...</div>
        ) : users.length === 0 ? (
          <div className="empty-state compact">Сотрудники пока не найдены.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ФИО</th>
                  <th>Email</th>
                  <th>Телефон</th>
                  <th>Роль</th>
                  <th>Группа</th>
                  <th>Создан</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{formatUserName(user)}</td>
                    <td>{user.email || "-"}</td>
                    <td>{user.tel || "-"}</td>
                    <td>{user.roleName || "-"}</td>
                    <td>{user.groupName || "-"}</td>
                    <td>{new Date(user.createdAt).toLocaleDateString("ru-RU")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isCreateModalOpen && (
        <Modal
          title="Создать сотрудника"
          description="Укажите ID существующего логина и роли, затем заполните данные сотрудника."
          onClose={closeCreateModal}
        >
          {error && <div className="alert alert-error">{error}</div>}

          <form className="form" onSubmit={handleSubmit}>
            <label className="field">
              <span>ID логина</span>
              <input type="number" min={1} value={formData.loginId} onChange={(event) => setFormData({ ...formData, loginId: event.target.value })} disabled={saving} required />
            </label>
            <label className="field">
              <span>Фамилия</span>
              <input value={formData.surname} onChange={(event) => setFormData({ ...formData, surname: event.target.value })} disabled={saving} required />
            </label>
            <label className="field">
              <span>Имя</span>
              <input value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} disabled={saving} required />
            </label>
            <label className="field">
              <span>Отчество</span>
              <input value={formData.additionalName} onChange={(event) => setFormData({ ...formData, additionalName: event.target.value })} disabled={saving} />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} disabled={saving} />
            </label>
            <label className="field">
              <span>Телефон</span>
              <input type="tel" value={formData.tel} onChange={(event) => setFormData({ ...formData, tel: event.target.value })} disabled={saving} />
            </label>
            <label className="field">
              <span>ID роли</span>
              <input type="number" min={1} value={formData.roleId} onChange={(event) => setFormData({ ...formData, roleId: event.target.value })} disabled={saving} required />
            </label>
            <label className="field">
              <span>Группа</span>
              <select value={formData.groupId} onChange={(event) => setFormData({ ...formData, groupId: event.target.value })} disabled={saving || groupsLoading} required>
                {groupsLoading ? (
                  <option value="">Загрузка групп...</option>
                ) : (
                  flatGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {"- ".repeat(group.level)}{group.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={closeCreateModal} disabled={saving}>
                Закрыть
              </button>
              <button className="primary-button" type="submit" disabled={saving || groupsLoading}>
                {saving ? "Создаем..." : "Создать"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

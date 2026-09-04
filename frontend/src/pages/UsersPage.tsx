import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useParams } from "react-router-dom";
import { Modal } from "../components/Modal";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";
import { GroupTreeDto, RoleDto, UserDto, UserSearchResultDto } from "../types";
import { flattenGroups } from "../utils/groups";

const formatUserName = (user: Pick<UserDto, "surname" | "name" | "additionalName">) =>
  [user.surname, user.name, user.additionalName].filter(Boolean).join(" ");

const emptyForm = (groupId = "", roleId = "") => ({
  surname: "",
  name: "",
  additionalName: "",
  email: "",
  login: "",
  tel: "",
  roleId,
  groupId,
});

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

const ResetPasswordIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 14a5 5 0 1 1 4.6 3H10v2H8v2H4v-4.2A5 5 0 0 1 7 14Zm0-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10-8h2v3h3v2h-5V4Zm2.5 7a7.5 7.5 0 0 1-7.1 10l1.7-2.2A5.5 5.5 0 0 0 19.5 11Z" />
  </svg>
);

export const UsersPage: React.FC = () => {
  const { eventId = "" } = useParams<{ eventId: string }>();
  const { currentUser } = useAuth();
  const [users, setUsers] = useState<UserDto[]>([]);
  const [groups, setGroups] = useState<GroupTreeDto[]>([]);
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [referencesLoading, setReferencesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm());
  const [loginManuallyEdited, setLoginManuallyEdited] = useState(false);
  const [similarUsers, setSimilarUsers] = useState<UserSearchResultDto[]>([]);
  const [similarUsersLoading, setSimilarUsersLoading] = useState(false);
  const [similarUsersError, setSimilarUsersError] = useState("");
  const skipNextSearch = useRef(false);
  const [editingUser, setEditingUser] = useState<UserDto | null>(null);
  const [editFormData, setEditFormData] = useState(emptyForm());
  const [deleteUser, setDeleteUser] = useState<UserDto | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [resettingPasswordUserId, setResettingPasswordUserId] = useState<number | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserDto | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [resetPasswordError, setResetPasswordError] = useState("");

  const canCreate = currentUser?.permissions.includes("create_user") ?? false;
  const flatGroups = useMemo(() => flattenGroups(groups), [groups]);
  const rootGroupId = String(groups[0]?.id ?? "");
  const isAdministratorRole = (roleId: string) =>
    roles.find((role) => String(role.id) === roleId)?.name.toLowerCase() === "administrator";
  const administratorCount = useMemo(
    () => users.filter((user) => user.roleName?.toLowerCase() === "administrator").length,
    [users]
  );
  const isEditingOnlyAdministrator =
    editingUser?.roleName?.toLowerCase() === "administrator" && administratorCount <= 1;
  const isEditDirty = editingUser !== null && (
    editFormData.login.trim() !== editingUser.login ||
    editFormData.surname.trim() !== editingUser.surname ||
    editFormData.name.trim() !== editingUser.name ||
    editFormData.additionalName.trim() !== (editingUser.additionalName ?? "") ||
    editFormData.email.trim() !== (editingUser.email ?? "") ||
    editFormData.tel.trim() !== (editingUser.tel ?? "") ||
    Number(editFormData.roleId) !== editingUser.roleId ||
    Number(editFormData.groupId) !== editingUser.groupId
  );

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

  const loadReferencesForCreate = async () => {
    if (!eventId) return;

    setReferencesLoading(true);
    setError("");

    try {
      const [groupTree, roleList] = await Promise.all([
        apiClient.getGroupTree(eventId),
        apiClient.getRoles(eventId),
      ]);
      setGroups(groupTree);
      setRoles(roleList);
      setFormData((value) => {
        const roleId = value.roleId || String(roleList[0]?.id ?? "");
        const isAdministrator = roleList
          .find((role) => String(role.id) === roleId)
          ?.name.toLowerCase() === "administrator";

        return {
          ...value,
          roleId,
          groupId: isAdministrator
            ? String(groupTree[0]?.id ?? "")
            : value.groupId || String(flattenGroups(groupTree)[0]?.id ?? ""),
        };
      });
    } catch (err) {
      setError("Не удалось загрузить роли и группы для создания сотрудника.");
      console.error(err);
    } finally {
      setReferencesLoading(false);
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

  useEffect(() => {
    if (!isCreateModalOpen || !eventId) return;

    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }

    const query = {
      login: formData.login.trim(),
      surname: formData.surname.trim(),
      name: formData.name.trim(),
      email: formData.email.trim(),
    };
    const hasSearchValue = Object.values(query).some((value) => value.length >= 2);

    if (!hasSearchValue) {
      setSimilarUsers([]);
      setSimilarUsersError("");
      setSimilarUsersLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setSimilarUsersLoading(true);
      setSimilarUsersError("");

      try {
        const result = await apiClient.searchUsers(eventId, query, controller.signal);
        setSimilarUsers(result);
      } catch (err) {
        if (!axios.isCancel(err)) {
          setSimilarUsersError("Не удалось найти похожих сотрудников.");
          setSimilarUsers([]);
          console.error(err);
        }
      } finally {
        if (!controller.signal.aborted) setSimilarUsersLoading(false);
      }
    }, 450);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    eventId,
    isCreateModalOpen,
    formData.login,
    formData.surname,
    formData.name,
    formData.email,
  ]);

  const openCreateModal = async () => {
    setIsCreateModalOpen(true);
    await loadReferencesForCreate();
  };

  const closeCreateModal = () => {
    if (saving) return;
    setIsCreateModalOpen(false);
    setFormData(emptyForm(String(flatGroups[0]?.id ?? ""), String(roles[0]?.id ?? "")));
    setLoginManuallyEdited(false);
    setSimilarUsers([]);
    setSimilarUsersError("");
    setSimilarUsersLoading(false);
    setError("");
  };

  const useSimilarUser = (user: UserSearchResultDto) => {
    const role = roles.find((item) =>
      item.name.localeCompare(user.roleName ?? "", undefined, { sensitivity: "accent" }) === 0
    );
    const group = flatGroups.find((item) =>
      item.name.localeCompare(user.groupName ?? "", undefined, { sensitivity: "accent" }) === 0
    );
    const roleId = String(role?.id ?? formData.roleId);

    skipNextSearch.current = true;
    setLoginManuallyEdited(true);
    setFormData({
      login: user.login,
      surname: user.surname,
      name: user.name,
      additionalName: user.additionalName ?? "",
      email: user.email ?? "",
      tel: user.tel ?? "",
      roleId,
      groupId: isAdministratorRole(roleId)
        ? rootGroupId
        : String(group?.id ?? formData.groupId),
    });
    setSimilarUsers([]);
    setSimilarUsersError("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      await apiClient.createUser(eventId, {
        login: formData.login.trim(),
        name: formData.name.trim(),
        surname: formData.surname.trim(),
        additionalName: formData.additionalName.trim() || undefined,
        email: formData.email.trim(),
        tel: formData.tel.trim() || undefined,
        roleId: Number(formData.roleId),
        groupId: Number(formData.groupId),
      });
      setFormData(emptyForm(String(flatGroups[0]?.id ?? ""), String(roles[0]?.id ?? "")));
      setLoginManuallyEdited(false);
      setIsCreateModalOpen(false);
      await loadUsers();
    } catch (err) {
      const responseData = axios.isAxiosError(err) ? err.response?.data : null;
      const serverMessage =
        typeof responseData === "string"
          ? responseData
          : responseData && typeof responseData.message === "string"
            ? responseData.message
            : null;
      setError(serverMessage ?? "Не удалось создать сотрудника. Проверьте логин, роль и группу.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = async (user: UserDto) => {
    setError("");
    setEditingUser(user);
    setEditFormData({
      surname: user.surname,
      name: user.name,
      additionalName: user.additionalName ?? "",
      email: user.email ?? "",
      login: user.login,
      tel: user.tel ?? "",
      roleId: String(user.roleId),
      groupId: String(user.groupId),
    });
    await loadReferencesForCreate();
  };

  const closeEditModal = () => {
    if (saving) return;
    setEditingUser(null);
    setEditFormData(emptyForm());
    setError("");
  };

  const handleEditSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingUser || !isEditDirty) return;

    setError("");
    setSaving(true);

    try {
      await apiClient.updateUser(eventId, editingUser.id, {
        login: editFormData.login.trim(),
        surname: editFormData.surname.trim(),
        name: editFormData.name.trim(),
        additionalName: editFormData.additionalName.trim() || undefined,
        email: editFormData.email.trim(),
        tel: editFormData.tel.trim() || undefined,
        roleId: Number(editFormData.roleId),
        groupId: Number(editFormData.groupId),
      });
      setEditingUser(null);
      setEditFormData(emptyForm());
      await loadUsers();
    } catch (err) {
      const responseData = axios.isAxiosError(err) ? err.response?.data : null;
      const serverMessage =
        typeof responseData === "string"
          ? responseData
          : responseData && typeof responseData.message === "string"
            ? responseData.message
            : null;
      setError(serverMessage ?? "Не удалось сохранить изменения сотрудника.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const openDeleteModal = (user: UserDto) => {
    setDeleteUser(user);
    setDeleteError("");
  };

  const closeDeleteModal = () => {
    if (deletingUserId !== null) return;
    setDeleteUser(null);
    setDeleteError("");
  };

  const confirmDelete = async () => {
    if (!deleteUser) return;

    const isOnlyAdministrator =
      deleteUser.roleName?.toLowerCase() === "administrator" && administratorCount <= 1;

    if (isOnlyAdministrator) {
      setDeleteError("Нельзя удалить единственного сотрудника с ролью Administrator.");
      return;
    }

    setDeleteError("");
    setDeletingUserId(deleteUser.id);

    try {
      await apiClient.deleteUser(eventId, deleteUser.id);
      setDeleteUser(null);
      await loadUsers();
    } catch (err) {
      const backendMessage = axios.isAxiosError(err) && typeof err.response?.data === "string"
        ? err.response.data
        : "Не удалось удалить сотрудника.";
      setDeleteError(backendMessage);
      console.error(err);
    } finally {
      setDeletingUserId(null);
    }
  };

  const openResetPasswordModal = (user: UserDto) => {
    setResetPasswordUser(user);
    setTemporaryPassword("");
    setResetPasswordError("");
  };

  const closeResetPasswordModal = () => {
    if (resettingPasswordUserId !== null) return;
    setResetPasswordUser(null);
    setTemporaryPassword("");
    setResetPasswordError("");
  };

  const confirmResetPassword = async () => {
    if (!resetPasswordUser) return;

    setResetPasswordError("");
    setResettingPasswordUserId(resetPasswordUser.id);

    try {
      const password = await apiClient.resetUserPassword(eventId, resetPasswordUser.id);
      setTemporaryPassword(password);
    } catch (err) {
      const backendMessage = axios.isAxiosError(err) && typeof err.response?.data === "string"
        ? err.response.data
        : "Не удалось сбросить пароль сотрудника.";
      setResetPasswordError(backendMessage);
      console.error(err);
    } finally {
      setResettingPasswordUserId(null);
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

      {error && !isCreateModalOpen && !editingUser && <div className="alert alert-error">{error}</div>}

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
                  <th className="actions-column" aria-label="Действия" />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    className="table-hover-row table-editable-row"
                    key={user.id}
                    tabIndex={0}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("button, a, input, select, textarea")) return;
                      void openEditModal(user);
                    }}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
                      event.preventDefault();
                      void openEditModal(user);
                    }}
                  >
                    <td>{formatUserName(user)}</td>
                    <td>{user.email || "-"}</td>
                    <td>{user.tel || "-"}</td>
                    <td>{user.roleName || "-"}</td>
                    <td>{user.groupName || "-"}</td>
                    <td>{new Date(user.createdAt).toLocaleDateString("ru-RU")}</td>
                    <td className="actions-column">
                      <div className="table-icon-actions">
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => openEditModal(user)}
                          aria-label={`Редактировать ${formatUserName(user)}`}
                          title="Редактировать"
                        >
                          <EditIcon />
                        </button>
                        <button
                          className="icon-button icon-button-warning"
                          type="button"
                          onClick={() => openResetPasswordModal(user)}
                          disabled={resettingPasswordUserId === user.id}
                          aria-label={`Сбросить пароль ${formatUserName(user)}`}
                          title="Сбросить пароль на временный"
                        >
                          <ResetPasswordIcon />
                        </button>
                        {(user.roleName?.toLowerCase() !== "administrator" || administratorCount > 1) && (
                          <button
                            className="icon-button icon-button-danger"
                            type="button"
                            onClick={() => openDeleteModal(user)}
                            disabled={deletingUserId === user.id}
                            aria-label={`Удалить ${formatUserName(user)}`}
                            title="Удалить"
                          >
                            <DeleteIcon />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isCreateModalOpen && (
        <Modal
          className="employee-form-modal"
          title="Создать сотрудника"
          description="Заполните данные сотрудника и выберите его роль и группу."
          onClose={closeCreateModal}
        >
          {error && <div className="alert alert-error">{error}</div>}

          <form className="form employee-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Фамилия *</span>
              <input value={formData.surname} onChange={(event) => setFormData({ ...formData, surname: event.target.value })} disabled={saving} required />
            </label>
            <label className="field">
              <span>Имя *</span>
              <input value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} disabled={saving} required />
            </label>
            <label className="field">
              <span>Отчество</span>
              <input value={formData.additionalName} onChange={(event) => setFormData({ ...formData, additionalName: event.target.value })} disabled={saving} />
            </label>
            <label className="field">
              <span>Email *</span>
              <input
                type="email"
                value={formData.email}
                onChange={(event) => {
                  const email = event.target.value;
                  setFormData((value) => ({
                    ...value,
                    email,
                    login: loginManuallyEdited ? value.login : email,
                  }));
                }}
                disabled={saving}
                required
              />
            </label>
            <label className="field">
              <span>Логин *</span>
              <input
                value={formData.login}
                onChange={(event) => {
                  setLoginManuallyEdited(true);
                  setFormData({ ...formData, login: event.target.value });
                }}
                disabled={saving}
                required
              />
            </label>
            <label className="field">
              <span>Телефон</span>
              <input type="tel" value={formData.tel} onChange={(event) => setFormData({ ...formData, tel: event.target.value })} disabled={saving} />
            </label>
            <label className="field">
              <span>Роль *</span>
              <select
                value={formData.roleId}
                onChange={(event) => {
                  const roleId = event.target.value;
                  setFormData({
                    ...formData,
                    roleId,
                    groupId: isAdministratorRole(roleId) ? rootGroupId : formData.groupId,
                  });
                }}
                disabled={saving || referencesLoading}
                required
              >
                {referencesLoading ? (
                  <option value="">Загрузка ролей...</option>
                ) : roles.length === 0 ? (
                  <option value="">Роли не найдены</option>
                ) : (
                  roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="field">
              <span>Группа *</span>
              <select value={formData.groupId} onChange={(event) => setFormData({ ...formData, groupId: event.target.value })} disabled={saving || referencesLoading || isAdministratorRole(formData.roleId)} required>
                {referencesLoading ? (
                  <option value="">Загрузка групп...</option>
                ) : flatGroups.length === 0 ? (
                  <option value="">Группы не найдены</option>
                ) : (
                  flatGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {"- ".repeat(group.level)}{group.name}
                    </option>
                  ))
                )}
              </select>
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
                  {similarUsers.map((user) => (
                    <div className="similar-employee-row" key={user.id}>
                      <div className="similar-employee-data">
                        <span>{user.login}</span>
                        <span>{formatUserName(user)}</span>
                        <span>{user.email || "—"}</span>
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
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={closeCreateModal} disabled={saving}>
                Закрыть
              </button>
              <button className="primary-button" type="submit" disabled={saving || referencesLoading || roles.length === 0 || flatGroups.length === 0}>
                {saving ? "Создаем..." : "Создать"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editingUser && (
        <Modal
          className="employee-form-modal"
          title="Редактировать сотрудника"
          description="Можно изменить данные сотрудника, его логин, роль и группу."
          onClose={closeEditModal}
        >
          {error && <div className="alert alert-error">{error}</div>}

          <form className="form employee-form" onSubmit={handleEditSubmit}>
            <label className="field">
              <span>Фамилия *</span>
              <input value={editFormData.surname} onChange={(event) => setEditFormData({ ...editFormData, surname: event.target.value })} disabled={saving} required />
            </label>
            <label className="field">
              <span>Имя *</span>
              <input value={editFormData.name} onChange={(event) => setEditFormData({ ...editFormData, name: event.target.value })} disabled={saving} required />
            </label>
            <label className="field">
              <span>Отчество</span>
              <input value={editFormData.additionalName} onChange={(event) => setEditFormData({ ...editFormData, additionalName: event.target.value })} disabled={saving} />
            </label>
            <label className="field">
              <span>Email *</span>
              <input type="email" value={editFormData.email} onChange={(event) => setEditFormData({ ...editFormData, email: event.target.value })} disabled={saving} required />
            </label>
            <label className="field">
              <span>Логин *</span>
              <input
                value={editFormData.login}
                onChange={(event) => setEditFormData({ ...editFormData, login: event.target.value })}
                disabled={saving}
                required
              />
            </label>
            <label className="field">
              <span>Телефон</span>
              <input type="tel" value={editFormData.tel} onChange={(event) => setEditFormData({ ...editFormData, tel: event.target.value })} disabled={saving} />
            </label>
            <label className="field">
              <span>Роль *</span>
              <select
                value={editFormData.roleId}
                onChange={(event) => {
                  const roleId = event.target.value;
                  setEditFormData({
                    ...editFormData,
                    roleId,
                    groupId: isAdministratorRole(roleId) ? rootGroupId : editFormData.groupId,
                  });
                }}
                disabled={saving || referencesLoading}
                required
              >
                {roles.map((role) => (
                  <option
                    key={role.id}
                    value={role.id}
                    disabled={isEditingOnlyAdministrator && role.name.toLowerCase() !== "administrator"}
                  >
                    {role.name}
                  </option>
                ))}
              </select>
              {isEditingOnlyAdministrator && (
                <small>Сначала назначьте роль Administrator другому сотруднику.</small>
              )}
            </label>
            <label className="field">
              <span>Группа *</span>
              <select value={editFormData.groupId} onChange={(event) => setEditFormData({ ...editFormData, groupId: event.target.value })} disabled={saving || referencesLoading || isAdministratorRole(editFormData.roleId)} required>
                {flatGroups.map((group) => (
                  <option key={group.id} value={group.id}>{"- ".repeat(group.level)}{group.name}</option>
                ))}
              </select>
            </label>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={closeEditModal} disabled={saving}>Закрыть</button>
              <button className="primary-button" type="submit" disabled={saving || referencesLoading || roles.length === 0 || flatGroups.length === 0 || !isEditDirty}>
                {saving ? "Сохраняем..." : "Сохранить"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {deleteUser && (
        <Modal title="Удалить сотрудника" onClose={closeDeleteModal}>
          <p>
            Вы уверены, что хотите удалить сотрудника «{formatUserName(deleteUser)}»?
          </p>
          <p className="muted">Это действие нельзя отменить.</p>
          {deleteError && <div className="alert alert-error">{deleteError}</div>}
          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={closeDeleteModal} disabled={deletingUserId !== null}>
              Нет
            </button>
            <button className="danger-button" type="button" onClick={confirmDelete} disabled={deletingUserId !== null}>
              {deletingUserId !== null ? "Удаляем..." : "Да, удалить"}
            </button>
          </div>
        </Modal>
      )}

      {resetPasswordUser && (
        <Modal
          title={temporaryPassword ? "Пароль сброшен" : "Сбросить пароль"}
          onClose={closeResetPasswordModal}
        >
          {temporaryPassword ? (
            <>
              <p className="muted">
                Пароль сотрудника «{formatUserName(resetPasswordUser)}» успешно сброшен.
              </p>
              <p>Временный пароль равен логину сотрудника.</p>
              <p className="muted">
                При следующем входе сотруднику потребуется изменить пароль.
              </p>
              <div className="modal-actions">
                <button className="primary-button" type="button" onClick={closeResetPasswordModal}>
                  Закрыть
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                Вы уверены, что хотите сбросить пароль сотрудника «{formatUserName(resetPasswordUser)}»?
              </p>
              <p className="muted">Временный пароль будет равен логину сотрудника.</p>
              {resetPasswordError && <div className="alert alert-error">{resetPasswordError}</div>}
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={closeResetPasswordModal} disabled={resettingPasswordUserId !== null}>
                  Нет
                </button>
                <button className="danger-button" type="button" onClick={confirmResetPassword} disabled={resettingPasswordUserId !== null}>
                  {resettingPasswordUserId !== null ? "Сбрасываем..." : "Да, сбросить"}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
};

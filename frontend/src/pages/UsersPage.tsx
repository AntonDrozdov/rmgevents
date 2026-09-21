import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useParams } from "react-router-dom";
import { Modal } from "../components/Modal";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";
import {
  GroupTreeDto,
  OrganizationDepartmentTreeItemDto,
  OrganizationEmployeeTreeItemDto,
  OrganizationStructureTreeDto,
  RoleDto,
  UserDto,
  UserSearchResultDto,
} from "../types";
import { flattenGroups } from "../utils/groups";

const formatUserName = (user: Pick<UserDto, "surname" | "name" | "additionalName">) =>
  [user.surname, user.name, user.additionalName].filter(Boolean).join(" ");

const formatDateTime = (value: string) => new Date(value).toLocaleString("ru-RU");

const isAdministratorRoleName = (roleName?: string | null) => roleName?.toLowerCase() === "administrator";

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

const normalizeSearch = (value: string) => value.trim().toLocaleLowerCase("ru-RU");

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

export const UsersPage: React.FC = () => {
  const { eventId = "" } = useParams<{ eventId: string }>();
  const { currentUser, currentEvent, events } = useAuth();
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
  const [organizationTree, setOrganizationTree] = useState<OrganizationStructureTreeDto | null>(null);
  const [organizationTreeLoading, setOrganizationTreeLoading] = useState(false);
  const [organizationTreeError, setOrganizationTreeError] = useState("");
  const [organizationTreeSearch, setOrganizationTreeSearch] = useState("");
  const [selectedOrganizationEmployeeId, setSelectedOrganizationEmployeeId] = useState<number | null>(null);
  const [selectedOrganizationEmployeePosition, setSelectedOrganizationEmployeePosition] = useState("");
  const [similarUsers, setSimilarUsers] = useState<UserSearchResultDto[]>([]);
  const [similarUsersLoading, setSimilarUsersLoading] = useState(false);
  const [similarUsersError, setSimilarUsersError] = useState("");
  const [similarUserSourceRoleName, setSimilarUserSourceRoleName] = useState<string | null>(null);
  const [isAdminPromotionWarningOpen, setIsAdminPromotionWarningOpen] = useState(false);
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

  const selectedEvent = useMemo(() => events.find((event) => String(event.id) === eventId) ?? currentEvent, [events, eventId, currentEvent]);
  const hasCreatePermission = currentUser?.permissions.includes("create_user") ?? false;
  const isArchived = selectedEvent?.isArchived ?? false;
  const canCreate = hasCreatePermission && !isArchived;
  const flatGroups = useMemo(() => flattenGroups(groups), [groups]);
  const rootGroupId = String(groups[0]?.id ?? "");
  const isAdministratorRole = (roleId: string) =>
    isAdministratorRoleName(roles.find((role) => String(role.id) === roleId)?.name);
  const isPromotingSimilarUserToAdministrator =
    similarUserSourceRoleName !== null &&
    isAdministratorRole(formData.roleId) &&
    !isAdministratorRoleName(similarUserSourceRoleName);
  const administratorCount = useMemo(
    () => users.filter((user) => isAdministratorRoleName(user.roleName)).length,
    [users]
  );
  const isEditingOnlyAdministrator =
    isAdministratorRoleName(editingUser?.roleName) && administratorCount <= 1;
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

  const loadOrganizationTreeForCreate = async () => {
    if (!eventId) return;

    setOrganizationTreeLoading(true);
    setOrganizationTreeError("");

    try {
      setOrganizationTree(await apiClient.getOrganizationStructureTree(eventId));
    } catch (err) {
      setOrganizationTree(null);
      setOrganizationTreeError("Не удалось загрузить оригинальную структуру.");
      console.error(err);
    } finally {
      setOrganizationTreeLoading(false);
    }
  };

  useEffect(() => {
    if (!hasCreatePermission) {
      setError("У вас нет прав для управления сотрудниками.");
      setLoading(false);
      return;
    }

    loadUsers();
  }, [eventId, hasCreatePermission]);

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
    setSimilarUserSourceRoleName(null);
    setIsAdminPromotionWarningOpen(false);
    setSelectedOrganizationEmployeeId(null);
    setSelectedOrganizationEmployeePosition("");
    await Promise.all([
      loadReferencesForCreate(),
      loadOrganizationTreeForCreate(),
    ]);
  };

  const closeCreateModal = () => {
    if (saving) return;
    setIsCreateModalOpen(false);
    setFormData(emptyForm(String(flatGroups[0]?.id ?? ""), String(roles[0]?.id ?? "")));
    setLoginManuallyEdited(false);
    setSimilarUsers([]);
    setSimilarUsersError("");
    setSimilarUsersLoading(false);
    setSimilarUserSourceRoleName(null);
    setIsAdminPromotionWarningOpen(false);
    setOrganizationTreeSearch("");
    setSelectedOrganizationEmployeeId(null);
    setSelectedOrganizationEmployeePosition("");
    setOrganizationTreeError("");
    setError("");
  };

  const useOrganizationEmployee = (employee: OrganizationEmployeeTreeItemDto) => {
    skipNextSearch.current = true;
    setSelectedOrganizationEmployeeId(employee.id);
    setSelectedOrganizationEmployeePosition(employee.position);
    setSimilarUserSourceRoleName(null);
    setFormData((current) => {
      const nextEmail = current.email;
      return {
        ...current,
        surname: employee.surname ?? current.surname,
        name: employee.name ?? current.name,
        additionalName: employee.additionalName ?? "",
        email: nextEmail,
        login: loginManuallyEdited ? current.login : nextEmail || current.login,
      };
    });
    setSimilarUsers([]);
    setSimilarUsersError("");
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
    setSelectedOrganizationEmployeeId(null);
    setSelectedOrganizationEmployeePosition("");
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
    setSimilarUserSourceRoleName(user.roleName ?? null);
  };

  const createUserFromForm = async () => {
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
        organizationEmployeeId: selectedOrganizationEmployeeId ?? undefined,
      });
      setFormData(emptyForm(String(flatGroups[0]?.id ?? ""), String(roles[0]?.id ?? "")));
      setLoginManuallyEdited(false);
      setSimilarUserSourceRoleName(null);
      setIsAdminPromotionWarningOpen(false);
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
      setIsAdminPromotionWarningOpen(false);
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (isPromotingSimilarUserToAdministrator) {
      setIsAdminPromotionWarningOpen(true);
      return;
    }

    await createUserFromForm();
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
      {isArchived && <div className="alert alert-info">Мероприятие завершено. Список сотрудников доступен только для просмотра. Для изменений верните мероприятие в активные.</div>}

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
                  <th>Роль</th>
                  <th>Группа</th>
                  <th>Кем создан</th>
                  <th>Создан</th>
                  <th className="actions-column" aria-label="Действия" />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    className={`table-hover-row${canCreate ? " table-editable-row" : ""}`}
                    key={user.id}
                    tabIndex={0}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("button, a, input, select, textarea")) return;
                      void openEditModal(user);
                    }}
                    onKeyDown={(event) => {
                      if (!canCreate || event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
                      event.preventDefault();
                      void openEditModal(user);
                    }}
                  >
                    <td>{formatUserName(user)}</td>
                    <td>{user.email || "-"}</td>
                    <td>{user.roleName || "-"}</td>
                    <td>{user.groupName || "-"}</td>
                    <td>
                      <div>{user.createdByName || "-"}</div>
                      {user.createdByRoleName && <small>{user.createdByRoleName}</small>}
                    </td>
                    <td>{formatDateTime(user.createdAt)}</td>
                    <td className="actions-column">
                      {canCreate ? <div className="table-icon-actions">
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
                      </div> : "-"}
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
          className="employee-form-modal employee-create-modal"
          title="Создать сотрудника"
          description="Заполните данные сотрудника и выберите его роль и группу."
          onClose={closeCreateModal}
        >
          <div className="employee-create-layout">
            <aside className="organization-picker" aria-label="Оригинальная структура">
              <div className="organization-picker-header">
                <strong>Оригинальная структура</strong>
                {organizationTree && (
                  <span>{organizationTree.departmentsCount} отделов · {organizationTree.employeesCount} сотрудников</span>
                )}
              </div>
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
              ) : (
                <ul className="org-tree-list org-tree-root">
                  {organizationTree.departments
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
              {error && <div className="alert alert-error">{error}</div>}
              {selectedOrganizationEmployeePosition && (
                <div className="alert alert-info employee-source-message">
                  Данные заполнены из оригинальной структуры. Должность: {selectedOrganizationEmployeePosition}. Email в загруженной таблице отсутствует — заполните его вручную.
                </div>
              )}

          <form className="form employee-form" onSubmit={handleSubmit}>
            <div className="employee-form-fields">
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
                className={isAdministratorRole(formData.roleId) ? "role-select-administrator" : undefined}
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
              {isPromotingSimilarUserToAdministrator && (
                <small className="admin-role-warning">
                  При сохранении сотрудник будет повышен до Administrator.
                </small>
              )}
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
                        <span>{formatUserName(user)}</span>
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
              <button className="secondary-button" type="button" onClick={closeCreateModal} disabled={saving}>
                Закрыть
              </button>
              <button className="primary-button" type="submit" disabled={saving || referencesLoading || roles.length === 0 || flatGroups.length === 0}>
                {saving ? "Создаем..." : "Создать"}
              </button>
            </div>
          </form>
            </div>
          </div>
        </Modal>
      )}

      {isAdminPromotionWarningOpen && (
        <Modal
          title="Повысить сотрудника до Administrator?"
          description="Эта роль даёт полный доступ, включая создание мероприятий."
          onClose={() => {
            if (!saving) setIsAdminPromotionWarningOpen(false);
          }}
        >
          <p className="admin-promotion-warning">
            Вы используете данные похожего сотрудника и меняете его роль на Administrator. После создания сотрудник получит полный доступ к системе, включая создание мероприятий.
          </p>
          <div className="modal-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setIsAdminPromotionWarningOpen(false)}
              disabled={saving}
            >
              Отмена
            </button>
            <button
              className="danger-button"
              type="button"
              onClick={() => void createUserFromForm()}
              disabled={saving}
            >
              {saving ? "Создаем..." : "Создать администратором"}
            </button>
          </div>
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
                className={isAdministratorRole(editFormData.roleId) ? "role-select-administrator" : undefined}
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
                    className={isAdministratorRoleName(role.name) ? "role-option-administrator" : undefined}
                    disabled={isEditingOnlyAdministrator && !isAdministratorRoleName(role.name)}
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

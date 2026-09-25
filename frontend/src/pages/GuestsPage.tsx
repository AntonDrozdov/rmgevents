import { Placement } from "../types/placements";
import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useParams } from "react-router-dom";
import { Modal } from "../components/Modal";
import { GuestQrCode } from "../components/GuestQrCode";
import { downloadGuestTicket } from "../utils/guestQr";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";
import {
  CategoryDto,
  GroupTreeDto,
  GuestDto,
  GuestSearchResultDto,
  OrganizationDepartmentTreeItemDto,
  OrganizationEmployeeTreeItemDto,
  OrganizationStructureTreeDto,
  TagDto,
  TicketTemplateDto,
} from "../types";
import { flattenGroups } from "../utils/groups";

const statusLabel: Record<string, string> = {
  saved: "Сохранён",
  on_review: "На согласовании",
  admin_review: "На согласовании у администратора",
  approved: "Согласован Администратором",
  invited: "Приглашён",
  rejected: "Отклонён",
};

const guestStatusFilterOptions = [
  { value: "", label: "Все статусы" },
  ...Object.entries(statusLabel).map(([value, label]) => ({ value, label })),
];

const StatusWidthSizer = () => (
  <span className="status-width-sizer" aria-hidden="true">
    {Object.values(statusLabel).map((label) => <span key={label}>{label}</span>)}
    <span>Восстановить в Сохранён</span>
    <span>Пригласить</span>
    <span>Отправить на согласование</span>
    <span>Согласовать</span>
  </span>
);

const EditIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Zm12.5-16.5 4 4 1-1a1.4 1.4 0 0 0 0-2l-2-2a1.4 1.4 0 0 0-2 0l-1 1Z" /></svg>;
const DeleteIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21a2 2 0 0 1-2-2V6h14v13a2 2 0 0 1-2 2H7Zm1-3h2V9H8v9Zm6 0h2V9h-2v9ZM4 5V3h5l1-1h4l1 1h5v2H4Z" /></svg>;
const RejectIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V3h10v2H6v14h8v2H4Zm11.6-5.4-1.4-1.4 2.2-2.2H10v-2h6.4l-2.2-2.2 1.4-1.4L20.4 12l-4.8 4.6Z" /></svg>;
const QrIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h7v7H3V3Zm2 2v3h3V5H5Zm9-2h7v7h-7V3Zm2 2v3h3V5h-3ZM3 14h7v7H3v-7Zm2 2v3h3v-3H5Zm8-2h2v2h-2v-2Zm3 0h5v5h-2v-3h-3v-2Zm-3 3h2v4h-2v-4Zm3 2h2v2h-2v-2Zm3 1h2v2h-2v-2Z" /></svg>;
const TicketIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4a2 2 0 0 0 0 4v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6a2 2 0 0 0 0-4V5Zm5 2v10h2V7H9Z" /></svg>;
const emptyForm = (groupId = "", categoryId = "", tagIds: string[] = []) => ({ name: "", email: "", phone: "", groupId, categoryId, tagIds, placementId: "" });
const formatDateTime = (value: string) => new Date(value).toLocaleString("ru-RU");
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

const collectScopeIds = (groups: GroupTreeDto[], userGroupId?: number) => {
  const result = new Set<number>();
  const visit = (group: GroupTreeDto, insideScope: boolean) => {
    const active = insideScope || group.id === userGroupId;
    if (active) result.add(group.id);
    group.children.forEach((child) => visit(child, active));
  };
  groups.forEach((group) => visit(group, false));
  return result;
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

export const GuestsPage: React.FC = () => {
  const { eventId = "" } = useParams<{ eventId: string }>();
  const { currentUser, currentEvent, events } = useAuth();
  const [guests, setGuests] = useState<GuestDto[]>([]);
  const [groups, setGroups] = useState<GroupTreeDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [tags, setTags] = useState<TagDto[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [newTagError, setNewTagError] = useState("");
  const [creatingTag, setCreatingTag] = useState(false);
  const creatingTagRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [editingGuest, setEditingGuest] = useState<GuestDto | null>(null);
  const [deleteGuest, setDeleteGuest] = useState<GuestDto | null>(null);
  const [qrGuest, setQrGuest] = useState<GuestDto | null>(null);
  const [ticketGuest, setTicketGuest] = useState<GuestDto | null>(null);
  const [ticketTemplates, setTicketTemplates] = useState<TicketTemplateDto[]>([]);
  const [selectedTicketTemplateId, setSelectedTicketTemplateId] = useState<number | null>(null);
  const [formData, setFormData] = useState(emptyForm());
  const [guestSearch, setGuestSearch] = useState("");
  const [debouncedGuestSearch, setDebouncedGuestSearch] = useState("");
  const [guestStatusFilter, setGuestStatusFilter] = useState("");
  const [guestCategoryFilter, setGuestCategoryFilter] = useState("");
  const [guestTagFilters, setGuestTagFilters] = useState<string[]>([]);
  const [draftStatusFilter, setDraftStatusFilter] = useState("");
  const [draftCategoryFilter, setDraftCategoryFilter] = useState("");
  const [draftTagFilters, setDraftTagFilters] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalGuestCount, setTotalGuestCount] = useState(0);
  const [similarGuests, setSimilarGuests] = useState<GuestSearchResultDto[]>([]);
  const [similarGuestsLoading, setSimilarGuestsLoading] = useState(false);
  const [similarGuestsError, setSimilarGuestsError] = useState("");
  const [organizationTree, setOrganizationTree] = useState<OrganizationStructureTreeDto | null>(null);
  const [organizationTreeLoading, setOrganizationTreeLoading] = useState(false);
  const [organizationTreeError, setOrganizationTreeError] = useState("");
  const [organizationTreeSearch, setOrganizationTreeSearch] = useState("");
  const [selectedOrganizationEmployeeId, setSelectedOrganizationEmployeeId] = useState<number | null>(null);
  const [selectedOrganizationEmployeePosition, setSelectedOrganizationEmployeePosition] = useState("");
  const skipNextSearch = useRef(false);

  const selectedEvent = useMemo(() => events.find((event) => String(event.id) === eventId) ?? currentEvent, [events, eventId, currentEvent]);
  const isArchived = selectedEvent?.isArchived ?? false;
  const canCreateTags = (currentUser?.permissions.includes("create_event") ?? false) && !isArchived;
  const canCreate = (currentUser?.permissions.includes("create_guest") ?? false) && !isArchived;
  const canApprove = (currentUser?.permissions.includes("approve_guest") ?? false) && !isArchived;
  const isAdministrator = currentUser?.roleName.toLowerCase() === "administrator";
  const flatGroups = useMemo(() => flattenGroups(groups), [groups]);
  const scopeIds = useMemo(() => collectScopeIds(groups, currentUser?.groupId), [groups, currentUser?.groupId]);
  const isGuestEditDirty = editingGuest !== null && (
    (Number(formData.placementId) || null) !== (editingGuest.placementId ?? null) ||
    formData.name.trim() !== editingGuest.name ||
    formData.email.trim() !== (editingGuest.email ?? "") ||
    formData.phone.trim() !== (editingGuest.phone ?? "") ||
    Number(formData.groupId) !== editingGuest.groupId ||
    (formData.categoryId ? Number(formData.categoryId) : null) !== (editingGuest.categoryId ?? null) ||
    formData.tagIds.map(Number).sort((left, right) => left - right).join(",") !==
      editingGuest.tags.map((tag) => tag.id).sort((left, right) => left - right).join(",")
  );
  const guestSearchValue = guestSearch.trim();
  const isGuestSearchActive = guestSearchValue.length >= 2;
  const totalPages = Math.max(1, Math.ceil(totalGuestCount / pageSize));
  const pageStart = totalGuestCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(currentPage * pageSize, totalGuestCount);
  const canGoPreviousPage = currentPage > 1;
  const canGoNextPage = currentPage < totalPages;
  const selectedCategory = categories.find((category) => String(category.id) === formData.categoryId) ?? null;
  const selectedTags = tags.filter((tag) => formData.tagIds.includes(String(tag.id)));
  const selectedFilterCategory = categories.find((category) => String(category.id) === draftCategoryFilter) ?? null;
  const selectedFilterTags = tags.filter((tag) => draftTagFilters.includes(String(tag.id)));
  const activeFiltersCount = Number(Boolean(guestStatusFilter)) + Number(Boolean(guestCategoryFilter)) + Number(guestTagFilters.length > 0);

  const loadData = async () => {
    if (!eventId) return;
    setLoading(true);
    setError("");
    try {
      const guestPage = await apiClient.getGuests(eventId, {
        page: currentPage,
        pageSize,
        search: debouncedGuestSearch || undefined,
        status: guestStatusFilter || undefined,
        categoryId: guestCategoryFilter ? Number(guestCategoryFilter) : undefined,
        tagIds: guestTagFilters.map(Number),
      });
      setGuests(guestPage.items);
      setTotalGuestCount(guestPage.totalCount);
      setCurrentPage(guestPage.page);
      setPageSize(guestPage.pageSize);
    } catch (err) {
      setError("Не удалось загрузить гостей.");
      console.error(err);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [eventId, currentPage, pageSize, debouncedGuestSearch, guestStatusFilter, guestCategoryFilter, guestTagFilters]);

  useEffect(() => {
    if (!eventId) return;

    void Promise.all([
      apiClient.getCategories(eventId),
      apiClient.getTags(eventId),
      apiClient.getPlacements(eventId),
    ]).then(([categoryList, tagList]) => {
      setCategories(categoryList);
      setTags(tagList);
    }).catch((err) => {
      console.error(err);
    });
  }, [eventId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const normalizedSearch = guestSearch.trim();
      setDebouncedGuestSearch(normalizedSearch.length >= 2 ? normalizedSearch : "");
      setCurrentPage(1);
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [guestSearch]);

  useEffect(() => {
    if (!isCreateModalOpen || !eventId || editingGuest) return;

    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }

    const query = {
      name: formData.name.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim(),
    };
    const hasSearchValue = Object.values(query).some((value) => value.length >= 2);

    if (!hasSearchValue) {
      setSimilarGuests([]);
      setSimilarGuestsError("");
      setSimilarGuestsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setSimilarGuestsLoading(true);
      setSimilarGuestsError("");

      try {
        const result = await apiClient.searchGuests(eventId, query, controller.signal);
        setSimilarGuests(result);
      } catch (err) {
        if (!axios.isCancel(err)) {
          setSimilarGuestsError("Не удалось найти похожих гостей.");
          setSimilarGuests([]);
          console.error(err);
        }
      } finally {
        if (!controller.signal.aborted) setSimilarGuestsLoading(false);
      }
    }, 450);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    eventId,
    isCreateModalOpen,
    editingGuest,
    formData.name,
    formData.email,
    formData.phone,
  ]);

  const applyGuestUpdate = (updatedGuest: GuestDto) => {
    if (guestStatusFilter && updatedGuest.status !== guestStatusFilter) {
      void loadData();
      return;
    }

    setGuests((current) => current.map((guest) =>
      guest.id === updatedGuest.id ? updatedGuest : guest));
    setEditingGuest((current) =>
      current?.id === updatedGuest.id ? updatedGuest : current);
  };

  const loadFormLookups = async () => {
    if (!eventId) return { groupTree: groups, categoryList: categories, tagList: tags };

    const [groupTree, categoryList, tagList, placementList] = await Promise.all([
      apiClient.getGroupTree(eventId),
      apiClient.getCategories(eventId),
      apiClient.getTags(eventId),
      apiClient.getPlacements(eventId),
    ]);
    setPlacements(placementList);
    setGroups(groupTree);
    setCategories(categoryList);
    setTags(tagList);
    return { groupTree, categoryList, tagList };
  };

  const loadOrganizationTree = async () => {
    if (!eventId) return;

    setOrganizationTreeLoading(true);
    setOrganizationTreeError("");
    try {
      setOrganizationTree(await apiClient.getOrganizationStructureTree(eventId));
    } catch (err) {
      setOrganizationTreeError("Не удалось загрузить оригинальную структуру.");
      console.error(err);
    } finally {
      setOrganizationTreeLoading(false);
    }
  };

  const toggleFormTag = (tagId: number) => {
    const value = String(tagId);
    setFormData((current) => ({
      ...current,
      tagIds: current.tagIds.includes(value)
        ? current.tagIds.filter((id) => id !== value)
        : current.tagIds.length < 4 ? [...current.tagIds, value] : current.tagIds,
    }));
  };

  const createGuestFormTag = async () => {
    if (!canCreateTags || saving || creatingTagRef.current) return;
    const name = newTagName.trim();
    if (!name || newTagName.length > 50) {
      setNewTagError("Название метки должно содержать от 1 до 50 символов.");
      return;
    }
    if (tags.some((tag) => tag.name.toLocaleLowerCase("ru-RU") === name.toLocaleLowerCase("ru-RU"))) {
      setNewTagError("Такая метка уже есть. Выберите её из списка.");
      return;
    }

    creatingTagRef.current = true;
    setCreatingTag(true);
    setSaving(true);
    setNewTagError("");
    try {
      const created = await apiClient.createTag(eventId, { name, color: "#FFFFFF" });
      setTags((current) => [...current, created].sort((left, right) => left.name.localeCompare(right.name, "ru")));
      setFormData((current) => current.tagIds.length < 4
        ? { ...current, tagIds: [...current.tagIds, String(created.id)] }
        : current);
      setNewTagName("");
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data : null;
      setNewTagError(typeof message === "string" && message.includes("same name")
        ? "Такая метка уже существует."
        : "Не удалось создать метку. Попробуйте ещё раз.");
    } finally {
      creatingTagRef.current = false;
      setCreatingTag(false);
      setSaving(false);
    }
  };

  const toggleDraftTagFilter = (tagId: number) => {
    const value = String(tagId);
    setDraftTagFilters((current) =>
      current.includes(value)
        ? current.filter((id) => id !== value)
        : [...current, value]);
  };

  const openFiltersModal = () => {
    setDraftStatusFilter(guestStatusFilter);
    setDraftCategoryFilter(guestCategoryFilter);
    setDraftTagFilters(guestTagFilters);
    setIsFiltersModalOpen(true);
  };

  const applyFilters = () => {
    setGuestStatusFilter(draftStatusFilter);
    setGuestCategoryFilter(draftCategoryFilter);
    setGuestTagFilters(draftTagFilters);
    setCurrentPage(1);
    setIsFiltersModalOpen(false);
  };

  const resetFilters = () => {
    setDraftStatusFilter("");
    setDraftCategoryFilter("");
    setDraftTagFilters([]);
    setGuestStatusFilter("");
    setGuestCategoryFilter("");
    setGuestTagFilters([]);
    setCurrentPage(1);
    setIsFiltersModalOpen(false);
  };

  const openCreateModal = async () => {
    setNewTagName("");
    setNewTagError("");
    setError("");
    try {
      const { groupTree } = await loadFormLookups();
      const nextFlatGroups = flattenGroups(groupTree);
      const nextScopeIds = collectScopeIds(groupTree, currentUser?.groupId);
      setFormData(emptyForm(String([...nextScopeIds][0] ?? nextFlatGroups[0]?.id ?? "")));
      setSimilarGuests([]);
      setSimilarGuestsError("");
      setSimilarGuestsLoading(false);
      setOrganizationTreeSearch("");
      setSelectedOrganizationEmployeeId(null);
      setSelectedOrganizationEmployeePosition("");
      setIsCreateModalOpen(true);
      void loadOrganizationTree();
    } catch (err) {
      setError("Не удалось загрузить данные формы гостя.");
      console.error(err);
    }
  };

  const openEditModal = async (guest: GuestDto) => {
    setNewTagName("");
    setNewTagError("");
    setError("");
    try {
      await loadFormLookups();
      setEditingGuest(guest);
      setFormData({
        placementId: String(guest.placementId ?? ""),
        name: guest.name,
        email: guest.email ?? "",
        phone: guest.phone ?? "",
        groupId: String(guest.groupId),
        categoryId: guest.categoryId ? String(guest.categoryId) : "",
        tagIds: guest.tags.map((tag) => String(tag.id)),
      });
    } catch (err) {
      setError("Не удалось загрузить данные формы гостя.");
      console.error(err);
    }
  };

  const closeForm = () => {
    if (saving || creatingTagRef.current) return;
    setIsCreateModalOpen(false);
    setEditingGuest(null);
    setFormData(emptyForm());
    setSimilarGuests([]);
    setSimilarGuestsError("");
    setSimilarGuestsLoading(false);
    setOrganizationTreeSearch("");
    setSelectedOrganizationEmployeeId(null);
    setSelectedOrganizationEmployeePosition("");
    setError("");
  };

  const openTicketMenu = async (guest: GuestDto) => {
    try { const templates = await apiClient.getTicketTemplates(eventId); setTicketTemplates(templates); setSelectedTicketTemplateId((templates.find(item => item.isDefault) ?? templates[0])?.id ?? null); setTicketGuest(guest); }
    catch { setError("Не удалось загрузить шаблоны билетов."); }
  };

  const useSimilarGuest = (guest: GuestSearchResultDto) => {
    const group = flatGroups.find((item) =>
      scopeIds.has(item.id) &&
      item.name.localeCompare(guest.groupName ?? "", undefined, { sensitivity: "accent" }) === 0
    );

    skipNextSearch.current = true;
    setFormData({
      name: guest.name,
      email: guest.email ?? "",
      phone: guest.phone ?? "",
      groupId: String(group?.id ?? formData.groupId),
      categoryId: formData.categoryId,
      tagIds: formData.tagIds,
      placementId: formData.placementId,
    });
    setSimilarGuests([]);
    setSimilarGuestsError("");
  };

  const useOrganizationPersonForGuest = (employee: OrganizationEmployeeTreeItemDto) => {
    setSelectedOrganizationEmployeeId(employee.id);
    setSelectedOrganizationEmployeePosition(employee.position);
    setFormData((current) => ({
      ...current,
      name: employee.fullName,
    }));
  };

  const submitGuest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || creatingTagRef.current) return;
    if (!formData.categoryId) {
      setError("Выберите категорию гостя.");
      return;
    }
    if (formData.tagIds.length > 4) {
      setError("Гостю можно назначить не более 4 меток.");
      return;
    }
    if (editingGuest && !isGuestEditDirty) return;
    setSaving(true);
    setError("");
    const request = {
      name: formData.name.trim(),
      email: formData.email.trim() || undefined,
      phone: formData.phone.trim() || undefined,
      groupId: Number(formData.groupId),
      categoryId: formData.categoryId ? Number(formData.categoryId) : null,
      tagIds: formData.tagIds.map(Number),
      placementId: Number(formData.placementId) || null,
    };
    try {
      const isCreatingGuest = !editingGuest;
      if (editingGuest) await apiClient.updateGuest(eventId, editingGuest.id, request);
      else await apiClient.createGuest(eventId, request);
      setIsCreateModalOpen(false);
      setEditingGuest(null);
      setFormData(emptyForm());
      setSimilarGuests([]);
      setSimilarGuestsError("");
      setSimilarGuestsLoading(false);
      if (isCreatingGuest && currentPage !== 1) {
        setCurrentPage(1);
      } else {
        await loadData();
      }
    } catch (err) {
      setError(editingGuest ? "Не удалось сохранить изменения гостя." : "Не удалось создать гостя.");
      console.error(err);
    } finally { setSaving(false); }
  };

  const updateGuestStatus = async (guestId: number, approve: boolean) => {
    setError("");
    try {
      const updatedGuest = await apiClient.approveGuest(eventId, { guestId, approve });
      applyGuestUpdate(updatedGuest);
    } catch (err) {
      setError(approve ? "Не удалось согласовать гостя." : "Не удалось отклонить гостя.");
      console.error(err);
    }
  };

  const inviteGuest = async (guestId: number) => {
    setError("");
    try {
      const updatedGuest = await apiClient.inviteGuest(eventId, guestId);
      applyGuestUpdate(updatedGuest);
    } catch (err) {
      setError("Не удалось пригласить гостя.");
      console.error(err);
    }
  };

  const submitGuestForReview = async (guestId: number) => {
    setError("");
    try {
      const updatedGuest = await apiClient.submitGuestForReview(eventId, guestId);
      applyGuestUpdate(updatedGuest);
    } catch (err) {
      setError("Не удалось отправить гостя на согласование.");
      console.error(err);
    }
  };

  const restoreGuestToSaved = async (guestId: number) => {
    setError("");
    try {
      const updatedGuest = await apiClient.restoreGuestToSaved(eventId, guestId);
      applyGuestUpdate(updatedGuest);
    } catch (err) {
      setError("Не удалось восстановить гостя в статусе «Сохранён».");
      console.error(err);
    }
  };

  const confirmDelete = async () => {
    if (!deleteGuest) return;
    setSaving(true);
    setError("");
    try {
      await apiClient.deleteGuest(eventId, deleteGuest.id);
      setDeleteGuest(null);
      if (guests.length === 1 && currentPage > 1) {
        setCurrentPage((value) => value - 1);
      } else {
        await loadData();
      }
    } catch (err) {
      setError("Не удалось удалить гостя.");
      console.error(err);
    } finally { setSaving(false); }
  };

  const canApproveGuest = (guest: GuestDto) => {
    if (!canApprove) return false;
    return guest.status === "on_review" ||
      (guest.status === "admin_review" && isAdministrator);
  };
  const canRejectGuest = (guest: GuestDto) => canApprove && guest.status !== "saved" && guest.status !== "rejected";
  const canSubmitGuest = (guest: GuestDto) => canCreate && guest.status === "saved";
  const canInviteGuest = (guest: GuestDto) => canCreate && guest.status === "approved";
  const canReturnGuest = (guest: GuestDto) => canApprove && guest.status === "rejected";
  const canManageGuest = (_guest: GuestDto) => canCreate;

  const renderWorkflow = (guest: GuestDto) => {
    const stages: Array<{ key: string; title: string; state: string; info: React.ReactNode }> = [
      { key: "saved", title: "Сохранён", state: "complete", info: <small>{formatDateTime(guest.createdAt)}</small> },
    ];
    const decisions = [...guest.decisions].sort((left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
    let reviewerCompletedInCycle = false;

    decisions.forEach((decision) => {
      const info = <small>{decision.actorName}<br />{formatDateTime(decision.createdAt)}</small>;
      if (decision.action === "submitted_for_review") {
        reviewerCompletedInCycle = false;
        stages.push({ key: `submitted-${decision.id}`, title: "На согласовании", state: "complete", info });
      } else if (decision.action === "reviewer_approved") {
        reviewerCompletedInCycle = true;
        stages.push({ key: `reviewer-${decision.id}`, title: "Согласован согласующим", state: "complete", info });
      } else if (decision.action === "admin_approved") {
        if (!reviewerCompletedInCycle) {
          stages.push({ key: `skipped-${decision.id}`, title: "Согласование согласующим", state: "skipped", info: <small>Пропущено администратором</small> });
        }
        stages.push({ key: `admin-${decision.id}`, title: "Согласован Администратором", state: "complete", info });
      } else if (decision.action === "invited") {
        stages.push({ key: `invited-${decision.id}`, title: "Приглашён", state: "complete", info });
      } else if (decision.action === "rejected") {
        stages.push({ key: `rejected-${decision.id}`, title: "Отклонён", state: "rejected", info });
      } else if (decision.action === "restored_to_saved") {
        stages.push({ key: `restored-${decision.id}`, title: "Восстановлен в Сохранён", state: "complete", info });
        reviewerCompletedInCycle = false;
      }
    });

    if (guest.status !== "rejected" && guest.status !== "invited") {
      if (guest.status === "saved") {
        stages.push({ key: "next-submitted", title: "На согласовании", state: "pending", info: <small>Ожидает отправки</small> });
      }
      if (guest.status === "saved" || guest.status === "on_review") {
        stages.push({ key: "next-reviewer", title: "Согласован согласующим", state: "pending", info: <small>Ожидает согласования</small> });
      }
      if (["saved", "on_review", "admin_review"].includes(guest.status)) {
        stages.push({ key: "next-admin", title: "Согласован Администратором", state: "pending", info: <small>Ожидает согласования</small> });
      }
      stages.push({ key: "next-invited", title: "Приглашён", state: "pending", info: <small>Ожидает приглашения</small> });
    }
    return <div className="approval-workflow">
      {stages.map((stage) => <div className={`workflow-step ${stage.state}`} key={stage.key}>
        <div className="workflow-track"><span className="workflow-marker" aria-hidden="true">{stage.state === "complete" ? "✓" : stage.state === "skipped" ? "−" : stage.state === "rejected" ? "×" : ""}</span></div>
        <strong>{stage.title}</strong>
        <div className="workflow-info">{stage.info}</div>
      </div>)}
    </div>;
  };

  return <div className="tab-content">
    <div className="section-heading guests-heading"><div className="section-title-row"><h2>Гости</h2><span className="badge">Всего: {totalGuestCount}</span></div><div className="section-actions">{canCreate && <button className="primary-button create-action-button guest-create-button" onClick={openCreateModal}>Добавить гостя</button>}</div></div>
    {error && !isCreateModalOpen && !editingGuest && !deleteGuest && <div className="alert alert-error">{error}</div>}
    {isArchived && <div className="alert alert-info">Мероприятие завершено. Просмотр и поиск доступны, изменения — только после возврата в активные.</div>}
    <section className="panel guests-table-panel">
      <div className="guest-search-row">
        <label className="field guest-search-field">
          <input
            value={guestSearch}
            onChange={(event) => setGuestSearch(event.target.value)}
            placeholder="Поиск по названию"
            aria-label="Поиск гостей по имени, email или телефону"
          />
        </label>
        <button
          className={`secondary-button filter-modal-button${activeFiltersCount > 0 ? " active" : ""}`}
          type="button"
          onClick={openFiltersModal}
          disabled={loading}
        >
          Фильтровать{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ""}
        </button>
        {(isGuestSearchActive || activeFiltersCount > 0) && (
          <span className="guest-search-count">Найдено: {totalGuestCount}</span>
        )}
      </div>
      {loading ? <div className="empty-state compact">Загрузка...</div> : totalGuestCount === 0 && !debouncedGuestSearch && !guestStatusFilter && !guestCategoryFilter && guestTagFilters.length === 0 ? <div className="empty-state compact">Гостей пока нет.</div> : totalGuestCount === 0 ? <div className="empty-state compact">По фильтрам ничего не найдено.</div> : <><div className="table-wrap guests-table-wrap"><table><thead><tr><th>Имя</th><th>Email</th><th>Категория</th><th>Метки</th><th>Статус</th><th>Группа</th><th className="actions-column" aria-label="Действия" /></tr></thead><tbody>{guests.map((guest) => {
      const showApprove = canApproveGuest(guest);
      const showReject = canRejectGuest(guest);
      const showSubmit = canSubmitGuest(guest);
      const showInvite = canInviteGuest(guest);
      const showReturn = canReturnGuest(guest);
      const nextAction = showReturn
        ? () => restoreGuestToSaved(guest.id)
        : showInvite
          ? () => inviteGuest(guest.id)
          : showSubmit
            ? () => submitGuestForReview(guest.id)
          : showApprove
            ? () => updateGuestStatus(guest.id, true)
            : null;
      const nextActionLabel = showReturn
        ? "Восстановить в Сохранён"
        : showInvite
          ? "Пригласить"
          : showSubmit
            ? "Отправить на согласование"
            : "Согласовать";
      const canEdit = canManageGuest(guest);
      return <tr className={`table-hover-row${canEdit ? " table-editable-row" : ""}`} key={guest.id} tabIndex={canEdit ? 0 : undefined} onClick={canEdit ? (event) => { if (!(event.target as HTMLElement).closest("button, a, input, select, textarea")) openEditModal(guest); } : undefined} onKeyDown={canEdit ? (event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openEditModal(guest); } } : undefined}><td>{guest.name}</td><td>{guest.email || "-"}</td><td>{guest.categoryName ? <span className="category-arrow"><span className="category-dot" style={{ backgroundColor: guest.categoryColor ?? "#2f6f87" }} aria-hidden="true" />{guest.categoryName}</span> : "-"}</td><td>{guest.tags.length > 0 ? <div className="guest-tags-cell">{guest.tags.map((tag) => <span className="tag-badge" key={tag.id}>{tag.name}</span>)}</div> : "-"}</td><td><div className="guest-status-actions">{nextAction ? <button className={`status status-action-button ${guest.status}`} type="button" onClick={nextAction} title={nextActionLabel}><StatusWidthSizer /><span className="status-current">{statusLabel[guest.status] ?? guest.status}</span><span className="status-next">{nextActionLabel}</span></button> : <span className={`status ${guest.status}`}><StatusWidthSizer /><span className="status-current">{statusLabel[guest.status] ?? guest.status}</span></span>}{showReject && <button className="icon-button icon-button-warning guest-reject-button" onClick={() => updateGuestStatus(guest.id, false)} title="Отклонить" aria-label={`Отклонить ${guest.name}`}><RejectIcon /></button>}</div></td><td>{guest.groupName || guest.groupId}</td>
        <td className="actions-column">{canManageGuest(guest) ? <div className="table-icon-actions"><button className="icon-button" onClick={() => void openTicketMenu(guest)} title="Скачать билет" aria-label={`Скачать билет гостя ${guest.name}`}><TicketIcon /></button><button className="icon-button" onClick={() => setQrGuest(guest)} title="Открыть QR-код" aria-label={`Открыть QR-код гостя ${guest.name}`}><QrIcon /></button><button className="icon-button" onClick={() => openEditModal(guest)} title="Редактировать" aria-label={`Редактировать ${guest.name}`}><EditIcon /></button><button className="icon-button icon-button-danger" onClick={() => setDeleteGuest(guest)} title="Удалить" aria-label={`Удалить ${guest.name}`}><DeleteIcon /></button></div> : "-"}</td></tr>;
    })}</tbody></table></div><div className="pagination-row"><div className="pagination-summary">Показаны {pageStart}-{pageEnd} из {totalGuestCount}</div><label className="pagination-size"><span>На странице</span><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setCurrentPage(1); }} disabled={loading}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label><div className="pagination-actions"><button className="secondary-button pagination-button" type="button" onClick={() => setCurrentPage((value) => Math.max(1, value - 1))} disabled={loading || !canGoPreviousPage}>Назад</button><span className="pagination-current">Страница {currentPage} из {totalPages}</span><button className="secondary-button pagination-button" type="button" onClick={() => setCurrentPage((value) => Math.min(totalPages, value + 1))} disabled={loading || !canGoNextPage}>Вперёд</button></div></div></>}
    </section>

    {isFiltersModalOpen && <Modal className="filters-modal" title="Фильтры гостей" description="Выберите статус, категорию и метки для списка гостей." onClose={() => setIsFiltersModalOpen(false)}>
      <div className="filters-form">
        <section className="filter-section">
          <div className="selected-filter-row">
            <span>Статус</span>
            {draftStatusFilter ? (
              <span className={`status ${draftStatusFilter}`}>{statusLabel[draftStatusFilter] ?? draftStatusFilter}</span>
            ) : (
              <span className="selected-category-empty">Все статусы</span>
            )}
          </div>
          <div className="filter-choice-list" role="radiogroup" aria-label="Статус гостя">
            {guestStatusFilterOptions.map((option) => (
              <button
                className={`filter-choice status-filter-choice${draftStatusFilter === option.value ? " selected" : ""}`}
                type="button"
                role="radio"
                aria-checked={draftStatusFilter === option.value}
                key={option.value || "all"}
                onClick={() => setDraftStatusFilter(option.value)}
              >
                {option.value ? (
                  <span className={`status ${option.value}`}>{option.label}</span>
                ) : (
                  option.label
                )}
              </button>
            ))}
          </div>
        </section>

        <section className="filter-section">
          <div className="selected-filter-row">
            <span>Категория</span>
            {selectedFilterCategory ? (
              <span className="category-arrow selected-category-arrow"><span className="category-dot" style={{ backgroundColor: selectedFilterCategory.color }} aria-hidden="true" />
                {selectedFilterCategory.name}
              </span>
            ) : (
              <span className="selected-category-empty">Все категории</span>
            )}
          </div>
          <div className="category-choice-list" role="radiogroup" aria-label="Категория гостя">
            <button
              className={`category-choice${draftCategoryFilter === "" ? " selected" : ""}`}
              type="button"
              role="radio"
              aria-checked={draftCategoryFilter === ""}
              onClick={() => setDraftCategoryFilter("")}
            >
              Все категории
            </button>
            {categories.map((category) => {
              const value = String(category.id);
              return (
                <button
                  className={`category-choice category-choice-arrow${draftCategoryFilter === value ? " selected" : ""}`}
                  type="button"
                  role="radio"
                  aria-checked={draftCategoryFilter === value}
                  key={category.id}
                  onClick={() => setDraftCategoryFilter(value)}
                >
                  <span className="category-arrow"><span className="category-dot" style={{ backgroundColor: category.color }} aria-hidden="true" />
                    {category.name}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="filter-section">
          <div className="selected-filter-row selected-tags-row">
            <span>Метки</span>
            {selectedFilterTags.length === 0 ? (
              <span className="selected-category-empty">Все метки</span>
            ) : selectedFilterTags.map((tag) => (
              <span className="tag-badge selected-tag-badge" key={tag.id}>
                {tag.name}
                <button className="tag-remove-button" type="button"
                  aria-label={`Убрать метку «${tag.name}» из фильтра`}
                  onClick={() => setDraftTagFilters((current) => current.filter((id) => id !== String(tag.id)))}>
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
                </button>
              </span>
            ))}
          </div>
          <div className="tag-choice-list" role="group" aria-label="Метки гостя">
            <button
              className={`category-choice${draftTagFilters.length === 0 ? " selected" : ""}`}
              type="button"
              onClick={() => setDraftTagFilters([])}
            >
              Все метки
            </button>
            {tags.length === 0 ? (
              <span className="tag-filter-empty">Меток пока нет.</span>
            ) : tags.map((tag) => {
              const selected = draftTagFilters.includes(String(tag.id));
              return (
                <button
                  className={`tag-choice${selected ? " selected" : ""}`}
                  type="button"
                  key={tag.id}
                  onClick={() => toggleDraftTagFilter(tag.id)}
                >
                  <span className="tag-badge">
                    {tag.name}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="modal-actions filters-modal-actions">
          <button className="secondary-button" type="button" onClick={() => setIsFiltersModalOpen(false)}>Отмена</button>
          <button className="secondary-button" type="button" onClick={resetFilters}>Сбросить</button>
          <button className="primary-button" type="button" onClick={applyFilters}>Применить</button>
        </div>
      </div>
    </Modal>}

    {(isCreateModalOpen || editingGuest) && <Modal className={`guest-form-modal${isCreateModalOpen && !editingGuest ? " guest-create-form-modal" : ""}`} title={editingGuest ? "Редактировать гостя" : "Добавить гостя"} description={editingGuest ? "Измените данные гостя и просмотрите цепочку согласования." : "Гость будет сохранён в выбранной группе."} onClose={closeForm}>{error && <div className="alert alert-error">{error}</div>}<form className={`form guest-edit-form guest-edit-form-with-tags${isCreateModalOpen && !editingGuest ? " guest-create-form-with-person-picker" : ""}`} onSubmit={submitGuest}>
      {isCreateModalOpen && !editingGuest && (
        <aside className="organization-picker guest-person-picker" aria-label="Оригинальная структура">
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
                    onSelectEmployee={useOrganizationPersonForGuest}
                  />
                ))}
            </ul>
          )}
        </aside>
      )}
      <div className="guest-form-main">
        {editingGuest && (
          <label className="field">
            <span>Дата создания</span>
            <input value={formatDateTime(editingGuest.createdAt)} readOnly />
          </label>
        )}
        {isCreateModalOpen && !editingGuest && selectedOrganizationEmployeePosition && (
          <div className="alert alert-info guest-person-source-message">
            Данные заполнены из оригинальной структуры. Должность: {selectedOrganizationEmployeePosition}. Email и телефон заполните вручную.
          </div>
        )}
        <label className="field"><span>Имя</span><input value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} disabled={saving} required /></label>
        <label className="field"><span>Email</span><input type="email" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} disabled={saving} /></label>
        <label className="field"><span>Телефон</span><input type="tel" value={formData.phone} onChange={(event) => setFormData({ ...formData, phone: event.target.value })} disabled={saving} /></label>
        <label className="field"><span>Группа</span><select value={formData.groupId} onChange={(event) => setFormData({ ...formData, groupId: event.target.value, placementId: "" })} disabled={saving} required>{flatGroups.filter((group) => scopeIds.has(group.id)).map((group) => <option key={group.id} value={group.id}>{"- ".repeat(group.level)}{group.name} · свободно {group.availableQuota}</option>)}</select></label>
        <label className="field guest-category-field">
          <span>Размещение</span>
          <select value={formData.placementId} disabled={saving} onChange={(event) => setFormData({ ...formData, placementId: event.target.value })}>
            <option value="">Без размещения</option>
            {placements.filter((p) => p.quota !== null && p.groupId !== null && collectScopeIds(groups, p.groupId).has(Number(formData.groupId)))
              .map((p) => <option key={p.id} value={p.id} disabled={p.guestCount >= p.quota! && p.id !== editingGuest?.placementId}>{p.name} · {p.guestCount}/{p.quota}</option>)}
          </select>
        </label>
        <label className="field guest-category-field">
          <span>Категория *</span>
          <select className="guest-category-select" value={formData.categoryId} onChange={(event) => setFormData({ ...formData, categoryId: event.target.value })} disabled={saving} required>
            <option value="" disabled>Выберите категорию</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          {selectedCategory && <span className="category-arrow"><span className="category-dot" style={{ backgroundColor: selectedCategory.color }} aria-hidden="true" />{selectedCategory.name}</span>}
          {categories.length === 0 && <small>Сначала создайте категорию мероприятия.</small>}
        </label>
        {isCreateModalOpen && !editingGuest && <div className="similar-employees similar-guests" aria-live="polite">
          <div className="similar-employees-heading">
            <strong>Похожие гости</strong>
            {similarGuestsLoading && <span>Ищем...</span>}
          </div>
          {similarGuestsError ? (
            <div className="similar-employees-message error-text">{similarGuestsError}</div>
          ) : similarGuests.length > 0 ? (
            <div className="similar-employees-list">
              <div className="similar-employee-row similar-employee-header" aria-hidden="true">
                <div className="similar-employee-data similar-guest-data">
                  <span>Имя</span>
                  <span>Email</span>
                  <span>Телефон</span>
                  <span>Мероприятие</span>
                  <span>Группа</span>
                  <span>Статус</span>
                </div>
                <span className="similar-employee-header-action">Действие</span>
              </div>
              {similarGuests.map((guest) => (
                <div className="similar-employee-row" key={guest.id}>
                  <div className="similar-employee-data similar-guest-data">
                    <span>{guest.name}</span>
                    <span>{guest.email || "—"}</span>
                    <span>{guest.phone || "—"}</span>
                    <span title={guest.eventName || undefined}>{guest.eventName || "—"}</span>
                    <span>{guest.groupName || "—"}</span>
                    <span>{statusLabel[guest.status] ?? guest.status}</span>
                  </div>
                  <button
                    className="secondary-button similar-employee-use"
                    type="button"
                    onClick={() => useSimilarGuest(guest)}
                    disabled={saving}
                  >
                    Использовать
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="similar-employees-message">
              {similarGuestsLoading
                ? "Поиск по имени, email и телефону..."
                : "Введите не менее двух символов в имени, email или телефоне."}
            </div>
          )}
        </div>}
        {editingGuest && <div className="guest-workflow-section"><h3 className="workflow-title">Цепочка согласования</h3>{renderWorkflow(editingGuest)}</div>}
      </div>

      <aside className="guest-tags-side-panel" aria-label="Метки гостя">
        <div className="guest-tags-side-section">
          <h3>Присвоенные метки ({formData.tagIds.length}/4)</h3>
          <div className="selected-tags-row guest-tags-selected-panel">
            {selectedTags.length === 0 ? (
              <span className="selected-category-empty">Без меток</span>
            ) : selectedTags.map((tag) => (
              <span className="tag-badge selected-tag-badge" key={tag.id}>
                {tag.name}
                <button className="tag-remove-button" type="button" disabled={saving}
                  aria-label={`Снять метку «${tag.name}» с гостя`}
                  onClick={() => setFormData((current) => ({ ...current, tagIds: current.tagIds.filter((id) => id !== String(tag.id)) }))}>
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
                </button>
              </span>
            ))}
          </div>
        </div>
        <div className="guest-tags-side-section guest-tags-available-section">
          <h3>Доступные метки</h3>
          <div className="tag-choice-list guest-tags-choice-list" role="group" aria-label="Метки гостя">
            <button
              className={`category-choice${formData.tagIds.length === 0 ? " selected" : ""}`}
              type="button"
              onClick={() => setFormData({ ...formData, tagIds: [] })}
              disabled={saving}
            >
              Без меток
            </button>
            {tags.length === 0 ? (
              <span className="tag-filter-empty">Меток пока нет.</span>
            ) : tags.map((tag) => {
              const selected = formData.tagIds.includes(String(tag.id));
              return (
                <button
                  className={`tag-choice${selected ? " selected" : ""}`}
                  type="button"
                  key={tag.id}
                  onClick={() => toggleFormTag(tag.id)}
                  disabled={saving || (!selected && formData.tagIds.length >= 4)}
                >
                  <span className="tag-badge">
                    {tag.name}
                  </span>
                </button>
              );
            })}
          </div>
          {canCreateTags && (
            <div className="guest-tag-create">
              <label className="field">
                <span>Новая метка</span>
                <input value={newTagName} maxLength={50} disabled={saving}
                  placeholder="Название — до 50 символов"
                  onChange={(event) => { setNewTagName(event.target.value); setNewTagError(""); }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void createGuestFormTag();
                    }
                  }} />
              </label>
              <button className="secondary-button" type="button" disabled={saving || !newTagName.trim()} onClick={() => void createGuestFormTag()}>
                {creatingTag ? "Создаём метку..." : "Создать метку"}
              </button>
              {formData.tagIds.length >= 4 && <small>У гостя уже 4 метки. Новая метка появится в списке, но не будет назначена автоматически.</small>}
              {newTagError && <div className="error-text" role="alert">{newTagError}</div>}
            </div>
          )}
        </div>
        {editingGuest && <><div className="guest-qr-inline"><h3>QR-код гостя</h3><GuestQrCode guest={editingGuest} small /></div><button type="button" className="secondary-button guest-ticket-download-button" onClick={() => void openTicketMenu(editingGuest)}>Скачать билет</button></>}
      </aside>

      <div className="modal-actions"><button className="secondary-button" type="button" onClick={closeForm} disabled={saving}>Закрыть</button><button className="primary-button" type="submit" disabled={saving || Boolean(editingGuest && !isGuestEditDirty)}>{saving ? "Сохраняем..." : "Сохранить"}</button></div>
    </form></Modal>}

    {qrGuest && <Modal className="guest-qr-modal" title={`QR-код: ${qrGuest.name}`} description="Сканирование откроет публичную карточку гостя." onClose={() => setQrGuest(null)}><GuestQrCode guest={qrGuest} /><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setQrGuest(null)}>Закрыть</button></div></Modal>}
    {ticketGuest && <Modal title={`Билет: ${ticketGuest.name}`} description="Выберите шаблон для печати билета." onClose={() => setTicketGuest(null)}><div className="ticket-print-menu">{ticketTemplates.map(template => <button type="button" key={template.id} className={`ticket-print-template${selectedTicketTemplateId === template.id ? " selected" : ""}${template.isDefault ? " default" : ""}`} onClick={() => setSelectedTicketTemplateId(template.id)}><span>{template.name}</span>{template.isDefault && <strong>✓ По умолчанию</strong>}</button>)}{!ticketTemplates.length && <p>Сначала создайте шаблон билета.</p>}</div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setTicketGuest(null)}>Отмена</button><button type="button" className="primary-button" disabled={!selectedTicketTemplateId} onClick={() => { const template = ticketTemplates.find(item => item.id === selectedTicketTemplateId); if (template) { void downloadGuestTicket(ticketGuest, template); setTicketGuest(null); } }}>Скачать билет</button></div></Modal>}
    {deleteGuest && <Modal title="Удалить гостя" description={`Гость «${deleteGuest.name}» будет удалён без возможности восстановления.`} onClose={() => !saving && setDeleteGuest(null)}>{error && <div className="alert alert-error">{error}</div>}<div className="modal-actions"><button className="secondary-button" onClick={() => setDeleteGuest(null)} disabled={saving}>Отмена</button><button className="danger-button" onClick={confirmDelete} disabled={saving}>{saving ? "Удаляем..." : "Удалить"}</button></div></Modal>}
  </div>;
};

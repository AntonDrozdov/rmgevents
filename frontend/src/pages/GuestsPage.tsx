import { Placement } from "../types/placements";
import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useParams } from "react-router-dom";
import type { SheetData } from "write-excel-file/browser";
import { Modal } from "../components/Modal";
import { GuestQrCode } from "../components/GuestQrCode";
import { downloadGuestTicket } from "../utils/guestQr";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";
import { seatLabel } from "../utils/placementSeats";
import {
  CategoryDto,
  CompanionInput,
  GroupTreeDto,
  GuestDto,
  GuestBulkActionResultDto,
  GuestBulkActionOptionDto,
  GuestBulkSelectionRequest,
  GuestBulkSummaryDto,
  GuestSearchResultDto,
  OrganizationDepartmentTreeItemDto,
  OrganizationEmployeeTreeItemDto,
  OrganizationStructureTreeDto,
  TagDto,
  TicketTemplateDto,
  UserDto,
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
type GuestSortField = "name" | "status" | "category" | "group" | "placement" | "createdBy";
type GuestSortDirection = "asc" | "desc";
type GuestExportField = "id" | "name" | "email" | "phone" | "status" | "group" | "category" | "tags" | "placement" | "seat" | "createdBy" | "createdByRole" | "createdAt" | "approvedAt";
type GuestImportIssue = { rowNumber: number; values: string[]; reason: string };
type GuestImportResult = { importedCount: number; failedCount: number; issues: GuestImportIssue[] };
type CompanionDraft = { id?: number; name: string; groupId: string; categoryId: string };

const guestImportHeaders = ["Имя *", "Email", "Телефон", "Группа *", "Категория *", "Метки"] as const;

const guestExportFieldOptions: { key: GuestExportField; label: string; width: number }[] = [
  { key: "id", label: "ID", width: 10 },
  { key: "name", label: "Имя", width: 30 },
  { key: "email", label: "Email", width: 28 },
  { key: "phone", label: "Телефон", width: 20 },
  { key: "status", label: "Статус", width: 34 },
  { key: "group", label: "Группа", width: 28 },
  { key: "category", label: "Категория", width: 22 },
  { key: "tags", label: "Метки", width: 30 },
  { key: "placement", label: "Объект размещения", width: 28 },
  { key: "seat", label: "Место", width: 18 },
  { key: "createdBy", label: "Кто добавил", width: 28 },
  { key: "createdByRole", label: "Роль добавившего", width: 24 },
  { key: "createdAt", label: "Дата добавления", width: 22 },
  { key: "approvedAt", label: "Дата согласования", width: 22 },
];
const defaultGuestExportFields = guestExportFieldOptions.map((option) => option.key);

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
const CompanionsIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.5 20a5.5 5.5 0 0 1 11 0v1h-11v-1Zm11 1v-1c0-1.6-.5-3.1-1.4-4.3A5 5 0 0 1 21.5 20v1h-8Z" /></svg>;
const ExportExcelIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 15v4h14v-4M4 3h5m6 0h5M5 7h4m6 0h4M5 11h4m6 0h4" /></svg>;
const ImportExcelIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4m0 0 4 4m-4-4L8 8M5 16v4h14v-4M4 4h3m10 0h3M4 8h3m10 0h3M4 12h3m10 0h3" /></svg>;
const BulkActionsIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 2 2 4-4M12 7h8M4 13l2 2 4-4M12 13h8M4 19l2 2 4-4M12 19h8" /></svg>;
const emptyForm = (groupId = "", categoryId = "", tagIds: string[] = []) => ({ name: "", email: "", phone: "", groupId, categoryId, tagIds, placementId: "" });
const formatDateTime = (value: string) => new Date(value).toLocaleString("ru-RU");
const canDownloadGuestTicket = (guest: GuestDto) => !guest.isDeleted && (guest.status === "approved" || guest.status === "invited");
const userFullName = (user: UserDto) => [user.surname, user.name, user.additionalName].filter(Boolean).join(" ");
const normalizeSearch = (value: string) => value.trim().toLocaleLowerCase("ru-RU");
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const excelCellText = (value: unknown) => value === null || value === undefined ? "" : String(value).trim();
const guestImportErrorReason = (error: unknown) => {
  if (axios.isAxiosError(error) && error.response?.status === 403) return "Нет прав на добавление гостя в выбранную группу.";
  const response = axios.isAxiosError(error) ? error.response?.data : null;
  const message = typeof response === "string" ? response : typeof response?.title === "string" ? response.title : "Не удалось создать гостя.";
  const translations: Record<string, string> = {
    "Group quota is full": "В выбранной группе закончилась квота.",
    "Cannot create guest in this group": "Нет прав на добавление гостей в выбранную группу.",
    "Guest category is required": "Не указана категория гостя.",
    "Category does not belong to the guest event": "Категория не относится к этому мероприятию.",
    "A guest can have at most 4 tags": "Можно указать не более четырёх меток.",
    "All tags must belong to the guest event": "Одна или несколько меток не относятся к этому мероприятию.",
  };
  return translations[message] ?? message;
};

const RemovableFilterValue: React.FC<{
  label: string;
  compact?: boolean;
  onRemove: () => void;
  children: React.ReactNode;
}> = ({ label, compact = false, onRemove, children }) => <span className={`filter-value-with-remove${compact ? " compact" : ""}`}>
  {children}
  <button type="button" aria-label={`Убрать ${label}`} onClick={onRemove}>×</button>
</span>;

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
  const [users, setUsers] = useState<UserDto[]>([]);
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
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedExportFields, setSelectedExportFields] = useState<GuestExportField[]>(defaultGuestExportFields);
  const [exportingGuests, setExportingGuests] = useState(false);
  const [guestExportError, setGuestExportError] = useState("");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importingGuests, setImportingGuests] = useState(false);
  const [downloadingImportTemplate, setDownloadingImportTemplate] = useState(false);
  const [guestImportFileName, setGuestImportFileName] = useState("");
  const [guestImportError, setGuestImportError] = useState("");
  const [guestImportResult, setGuestImportResult] = useState<GuestImportResult | null>(null);
  const guestImportFileInput = useRef<HTMLInputElement>(null);
  const [editingGuest, setEditingGuest] = useState<GuestDto | null>(null);
  const [deleteGuest, setDeleteGuest] = useState<GuestDto | null>(null);
  const [qrGuest, setQrGuest] = useState<GuestDto | null>(null);
  const [ticketGuest, setTicketGuest] = useState<GuestDto | null>(null);
  const [ticketTemplates, setTicketTemplates] = useState<TicketTemplateDto[]>([]);
  const [selectedTicketTemplateId, setSelectedTicketTemplateId] = useState<number | null>(null);
  const [formData, setFormData] = useState(emptyForm());
  const [guestFormTab, setGuestFormTab] = useState<"guest" | "companions">("guest");
  const [companionDrafts, setCompanionDrafts] = useState<CompanionDraft[]>([]);
  const [savedCompanionDrafts, setSavedCompanionDrafts] = useState<CompanionDraft[]>([]);
  const [companionAddCount, setCompanionAddCount] = useState(1);
  const [expandedCompanionParents, setExpandedCompanionParents] = useState<Set<number>>(new Set());
  const [companionsByParent, setCompanionsByParent] = useState<Record<number, GuestDto[]>>({});
  const [guestPlacementSeatNumber, setGuestPlacementSeatNumber] = useState<number | null>(null);
  const [guestPlacementTreeCollapsed, setGuestPlacementTreeCollapsed] = useState<Set<number>>(new Set());
  const [guestPlacementMenuOpensUp, setGuestPlacementMenuOpensUp] = useState(false);
  const guestPlacementMenuRef = useRef<HTMLDetailsElement>(null);
  const [guestSearch, setGuestSearch] = useState("");
  const [debouncedGuestSearch, setDebouncedGuestSearch] = useState("");
  const [guestStatusFilters, setGuestStatusFilters] = useState<string[]>([]);
  const [guestCategoryFilters, setGuestCategoryFilters] = useState<string[]>([]);
  const [guestTagFilters, setGuestTagFilters] = useState<string[]>([]);
  const [guestGroupFilters, setGuestGroupFilters] = useState<string[]>([]);
  const [guestResponsibleFilters, setGuestResponsibleFilters] = useState<string[]>([]);
  const [draftStatusFilters, setDraftStatusFilters] = useState<string[]>([]);
  const [draftCategoryFilters, setDraftCategoryFilters] = useState<string[]>([]);
  const [draftTagFilters, setDraftTagFilters] = useState<string[]>([]);
  const [draftGroupFilters, setDraftGroupFilters] = useState<string[]>([]);
  const [draftResponsibleFilters, setDraftResponsibleFilters] = useState<string[]>([]);
  const [includeDeletedGuests, setIncludeDeletedGuests] = useState(false);
  const [draftIncludeDeletedGuests, setDraftIncludeDeletedGuests] = useState(false);
  const [hasCompanionsFilter, setHasCompanionsFilter] = useState(false);
  const [draftHasCompanionsFilter, setDraftHasCompanionsFilter] = useState(false);
  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<number>>(new Set());
  const [selectAllMatchingGuests, setSelectAllMatchingGuests] = useState(false);
  const [excludedGuestIds, setExcludedGuestIds] = useState<Set<number>>(new Set());
  const [bulkSummary, setBulkSummary] = useState<GuestBulkSummaryDto | null>(null);
  const [bulkResult, setBulkResult] = useState<GuestBulkActionResultDto | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkActionToConfirm, setBulkActionToConfirm] = useState<GuestBulkActionOptionDto | null>(null);
  const pageSelectionCheckbox = useRef<HTMLInputElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [guestSortBy, setGuestSortBy] = useState<GuestSortField | null>(null);
  const [guestSortDirection, setGuestSortDirection] = useState<GuestSortDirection>("asc");
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
  const importGroupOptions = useMemo(() => {
    const options: Array<{ id: number; name: string; path: string }> = [];
    const visit = (group: GroupTreeDto, parentPath: string) => {
      const path = parentPath ? `${parentPath} / ${group.name}` : group.name;
      if (scopeIds.has(group.id)) options.push({ id: group.id, name: group.name, path });
      group.children.forEach((child) => visit(child, path));
    };
    groups.forEach((group) => visit(group, ""));
    return options;
  }, [groups, scopeIds]);
  const guestPlacementTree = useMemo(() => {
    const guestGroupId = Number(formData.groupId);
    if (!guestGroupId) return { availableSeatsByPlacement: new Map<number, number[]>(), childrenByParent: new Map<number, Placement[]>(), roots: [] as Placement[] };

    const placementAcceptsGuestGroup = (placement: Placement) =>
      placement.quota !== null && placement.quota > 0 && placement.groupId !== null &&
      collectScopeIds(groups, placement.groupId).has(guestGroupId);
    const eligiblePlacements = placements.filter(placementAcceptsGuestGroup);
    const availableSeatsByPlacement = new Map<number, number[]>();
    const visibleIds = new Set<number>();
    const placementById = new Map(placements.map((placement) => [placement.id, placement]));

    eligiblePlacements.forEach((placement) => {
      const availableSeats = Array.from({ length: placement.quota ?? 0 }, (_, index) => index + 1)
        .filter((seatNumber) => !placement.occupiedSeatNumbers.includes(seatNumber) ||
          (placement.id === editingGuest?.placementId && seatNumber === editingGuest.placementSeatNumber));
      if (availableSeats.length === 0) return;
      availableSeatsByPlacement.set(placement.id, availableSeats);
      visibleIds.add(placement.id);
      let parentId = placement.parentId;
      const visited = new Set<number>();
      while (parentId !== null && visited.add(parentId)) {
        visibleIds.add(parentId);
        parentId = placementById.get(parentId)?.parentId ?? null;
      }
    });

    const childrenByParent = new Map<number, Placement[]>();
    const roots: Placement[] = [];
    placements.forEach((placement) => {
      if (!visibleIds.has(placement.id)) return;
      if (placement.parentId === null || !visibleIds.has(placement.parentId)) {
        roots.push(placement);
        return;
      }
      const children = childrenByParent.get(placement.parentId) ?? [];
      children.push(placement);
      childrenByParent.set(placement.parentId, children);
    });

    return { availableSeatsByPlacement, childrenByParent, roots };
  }, [editingGuest?.placementId, editingGuest?.placementSeatNumber, formData.groupId, groups, placements]);
  const selectedGuestPlacement = formData.placementId ? placements.find((placement) => placement.id === Number(formData.placementId)) ?? null : null;
  const selectedGuestPlacementValue = selectedGuestPlacement && guestPlacementSeatNumber
    ? `${selectedGuestPlacement.name} · ${seatLabel(selectedGuestPlacement, guestPlacementSeatNumber)}`
    : "Без размещения";
  const canChangeGuestPlacement = Boolean(editingGuest && ["approved", "invited"].includes(editingGuest.status));
  const isGuestEditDirty = editingGuest !== null && (
    (Number(formData.placementId) || null) !== (editingGuest.placementId ?? null) ||
    guestPlacementSeatNumber !== (editingGuest.placementSeatNumber ?? null) ||
    formData.name.trim() !== editingGuest.name ||
    formData.email.trim() !== (editingGuest.email ?? "") ||
    formData.phone.trim() !== (editingGuest.phone ?? "") ||
    Number(formData.groupId) !== editingGuest.groupId ||
    (formData.categoryId ? Number(formData.categoryId) : null) !== (editingGuest.categoryId ?? null) ||
    formData.tagIds.map(Number).sort((left, right) => left - right).join(",") !==
      editingGuest.tags.map((tag) => tag.id).sort((left, right) => left - right).join(",")
  );
  const companionDraftsDirty = JSON.stringify(companionDrafts) !== JSON.stringify(savedCompanionDrafts);
  const guestSearchValue = guestSearch.trim();
  const isGuestSearchActive = guestSearchValue.length >= 2;
  const visibleGuests = useMemo(() => {
    const guestsById = new Map(guests.map((guest) => [guest.id, guest]));
    const result: Array<{ guest: GuestDto; isCompanion: boolean }> = [];
    const roots = guests.filter((guest) => !guest.parentGuestId || !guestsById.has(guest.parentGuestId));
    roots.forEach((parent) => {
      result.push({ guest: parent, isCompanion: Boolean(parent.parentGuestId) });
      if (parent.parentGuestId) return;
      const listedCompanions = guests.filter((guest) => guest.parentGuestId === parent.id);
      const companions = isGuestSearchActive
        ? listedCompanions
        : expandedCompanionParents.has(parent.id)
          ? companionsByParent[parent.id] ?? listedCompanions
          : [];
      companions.forEach((companion) => result.push({ guest: companion, isCompanion: true }));
    });
    return result;
  }, [companionsByParent, expandedCompanionParents, guests, isGuestSearchActive]);
  const totalPages = Math.max(1, Math.ceil(totalGuestCount / pageSize));
  const pageStart = totalGuestCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(currentPage * pageSize, totalGuestCount);
  const canGoPreviousPage = currentPage > 1;
  const canGoNextPage = currentPage < totalPages;
  const selectedCategory = categories.find((category) => String(category.id) === formData.categoryId) ?? null;
  const selectedTags = tags.filter((tag) => formData.tagIds.includes(String(tag.id)));
  const selectedFilterStatuses = guestStatusFilterOptions.filter((option) => option.value && draftStatusFilters.includes(option.value));
  const selectedFilterCategories = categories.filter((category) => draftCategoryFilters.includes(String(category.id)));
  const selectedFilterTags = tags.filter((tag) => draftTagFilters.includes(String(tag.id)));
  const selectedFilterGroups = flatGroups.filter((group) => draftGroupFilters.includes(String(group.id)));
  const selectedFilterResponsibles = users.filter((user) => draftResponsibleFilters.includes(String(user.id)));
  const activeStatusFilters = guestStatusFilterOptions.filter((option) => option.value && guestStatusFilters.includes(option.value));
  const activeCategoryFilters = categories.filter((category) => guestCategoryFilters.includes(String(category.id)));
  const activeTagFilters = tags.filter((tag) => guestTagFilters.includes(String(tag.id)));
  const activeGroupFilters = flatGroups.filter((group) => guestGroupFilters.includes(String(group.id)));
  const activeResponsibleFilters = users.filter((user) => guestResponsibleFilters.includes(String(user.id)));
  const activeFiltersCount = Number(guestStatusFilters.length > 0)
    + Number(guestCategoryFilters.length > 0)
    + Number(guestTagFilters.length > 0)
    + Number(guestGroupFilters.length > 0)
    + Number(guestResponsibleFilters.length > 0)
    + Number(hasCompanionsFilter)
    + Number(includeDeletedGuests);

  const bulkSelection = useMemo<GuestBulkSelectionRequest>(() => ({
    selectAllMatching: selectAllMatchingGuests,
    guestIds: [...selectedGuestIds],
    excludedGuestIds: [...excludedGuestIds],
    search: debouncedGuestSearch || undefined,
    statuses: guestStatusFilters,
    includeDeleted: includeDeletedGuests,
    categoryIds: guestCategoryFilters.map(Number),
    tagIds: guestTagFilters.map(Number),
    groupIds: guestGroupFilters.map(Number),
    createdByUserIds: guestResponsibleFilters.map(Number),
    hasCompanions: hasCompanionsFilter,
  }), [selectAllMatchingGuests, selectedGuestIds, excludedGuestIds, debouncedGuestSearch, guestStatusFilters, includeDeletedGuests, guestCategoryFilters, guestTagFilters, guestGroupFilters, guestResponsibleFilters, hasCompanionsFilter]);

  const isGuestSelected = (guestId: number) => selectAllMatchingGuests
    ? !excludedGuestIds.has(guestId)
    : selectedGuestIds.has(guestId);
  const selectedOnPage = guests.filter((guest) => isGuestSelected(guest.id)).length;
  const selectedGuestCount = bulkSummary?.selectedCount ?? (selectAllMatchingGuests
    ? Math.max(0, totalGuestCount - excludedGuestIds.size)
    : selectedGuestIds.size);
  const bulkActions = bulkSummary?.actions ?? [];
  const bulkDeleteAction = bulkActions.find((action) => action.action === "delete") ?? null;

  const loadData = async () => {
    if (!eventId) return;
    setLoading(true);
    setError("");
    try {
      const guestPage = await apiClient.getGuests(eventId, {
        page: currentPage,
        pageSize,
        search: debouncedGuestSearch || undefined,
        statuses: guestStatusFilters.length ? guestStatusFilters : undefined,
        categoryIds: guestCategoryFilters.length ? guestCategoryFilters.map(Number) : undefined,
        tagIds: guestTagFilters.map(Number),
        groupIds: guestGroupFilters.length ? guestGroupFilters.map(Number) : undefined,
        createdByUserIds: guestResponsibleFilters.length ? guestResponsibleFilters.map(Number) : undefined,
        hasCompanions: hasCompanionsFilter || undefined,
        includeDeleted: includeDeletedGuests,
        sortBy: guestSortBy ?? undefined,
        sortDirection: guestSortBy ? guestSortDirection : undefined,
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

  const toggleExportField = (field: GuestExportField) => setSelectedExportFields((current) =>
    current.includes(field) ? current.filter((item) => item !== field) : [...current, field]
  );

  const exportFieldValue = (guest: GuestDto, field: GuestExportField): string | number => {
    const placement = guest.placementId ? placements.find((item) => item.id === guest.placementId) : null;
    switch (field) {
      case "id": return guest.id;
      case "name": return guest.name;
      case "email": return guest.email ?? "";
      case "phone": return guest.phone ?? "";
      case "status": return guest.isDeleted ? "Удалён" : statusLabel[guest.status] ?? guest.status;
      case "group": return guest.groupName ?? String(guest.groupId);
      case "category": return guest.categoryName ?? "";
      case "tags": return guest.tags.map((tag) => tag.name).join(", ");
      case "placement": return placement?.name ?? "";
      case "seat": return placement && guest.placementSeatNumber != null ? seatLabel(placement, guest.placementSeatNumber) : "";
      case "createdBy": return guest.createdByName ?? "";
      case "createdByRole": return guest.createdByRoleName ?? "";
      case "createdAt": return formatDateTime(guest.createdAt);
      case "approvedAt": return guest.approvedAt ? formatDateTime(guest.approvedAt) : "";
    }
  };

  const exportGuestsToExcel = async () => {
    if (!eventId || selectedExportFields.length === 0 || exportingGuests) return;
    setExportingGuests(true);
    setGuestExportError("");
    try {
      const exportedGuests: GuestDto[] = [];
      let exportPage = 1;
      let expectedCount = totalGuestCount;
      do {
        const result = await apiClient.getGuests(eventId, {
          page: exportPage,
          pageSize: 100,
          search: debouncedGuestSearch || undefined,
          statuses: guestStatusFilters.length ? guestStatusFilters : undefined,
          categoryIds: guestCategoryFilters.length ? guestCategoryFilters.map(Number) : undefined,
          tagIds: guestTagFilters.map(Number),
          groupIds: guestGroupFilters.length ? guestGroupFilters.map(Number) : undefined,
          createdByUserIds: guestResponsibleFilters.length ? guestResponsibleFilters.map(Number) : undefined,
          hasCompanions: hasCompanionsFilter || undefined,
          includeDeleted: includeDeletedGuests,
          sortBy: guestSortBy ?? undefined,
          sortDirection: guestSortBy ? guestSortDirection : undefined,
        });
        expectedCount = result.totalCount;
        exportedGuests.push(...result.items);
        if (result.items.length === 0) break;
        exportPage += 1;
      } while (exportedGuests.length < expectedCount);

      const fields = guestExportFieldOptions.filter((option) => selectedExportFields.includes(option.key));
      const sheetData: SheetData = [
        fields.map((field) => ({
          value: field.label,
          fontWeight: "bold",
          backgroundColor: "#E7EEF5",
          borderColor: "#B8C5D4",
          borderStyle: "thin" as const,
          alignVertical: "center" as const,
          wrap: true,
        })),
        ...exportedGuests.map((guest) => fields.map((field) => ({
          value: exportFieldValue(guest, field.key),
          borderColor: "#D7E0EA",
          borderStyle: "thin" as const,
          alignVertical: "top" as const,
          wrap: true,
        }))),
      ];
      const { default: writeXlsxFile } = await import("write-excel-file/browser");
      const eventName = (selectedEvent?.name ?? "мероприятие")
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
        .trim()
        .slice(0, 80) || "мероприятие";
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      await writeXlsxFile(sheetData, {
        sheet: "Гости",
        columns: fields.map((field) => ({ width: field.width })),
        stickyRowsCount: 1,
      }).toFile(`Гости_${eventName}_${date}.xlsx`);
      setIsExportModalOpen(false);
    } catch (err) {
      console.error(err);
      setGuestExportError("Не удалось сформировать файл Excel.");
    } finally {
      setExportingGuests(false);
    }
  };

  const importFileNamePart = () => (selectedEvent?.name ?? "мероприятие")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim()
    .slice(0, 80) || "мероприятие";

  const downloadGuestImportTemplate = async () => {
    if (downloadingImportTemplate) return;
    setDownloadingImportTemplate(true);
    setGuestImportError("");
    try {
      const headerRow = guestImportHeaders.map((header) => ({
        value: header,
        fontWeight: "bold" as const,
        backgroundColor: header.endsWith("*") ? "#FDECEC" : "#E7EEF5",
        borderColor: "#B8C5D4",
        borderStyle: "thin" as const,
        alignVertical: "center" as const,
        wrap: true,
      }));
      const templateData: SheetData = [headerRow];
      const referenceRows = Math.max(importGroupOptions.length, categories.length, tags.length);
      const referenceData: SheetData = [
        ["Доступные группы", "Категории", "Метки"].map((value) => ({ value, fontWeight: "bold" as const, backgroundColor: "#E7EEF5", borderColor: "#B8C5D4", borderStyle: "thin" as const })),
        ...Array.from({ length: referenceRows }, (_, index) => [
          { value: importGroupOptions[index]?.path ?? "" },
          { value: categories[index]?.name ?? "" },
          { value: tags[index]?.name ?? "" },
        ]),
      ];
      const { default: writeXlsxFile } = await import("write-excel-file/browser");
      await writeXlsxFile([
        { data: templateData, sheet: "Импорт", columns: [{ width: 30 }, { width: 28 }, { width: 20 }, { width: 42 }, { width: 24 }, { width: 36 }], stickyRowsCount: 1 },
        { data: referenceData, sheet: "Справочники", columns: [{ width: 42 }, { width: 28 }, { width: 32 }], stickyRowsCount: 1 },
      ]).toFile(`Шаблон_импорта_гостей_${importFileNamePart()}.xlsx`);
    } catch (error) {
      console.error(error);
      setGuestImportError("Не удалось сформировать шаблон импорта.");
    } finally {
      setDownloadingImportTemplate(false);
    }
  };

  const downloadGuestImportErrors = async () => {
    if (!guestImportResult?.issues.length) return;
    setGuestImportError("");
    try {
      const sheetData: SheetData = [
        ["Строка", ...guestImportHeaders, "Причина ошибки"].map((value) => ({ value, fontWeight: "bold" as const, backgroundColor: "#FDECEC", borderColor: "#D7A6A6", borderStyle: "thin" as const, wrap: true })),
        ...guestImportResult.issues.map((issue) => [issue.rowNumber, ...issue.values, issue.reason].map((value) => ({ value, borderColor: "#E3C4C4", borderStyle: "thin" as const, wrap: true }))),
      ];
      const { default: writeXlsxFile } = await import("write-excel-file/browser");
      await writeXlsxFile(sheetData, {
        sheet: "Ошибки импорта",
        columns: [{ width: 10 }, { width: 30 }, { width: 28 }, { width: 20 }, { width: 42 }, { width: 24 }, { width: 36 }, { width: 54 }],
        stickyRowsCount: 1,
      }).toFile(`Ошибки_импорта_гостей_${importFileNamePart()}.xlsx`);
    } catch (error) {
      console.error(error);
      setGuestImportError("Не удалось сформировать файл с ошибками импорта.");
    }
  };

  const importGuestsFromExcel = async (file: File) => {
    if (!eventId || importingGuests) return;
    setGuestImportFileName(file.name);
    setGuestImportError("");
    setGuestImportResult(null);
    if (!file.name.toLocaleLowerCase("ru-RU").endsWith(".xlsx")) {
      setGuestImportError("Нужен файл формата .xlsx, созданный на основе шаблона импорта.");
      return;
    }

    setImportingGuests(true);
    try {
      const { default: readXlsxFile } = await import("read-excel-file");
      const rows = await readXlsxFile(file);
      if (rows.length === 0) {
        setGuestImportError("Файл пуст. Используйте скачанный шаблон импорта.");
        return;
      }
      const actualHeaders = rows[0].map(excelCellText);
      const headerMatches = actualHeaders.length === guestImportHeaders.length
        && guestImportHeaders.every((header, index) => actualHeaders[index] === header);
      if (!headerMatches) {
        setGuestImportError(`Структура файла не соответствует шаблону. Ожидались колонки: ${guestImportHeaders.join(", ")}. Получены: ${actualHeaders.filter(Boolean).join(", ") || "нет колонок"}.`);
        return;
      }

      const dataRows = rows.slice(1)
        .map((row, index) => ({ rowNumber: index + 2, values: guestImportHeaders.map((_, column) => excelCellText(row[column])) }))
        .filter((row) => row.values.some(Boolean));
      if (dataRows.length === 0) {
        setGuestImportError("В файле нет строк с гостями.");
        return;
      }

      const groupsByValue = new Map<string, Array<{ id: number; name: string; path: string }>>();
      for (const group of importGroupOptions) {
        for (const value of new Set([group.path, group.name])) {
          const key = normalizeSearch(value);
          groupsByValue.set(key, [...(groupsByValue.get(key) ?? []), group]);
        }
      }
      const categoriesByName = new Map(categories.map((category) => [normalizeSearch(category.name), category]));
      const tagsByName = new Map(tags.map((tag) => [normalizeSearch(tag.name), tag]));
      const issues: GuestImportIssue[] = [];
      const seenRows = new Set<string>();
      let importedCount = 0;

      for (const row of dataRows) {
        const [name, email, phone, groupValue, categoryValue, tagsValue] = row.values;
        const rowErrors: string[] = [];
        if (!name) rowErrors.push("не заполнено поле «Имя»");
        else if (name.length > 255) rowErrors.push("имя длиннее 255 символов");
        if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255)) rowErrors.push("некорректный email");
        if (phone.length > 20) rowErrors.push("телефон длиннее 20 символов");

        const groupCandidates = groupsByValue.get(normalizeSearch(groupValue)) ?? [];
        const uniqueGroupCandidates = [...new Map(groupCandidates.map((group) => [group.id, group])).values()];
        if (!groupValue) rowErrors.push("не заполнено поле «Группа»");
        else if (uniqueGroupCandidates.length === 0) rowErrors.push(`группа «${groupValue}» не найдена или недоступна`);
        else if (uniqueGroupCandidates.length > 1) rowErrors.push(`название группы «${groupValue}» неоднозначно — укажите полный путь из листа «Справочники»`);

        const category = categoriesByName.get(normalizeSearch(categoryValue));
        if (!categoryValue) rowErrors.push("не заполнено поле «Категория»");
        else if (!category) rowErrors.push(`категория «${categoryValue}» не найдена`);

        const tagNames = tagsValue ? tagsValue.split(/[;,]/).map((value) => value.trim()).filter(Boolean) : [];
        if (tagNames.length > 4) rowErrors.push("указано больше четырёх меток");
        const unknownTags = tagNames.filter((tagName) => !tagsByName.has(normalizeSearch(tagName)));
        if (unknownTags.length > 0) rowErrors.push(`не найдены метки: ${unknownTags.join(", ")}`);

        const signature = row.values.map(normalizeSearch).join("|");
        if (seenRows.has(signature)) rowErrors.push("строка полностью дублирует предыдущую строку файла");
        seenRows.add(signature);

        if (rowErrors.length > 0 || !category || uniqueGroupCandidates.length !== 1) {
          issues.push({ ...row, reason: rowErrors.join("; ") });
          continue;
        }

        try {
          await apiClient.createGuest(eventId, {
            name,
            email: email || undefined,
            phone: phone || undefined,
            groupId: uniqueGroupCandidates[0].id,
            categoryId: category.id,
            tagIds: [...new Set(tagNames.map((tagName) => tagsByName.get(normalizeSearch(tagName))!.id))],
          });
          importedCount += 1;
        } catch (error) {
          issues.push({ ...row, reason: guestImportErrorReason(error) });
        }
      }

      setGuestImportResult({ importedCount, failedCount: issues.length, issues });
      if (importedCount > 0) await loadData();
    } catch (error) {
      console.error(error);
      setGuestImportError("Не удалось прочитать Excel-файл. Проверьте, что файл не повреждён и создан в формате .xlsx.");
    } finally {
      setImportingGuests(false);
    }
  };

  useEffect(() => { loadData(); }, [eventId, currentPage, pageSize, debouncedGuestSearch, guestStatusFilters, guestCategoryFilters, guestTagFilters, guestGroupFilters, guestResponsibleFilters, hasCompanionsFilter, includeDeletedGuests, guestSortBy, guestSortDirection]);

  useEffect(() => {
    setSelectedGuestIds(new Set());
    setExcludedGuestIds(new Set());
    setSelectAllMatchingGuests(false);
    setBulkSummary(null);
    setBulkResult(null);
  }, [eventId, pageSize, debouncedGuestSearch, guestStatusFilters, guestCategoryFilters, guestTagFilters, guestGroupFilters, guestResponsibleFilters, hasCompanionsFilter, includeDeletedGuests]);

  useEffect(() => {
    if (pageSelectionCheckbox.current) {
      pageSelectionCheckbox.current.indeterminate = selectedOnPage > 0 && selectedOnPage < guests.length;
    }
  }, [selectedOnPage, guests.length]);

  useEffect(() => {
    if (!eventId || (!selectAllMatchingGuests && selectedGuestIds.size === 0)) {
      setBulkSummary(null);
      return;
    }
    const timeout = window.setTimeout(() => {
      void apiClient.getGuestBulkSummary(eventId, bulkSelection)
        .then(setBulkSummary)
        .catch((err) => { console.error(err); setError("Не удалось определить доступные массовые действия."); });
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [eventId, bulkSelection, selectAllMatchingGuests, selectedGuestIds.size]);

  useEffect(() => {
    if (!eventId) return;

    void Promise.all([
      apiClient.getCategories(eventId),
      apiClient.getTags(eventId),
      apiClient.getPlacements(eventId),
      apiClient.getGroupTree(eventId),
      apiClient.getUsers(eventId),
    ]).then(([categoryList, tagList, placementList, groupTree, userList]) => {
      setCategories(categoryList);
      setTags(tagList);
      setPlacements(placementList);
      setGroups(groupTree);
      setUsers(userList);
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
    const matchesStatus = guestStatusFilters.length === 0 || guestStatusFilters.includes(updatedGuest.status);
    const matchesCategory = guestCategoryFilters.length === 0 || (updatedGuest.categoryId != null && guestCategoryFilters.includes(String(updatedGuest.categoryId)));
    const matchesTag = guestTagFilters.length === 0 || updatedGuest.tags.some((tag) => guestTagFilters.includes(String(tag.id)));
    const matchesGroup = guestGroupFilters.length === 0 || guestGroupFilters.includes(String(updatedGuest.groupId));
    const matchesResponsible = guestResponsibleFilters.length === 0 || guestResponsibleFilters.includes(String(updatedGuest.createdByUserId));
    if (!matchesStatus || !matchesCategory || !matchesTag || !matchesGroup || !matchesResponsible) {
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

  const toggleDraftStatusFilter = (status: string) => {
    setDraftStatusFilters((current) => current.includes(status)
      ? current.filter((value) => value !== status)
      : [...current, status]);
  };

  const toggleDraftCategoryFilter = (categoryId: number) => {
    const value = String(categoryId);
    setDraftCategoryFilters((current) => current.includes(value)
      ? current.filter((id) => id !== value)
      : [...current, value]);
  };

  const toggleDraftGroupFilter = (groupId: number) => {
    const value = String(groupId);
    setDraftGroupFilters((current) => current.includes(value)
      ? current.filter((id) => id !== value)
      : [...current, value]);
  };

  const toggleDraftResponsibleFilter = (userId: number) => {
    const value = String(userId);
    setDraftResponsibleFilters((current) => current.includes(value)
      ? current.filter((id) => id !== value)
      : [...current, value]);
  };

  const openFiltersModal = () => {
    setDraftStatusFilters(guestStatusFilters);
    setDraftCategoryFilters(guestCategoryFilters);
    setDraftTagFilters([...guestTagFilters]);
    setDraftGroupFilters([...guestGroupFilters]);
    setDraftResponsibleFilters([...guestResponsibleFilters]);
    setDraftIncludeDeletedGuests(includeDeletedGuests);
    setDraftHasCompanionsFilter(hasCompanionsFilter);
    setIsFiltersModalOpen(true);
  };

  const applyFilters = () => {
    setGuestStatusFilters([...draftStatusFilters]);
    setGuestCategoryFilters([...draftCategoryFilters]);
    setGuestTagFilters([...draftTagFilters]);
    setGuestGroupFilters([...draftGroupFilters]);
    setGuestResponsibleFilters([...draftResponsibleFilters]);
    setIncludeDeletedGuests(draftIncludeDeletedGuests);
    setHasCompanionsFilter(draftHasCompanionsFilter);
    setCurrentPage(1);
    setIsFiltersModalOpen(false);
  };

  const resetFilters = () => {
    setDraftStatusFilters([]);
    setDraftCategoryFilters([]);
    setDraftTagFilters([]);
    setDraftGroupFilters([]);
    setDraftResponsibleFilters([]);
    setDraftIncludeDeletedGuests(false);
    setDraftHasCompanionsFilter(false);
    setGuestStatusFilters([]);
    setGuestCategoryFilters([]);
    setGuestTagFilters([]);
    setGuestGroupFilters([]);
    setGuestResponsibleFilters([]);
    setIncludeDeletedGuests(false);
    setHasCompanionsFilter(false);
    setCurrentPage(1);
    setIsFiltersModalOpen(false);
  };

  const changeGuestSort = (field: GuestSortField) => {
    setCurrentPage(1);
    if (guestSortBy !== field) {
      setGuestSortBy(field);
      setGuestSortDirection("asc");
      return;
    }
    if (guestSortDirection === "asc") {
      setGuestSortDirection("desc");
      return;
    }
    setGuestSortBy(null);
    setGuestSortDirection("asc");
  };

  const sortableGuestHeader = (field: GuestSortField, label: string, className = "") => {
    const active = guestSortBy === field;
    const ariaSort: "none" | "ascending" | "descending" = active
      ? guestSortDirection === "asc" ? "ascending" : "descending"
      : "none";
    const directionText = active ? guestSortDirection === "asc" ? "по возрастанию" : "по убыванию" : "без сортировки";
    return <th className={className || undefined} aria-sort={ariaSort}><button className={`guest-sort-button${active ? " active" : ""}`} type="button" onClick={() => changeGuestSort(field)} title={`${label}: ${directionText}`}><span>{label}</span><span className="guest-sort-icon" aria-hidden="true">{active ? guestSortDirection === "asc" ? "↑" : "↓" : "↕"}</span></button></th>;
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
      setGuestPlacementSeatNumber(null);
      setGuestPlacementTreeCollapsed(new Set(placements.map((placement) => placement.id)));
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
      setGuestFormTab("guest");
      setCompanionAddCount(1);
      setCompanionDrafts([]);
      setSavedCompanionDrafts([]);
      setGuestPlacementSeatNumber(guest.placementSeatNumber ?? null);
      setGuestPlacementTreeCollapsed(new Set(placements.map((placement) => placement.id)));
      setFormData({
        placementId: String(guest.placementId ?? ""),
        name: guest.name,
        email: guest.email ?? "",
        phone: guest.phone ?? "",
        groupId: String(guest.groupId),
        categoryId: guest.categoryId ? String(guest.categoryId) : "",
        tagIds: guest.tags.map((tag) => String(tag.id)),
      });
      if (!guest.parentGuestId && !guest.isDeleted) {
        const companions = await apiClient.getGuestCompanions(eventId, guest.id);
        const drafts = companions.map((companion) => ({
          id: companion.id,
          name: companion.name,
          groupId: String(companion.groupId),
          categoryId: companion.categoryId ? String(companion.categoryId) : "",
        }));
        setCompanionDrafts(drafts);
        setSavedCompanionDrafts(drafts);
        setCompanionsByParent((current) => ({ ...current, [guest.id]: companions }));
      }
    } catch (err) {
      setError("Не удалось загрузить данные формы гостя.");
      console.error(err);
    }
  };

  const addCompanions = () => {
    const count = Math.max(1, Math.min(50, Math.floor(Number(companionAddCount) || 1)));
    setCompanionDrafts((current) => {
      const next = [...current];
      for (let index = 0; index < count; index++) {
        const number = next.length + 1;
        next.push({
          name: "Сопровождающий " + number,
          groupId: formData.groupId,
          categoryId: formData.categoryId,
        });
      }
      return next;
    });
  };

  const updateCompanionDraft = (index: number, patch: Partial<CompanionDraft>) => {
    setCompanionDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  const removeCompanionDraft = (index: number) => {
    setCompanionDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const toggleCompanions = async (parent: GuestDto) => {
    if (expandedCompanionParents.has(parent.id)) {
      setExpandedCompanionParents((current) => {
        const next = new Set(current);
        next.delete(parent.id);
        return next;
      });
      return;
    }
    try {
      const companions = companionsByParent[parent.id] ?? await apiClient.getGuestCompanions(eventId, parent.id);
      setCompanionsByParent((current) => ({ ...current, [parent.id]: companions }));
      setExpandedCompanionParents((current) => new Set(current).add(parent.id));
    } catch {
      setError("Не удалось загрузить сопровождающих гостя.");
    }
  };

  const selectGuestPlacementSeat = (placementId: number, seatNumber: number) => {
    setFormData((current) => ({ ...current, placementId: String(placementId) }));
    setGuestPlacementSeatNumber(seatNumber);
    setGuestPlacementMenuOpensUp(false);
    guestPlacementMenuRef.current?.removeAttribute("open");
  };

  const clearGuestPlacement = () => {
    setFormData((current) => ({ ...current, placementId: "" }));
    setGuestPlacementSeatNumber(null);
    setGuestPlacementMenuOpensUp(false);
    guestPlacementMenuRef.current?.removeAttribute("open");
  };

  const updateGuestPlacementMenuDirection = (menu: HTMLDetailsElement) => {
    if (!menu.open) {
      setGuestPlacementMenuOpensUp(false);
      return;
    }
    window.requestAnimationFrame(() => {
      const dropdown = menu.querySelector<HTMLElement>(".seat-reassignment-dropdown");
      if (!dropdown) return;
      const menuRect = menu.getBoundingClientRect();
      const dropdownHeight = Math.min(dropdown.scrollHeight, 310);
      const spaceBelow = window.innerHeight - menuRect.bottom - 10;
      const spaceAbove = menuRect.top - 10;
      setGuestPlacementMenuOpensUp(dropdownHeight > spaceBelow && spaceAbove > spaceBelow);
    });
  };

  const renderGuestPlacementTree = (placement: Placement, level = 0): React.ReactNode => {
    const children = guestPlacementTree.childrenByParent.get(placement.id) ?? [];
    const availableSeats = guestPlacementTree.availableSeatsByPlacement.get(placement.id) ?? [];
    const expanded = !guestPlacementTreeCollapsed.has(placement.id);
    const selectedPlacement = Number(formData.placementId) === placement.id;
    const objectType = placement.displayChildrenAsRows ? "Контейнер" : placement.isRow ? "Ряд" : placement.isLabel ? "Надпись" : "Стол";
    return <div className="placement-object-list-branch" key={placement.id}>
      <div className="placement-object-list-row placement-object-list-tree-row" style={{ "--placement-list-depth": level } as React.CSSProperties}>
        <button type="button" className={`placement-object-list-toggle${expanded ? " expanded" : ""}`} aria-expanded={expanded} aria-label={`${expanded ? "Свернуть" : "Развернуть"} ${placement.name}`} title={expanded ? "Свернуть" : "Развернуть"} disabled={saving || !canChangeGuestPlacement} onClick={() => setGuestPlacementTreeCollapsed((current) => {
          const next = new Set(current);
          if (next.has(placement.id)) next.delete(placement.id); else next.add(placement.id);
          return next;
        })}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5" /></svg></button>
        <button type="button" className={`placement-object-list-item${selectedPlacement ? " selected" : ""}`} disabled={saving || !canChangeGuestPlacement} onClick={() => setGuestPlacementTreeCollapsed((current) => {
          const next = new Set(current);
          if (next.has(placement.id)) next.delete(placement.id); else next.add(placement.id);
          return next;
        })}><span>{placement.name}</span><small>{objectType}{availableSeats.length > 0 ? ` · свободно ${availableSeats.length}` : ""}</small></button>
      </div>
      {expanded && <div className="placement-object-list-children">
        {children.map((child) => renderGuestPlacementTree(child, level + 1))}
        {availableSeats.map((seatNumber) => {
          const selected = selectedPlacement && guestPlacementSeatNumber === seatNumber;
          const current = editingGuest?.placementId === placement.id && editingGuest.placementSeatNumber === seatNumber;
          return <div className="placement-object-list-row placement-object-list-tree-row seat-reassignment-tree-seat-row" style={{ "--placement-list-depth": level + 1 } as React.CSSProperties} key={`${placement.id}:${seatNumber}`}>
            <span className="placement-object-list-toggle-spacer" />
            <button type="button" className={`placement-object-list-item seat-reassignment-tree-seat${selected ? " selected" : ""}`} disabled={saving || !canChangeGuestPlacement} aria-pressed={selected} onClick={() => selectGuestPlacementSeat(placement.id, seatNumber)}><span>{seatLabel(placement, seatNumber)}</span><small>{current ? "Текущее место" : "Свободное место"}</small></button>
          </div>;
        })}
      </div>}
    </div>;
  };

  const closeForm = () => {
    if (saving || creatingTagRef.current) return;
    setIsCreateModalOpen(false);
    setEditingGuest(null);
    setFormData(emptyForm());
    setGuestFormTab("guest");
    setCompanionDrafts([]);
    setSavedCompanionDrafts([]);
    setCompanionAddCount(1);
    setGuestPlacementSeatNumber(null);
    setGuestPlacementTreeCollapsed(new Set());
    setGuestPlacementMenuOpensUp(false);
    setSimilarGuests([]);
    setSimilarGuestsError("");
    setSimilarGuestsLoading(false);
    setOrganizationTreeSearch("");
    setSelectedOrganizationEmployeeId(null);
    setSelectedOrganizationEmployeePosition("");
    setError("");
  };

  const openTicketMenu = async (guest: GuestDto) => {
    if (!canDownloadGuestTicket(guest)) return;
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
    if (saving || creatingTagRef.current || editingGuest?.isDeleted) return;
    if (!formData.categoryId) {
      setError("Выберите категорию гостя.");
      return;
    }
    if (formData.tagIds.length > 4) {
      setError("Гостю можно назначить не более 4 меток.");
      return;
    }
    if (editingGuest && !isGuestEditDirty && !companionDraftsDirty) return;
    if (companionDrafts.some((companion) => !companion.name.trim() || !companion.groupId || !companion.categoryId)) {
      setError("Заполните ФИО, группу и категорию каждого сопровождающего.");
      setGuestFormTab("companions");
      return;
    }
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
      placementSeatNumber: guestPlacementSeatNumber ?? undefined,
    };
    try {
      const isCreatingGuest = !editingGuest;
      if (editingGuest) {
        if (isGuestEditDirty) await apiClient.updateGuest(eventId, editingGuest.id, request);
        if (!editingGuest.parentGuestId && companionDraftsDirty) {
          const companions: CompanionInput[] = companionDrafts.map((companion) => ({
            id: companion.id,
            name: companion.name.trim(),
            groupId: Number(companion.groupId),
            categoryId: Number(companion.categoryId),
          }));
          const savedCompanions = await apiClient.saveGuestCompanions(eventId, editingGuest.id, companions);
          setCompanionsByParent((current) => ({ ...current, [editingGuest.id]: savedCompanions }));
        }
      } else {
        await apiClient.createGuest(eventId, request);
      }
      setIsCreateModalOpen(false);
      setEditingGuest(null);
      setFormData(emptyForm());
      setGuestFormTab("guest");
      setCompanionDrafts([]);
      setSavedCompanionDrafts([]);
      setGuestPlacementSeatNumber(null);
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

  const restoreDeletedGuest = async (guestId: number) => {
    setSaving(true);
    setError("");
    try {
      await apiClient.restoreDeletedGuest(eventId, guestId);
      await loadData();
    } catch (err) {
      setError("Не удалось восстановить гостя.");
      console.error(err);
    } finally { setSaving(false); }
  };

  const toggleGuestSelection = (guestId: number) => {
    setBulkResult(null);
    if (selectAllMatchingGuests) {
      setExcludedGuestIds((current) => {
        const next = new Set(current);
        if (next.has(guestId)) next.delete(guestId); else next.add(guestId);
        return next;
      });
      return;
    }
    setSelectedGuestIds((current) => {
      const next = new Set(current);
      if (next.has(guestId)) next.delete(guestId); else next.add(guestId);
      return next;
    });
  };

  const toggleCurrentPageSelection = () => {
    setBulkResult(null);
    const selectPage = selectedOnPage < guests.length;
    if (selectAllMatchingGuests) {
      setExcludedGuestIds((current) => {
        const next = new Set(current);
        guests.forEach((guest) => selectPage ? next.delete(guest.id) : next.add(guest.id));
        return next;
      });
    } else {
      setSelectedGuestIds((current) => {
        const next = new Set(current);
        guests.forEach((guest) => selectPage ? next.add(guest.id) : next.delete(guest.id));
        return next;
      });
    }
  };

  const selectAllMatching = () => {
    setSelectAllMatchingGuests(true);
    setSelectedGuestIds(new Set());
    setExcludedGuestIds(new Set());
    setBulkResult(null);
  };

  const clearGuestSelection = () => {
    setSelectAllMatchingGuests(false);
    setSelectedGuestIds(new Set());
    setExcludedGuestIds(new Set());
    setBulkSummary(null);
  };

  const executeBulkAction = async (action: string) => {
    setBulkLoading(true);
    setBulkResult(null);
    setError("");
    try {
      const result = await apiClient.executeGuestBulkAction(eventId, action, bulkSelection);
      setBulkActionToConfirm(null);
      setBulkResult(result);
      clearGuestSelection();
      await loadData();
    } catch (err) {
      setError("Не удалось выполнить массовую операцию.");
      console.error(err);
    } finally {
      setBulkLoading(false);
      setBulkActionToConfirm(null);
    }
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
    <div className="section-heading guests-heading canvas-section-heading"><div className="section-title-row"><h2>Гости</h2><span className="badge">Всего: {totalGuestCount}</span></div><div className="section-actions">{canCreate && <button className="primary-button create-action-button guest-create-button" onClick={openCreateModal}>Добавить гостя</button>}</div></div>
    {error && !isCreateModalOpen && !editingGuest && !deleteGuest && <div className="alert alert-error">{error}</div>}
    {isArchived && <div className="alert alert-info">Мероприятие завершено. Просмотр и поиск доступны, изменения — только после возврата в активные.</div>}
    <section className="panel guests-table-panel">
      <div className="guest-search-row">
        <label className="field guest-search-field">
          <input
            value={guestSearch}
            onChange={(event) => setGuestSearch(event.target.value)}
            placeholder="Поиск"
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
        {activeFiltersCount > 0 && <div className="active-guest-filters" aria-label="Выбранные фильтры">
          {activeStatusFilters.length > 0 && <div className="active-guest-filter-group"><strong>Статусы:</strong>{activeStatusFilters.map((option) => <RemovableFilterValue compact key={option.value} label={`статус «${option.label}»`} onRemove={() => { setGuestStatusFilters((current) => current.filter((value) => value !== option.value)); setCurrentPage(1); }}><span className={`status ${option.value}`} title={option.label}><span className="filter-cloud-text">{option.label}</span></span></RemovableFilterValue>)}</div>}
          {activeCategoryFilters.length > 0 && <div className="active-guest-filter-group"><strong>Категории:</strong>{activeCategoryFilters.map((category) => <RemovableFilterValue compact key={category.id} label={`категорию «${category.name}»`} onRemove={() => { setGuestCategoryFilters((current) => current.filter((value) => value !== String(category.id))); setCurrentPage(1); }}><span className="filter-value-cloud category-filter-chip" title={category.name}><span className="category-dot" style={{ backgroundColor: category.color }} aria-hidden="true" /><span className="filter-cloud-text">{category.name}</span></span></RemovableFilterValue>)}</div>}
          {activeTagFilters.length > 0 && <div className="active-guest-filter-group"><strong>Метки:</strong>{activeTagFilters.map((tag) => <RemovableFilterValue compact key={tag.id} label={`метку «${tag.name}»`} onRemove={() => { setGuestTagFilters((current) => current.filter((value) => value !== String(tag.id))); setCurrentPage(1); }}><span className="tag-badge" title={tag.name}><span className="filter-cloud-text">{tag.name}</span></span></RemovableFilterValue>)}</div>}
          {activeGroupFilters.length > 0 && <div className="active-guest-filter-group"><strong>Группы:</strong>{activeGroupFilters.map((group) => <RemovableFilterValue compact key={group.id} label={`группу «${group.name}»`} onRemove={() => { setGuestGroupFilters((current) => current.filter((value) => value !== String(group.id))); setCurrentPage(1); }}><span className="filter-value-cloud group-filter-cloud" title={group.name}><span className="filter-cloud-text">{group.name}</span></span></RemovableFilterValue>)}</div>}
          {activeResponsibleFilters.length > 0 && <div className="active-guest-filter-group"><strong>Ответственные:</strong>{activeResponsibleFilters.map((user) => { const name = userFullName(user) || user.login; return <RemovableFilterValue compact key={user.id} label={`ответственного «${name}»`} onRemove={() => { setGuestResponsibleFilters((current) => current.filter((value) => value !== String(user.id))); setCurrentPage(1); }}><span className="filter-value-cloud" title={name}><span className="filter-cloud-text">{name}</span></span></RemovableFilterValue>; })}</div>}
          {hasCompanionsFilter && <div className="active-guest-filter-group"><strong>Сопровождающие:</strong><RemovableFilterValue compact label="гостей с сопровождающими" onRemove={() => { setHasCompanionsFilter(false); setCurrentPage(1); }}><span className="filter-value-cloud"><span className="filter-cloud-text">Есть</span></span></RemovableFilterValue></div>}
          {includeDeletedGuests && <div className="active-guest-filter-group"><strong>Удалённые:</strong><RemovableFilterValue compact label="удалённых гостей" onRemove={() => { setIncludeDeletedGuests(false); setCurrentPage(1); }}><span className="filter-value-cloud"><span className="filter-cloud-text">Показывать</span></span></RemovableFilterValue></div>}
        </div>}
        {(isGuestSearchActive || activeFiltersCount > 0) && (
          <span className="guest-search-count">Найдено: {totalGuestCount}</span>
        )}
        <div className="guest-table-tools" aria-label="Операции с Excel">
          <button className="guest-tool-button" type="button" title="Выгрузить в Excel" aria-label="Выгрузить в Excel" disabled={loading || totalGuestCount === 0} onClick={() => { setGuestExportError(""); setIsExportModalOpen(true); }}><ExportExcelIcon /></button>
          {canCreate && <button className="guest-tool-button" type="button" title="Импортировать из Excel" aria-label="Импортировать из Excel" disabled={loading} onClick={() => { setGuestImportError(""); setGuestImportResult(null); setGuestImportFileName(""); setIsImportModalOpen(true); }}><ImportExcelIcon /></button>}
        </div>
      </div>
      {bulkResult && <div className={`alert ${bulkResult.skippedCount > 0 ? "alert-info" : "alert-success"}`}>
        Изменено: {bulkResult.changedCount}. Пропущено: {bulkResult.skippedCount}.
        {bulkResult.reasons.length > 0 && <span className="bulk-result-reasons">{bulkResult.reasons.map((reason) => `${reason.reason}: ${reason.count}`).join("; ")}</span>}
      </div>}
      {loading ? <div className="empty-state compact">Загрузка...</div> : totalGuestCount === 0 && !debouncedGuestSearch && activeFiltersCount === 0 ? <div className="empty-state compact">Гостей пока нет.</div> : totalGuestCount === 0 ? <div className="empty-state compact">По фильтрам ничего не найдено.</div> : <>
        <div className="table-wrap guests-table-wrap"><table><thead><tr>
          <th className="guest-selection-column"><input ref={pageSelectionCheckbox} type="checkbox" checked={guests.length > 0 && selectedOnPage === guests.length} onChange={toggleCurrentPageSelection} aria-label="Выбрать гостей на текущей странице" /></th>
          {sortableGuestHeader("name", "Имя")}<th>Email</th>{sortableGuestHeader("category", "Категория")}<th>Метки</th>{sortableGuestHeader("status", "Статус")}{sortableGuestHeader("group", "Группа")}{sortableGuestHeader("placement", "Место")}{sortableGuestHeader("createdBy", "Кто добавил", "guest-created-by-column")}<th className="actions-column guest-actions-header" aria-label="Действия">
            {selectedGuestCount > 0 && <details className="guest-bulk-menu">
              <summary title={`Массовые операции для ${selectedGuestCount} выбранных гостей`} aria-label={`Массовые операции для ${selectedGuestCount} выбранных гостей`}>
                <BulkActionsIcon /><strong>{selectedGuestCount}</strong>
              </summary>
              <div className="guest-bulk-menu-dropdown" role="menu">
                {bulkLoading ? <span className="guest-bulk-menu-hint">Подготавливаем операции...</span> : <>
                  {!selectAllMatchingGuests && selectedOnPage === guests.length && guests.length > 0 && totalGuestCount > selectedGuestIds.size && <button type="button" className="guest-bulk-menu-select-all" onClick={(event) => { selectAllMatching(); (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); }}>Выбрать всех по текущему поиску и фильтрам ({totalGuestCount})</button>}
                  {selectAllMatchingGuests && <span className="guest-bulk-menu-hint">Выбраны все по текущему поиску и фильтрам.</span>}
                  {bulkActions.length > 0 ? bulkActions.map((action) => <button
                    key={action.action}
                    type="button"
                    className={action.action === "delete" ? "guest-bulk-menu-action danger" : "guest-bulk-menu-action"}
                    onClick={(event) => { setBulkActionToConfirm(action); (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); }}
                  ><span>{action.label}</span><small>{action.eligibleCount} из {bulkSummary?.selectedCount ?? selectedGuestCount}</small></button>) : <span className="guest-bulk-menu-hint">Нет доступных операций для выбранных гостей.</span>}
                </>}
              </div>
            </details>}
          </th>
        </tr></thead><tbody>{visibleGuests.map(({ guest, isCompanion }) => {
          const showApprove = !guest.isDeleted && canApproveGuest(guest);
          const showReject = !guest.isDeleted && canRejectGuest(guest);
          const showSubmit = !guest.isDeleted && canSubmitGuest(guest);
          const showInvite = !guest.isDeleted && canInviteGuest(guest);
          const showReturn = !guest.isDeleted && canReturnGuest(guest);
          const nextAction = showReturn ? () => restoreGuestToSaved(guest.id) : showInvite ? () => inviteGuest(guest.id) : showSubmit ? () => submitGuestForReview(guest.id) : showApprove ? () => updateGuestStatus(guest.id, true) : null;
          const nextActionLabel = showReturn ? "Восстановить в Сохранён" : showInvite ? "Пригласить" : showSubmit ? "Отправить на согласование" : "Согласовать";
          const canEdit = canManageGuest(guest);
          const guestPlacement = guest.placementId ? placements.find((placement) => placement.id === guest.placementId) : null;
          const guestPlace = guestPlacement ? { placement: guestPlacement.name, seat: guest.placementSeatNumber ? `Место ${seatLabel(guestPlacement, guest.placementSeatNumber)}` : null } : null;
          return <tr className={`table-hover-row${canEdit ? " table-editable-row" : ""}${guest.isDeleted ? " guest-row-deleted" : ""}${isCompanion ? " guest-companion-row" : ""}`} key={guest.id} tabIndex={canEdit ? 0 : undefined} onClick={canEdit ? (event) => { if (!(event.target as HTMLElement).closest("button, a, input, select, textarea")) openEditModal(guest); } : undefined} onKeyDown={canEdit ? (event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); void openEditModal(guest); } } : undefined}>
            <td className="guest-selection-column"><input type="checkbox" checked={isGuestSelected(guest.id)} onChange={() => toggleGuestSelection(guest.id)} onClick={(event) => event.stopPropagation()} aria-label={`Выбрать гостя ${guest.name}`} /></td>
            <td><span className="guest-name-cell">{!isCompanion && guest.companionCount > 0 && <button type="button" className="icon-button guest-companions-toggle" title={expandedCompanionParents.has(guest.id) ? "Свернуть сопровождающих" : "Показать сопровождающих"} aria-label={expandedCompanionParents.has(guest.id) ? "Свернуть сопровождающих" : "Показать сопровождающих"} onClick={(event) => { event.stopPropagation(); void toggleCompanions(guest); }}><CompanionsIcon /></button>}{guest.name}{guest.isDeleted && <small>Удалён</small>}</span></td><td>{guest.email || "-"}</td>
            <td>{guest.categoryName ? <span className="category-arrow"><span className="category-dot" style={{ backgroundColor: guest.categoryColor ?? "#2f6f87" }} aria-hidden="true" />{guest.categoryName}</span> : "-"}</td>
            <td>{guest.tags.length > 0 ? <div className="guest-tags-cell">{guest.tags.map((tag) => <span className="tag-badge" key={tag.id}>{tag.name}</span>)}</div> : "-"}</td>
            <td>{guest.isDeleted ? <span className="status deleted">Удалён</span> : <div className="guest-status-actions">{nextAction ? <button className={`status status-action-button ${guest.status}`} type="button" onClick={nextAction} title={nextActionLabel}><StatusWidthSizer /><span className="status-current">{statusLabel[guest.status] ?? guest.status}</span><span className="status-next">{nextActionLabel}</span></button> : <span className={`status ${guest.status}`}><StatusWidthSizer /><span className="status-current">{statusLabel[guest.status] ?? guest.status}</span></span>}{showReject && <button className="icon-button icon-button-warning guest-reject-button" onClick={() => updateGuestStatus(guest.id, false)} title="Отклонить"><RejectIcon /></button>}</div>}</td>
            <td>{guest.groupName || guest.groupId}</td><td>{guestPlace ? <span className="guest-table-detail"><span>{guestPlace.placement}</span>{guestPlace.seat && <small>{guestPlace.seat}</small>}</span> : "—"}</td>
            <td className="guest-created-by-column">{guest.createdByName ? <span className="guest-created-by-name" title={guest.createdByName}>{guest.createdByName}</span> : "—"}</td>
            <td className="actions-column">{canManageGuest(guest) ? <div className="table-icon-actions">{guest.isDeleted ? <button className="secondary-button guest-restore-button" type="button" disabled={saving} onClick={() => void restoreDeletedGuest(guest.id)}>Восстановить</button> : <>{canDownloadGuestTicket(guest) && <button className="icon-button" onClick={() => void openTicketMenu(guest)} title="Скачать билет"><TicketIcon /></button>}<button className="icon-button" onClick={() => setQrGuest(guest)} title="Открыть QR-код"><QrIcon /></button><button className="icon-button" onClick={() => openEditModal(guest)} title="Редактировать"><EditIcon /></button><button className="icon-button icon-button-danger" onClick={() => setDeleteGuest(guest)} title="Удалить"><DeleteIcon /></button></>}</div> : "-"}</td>
          </tr>;
        })}</tbody></table></div>
        <div className="pagination-row"><div className="pagination-summary">Показаны {pageStart}-{pageEnd} из {totalGuestCount}</div><label className="pagination-size"><span>На странице</span><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setCurrentPage(1); }} disabled={loading}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label><div className="pagination-actions"><button className="secondary-button pagination-button" type="button" onClick={() => setCurrentPage((value) => Math.max(1, value - 1))} disabled={loading || !canGoPreviousPage}>Назад</button><span className="pagination-current">Страница {currentPage} из {totalPages}</span><button className="secondary-button pagination-button" type="button" onClick={() => setCurrentPage((value) => Math.min(totalPages, value + 1))} disabled={loading || !canGoNextPage}>Вперёд</button></div></div>
      </>}
    </section>

    {isFiltersModalOpen && <Modal className="filters-modal guest-filters-modal" title="Фильтры гостей" onClose={() => setIsFiltersModalOpen(false)}>
      <div className="filters-form">
        <section className="filter-section">
          <div className="selected-filter-row">
            <span>Статусы</span>
            {selectedFilterStatuses.length === 0 ? <span className="selected-category-empty">Все статусы</span> : selectedFilterStatuses.map((option) => <RemovableFilterValue key={option.value} label={`статус «${option.label}»`} onRemove={() => toggleDraftStatusFilter(option.value)}><span className={`status ${option.value}`}>{option.label}</span></RemovableFilterValue>)}
          </div>
          <details className="filter-checklist">
            <summary>Выбрать статусы <span>{draftStatusFilters.length ? `Выбрано: ${draftStatusFilters.length}` : "Все"}</span></summary>
            <div className="filter-checklist-menu" role="group" aria-label="Статусы гостей">
              {guestStatusFilterOptions.filter((option) => option.value).map((option) => <label key={option.value}><input type="checkbox" checked={draftStatusFilters.includes(option.value)} onChange={() => toggleDraftStatusFilter(option.value)} /><span className={`status ${option.value}`}>{option.label}</span></label>)}
            </div>
          </details>
        </section>

        <section className="filter-section">
          <div className="selected-filter-row">
            <span>Категории</span>
            {selectedFilterCategories.length === 0 ? <span className="selected-category-empty">Все категории</span> : selectedFilterCategories.map((category) => <RemovableFilterValue key={category.id} label={`категорию «${category.name}»`} onRemove={() => toggleDraftCategoryFilter(category.id)}><span className="filter-value-cloud category-filter-chip"><span className="category-dot" style={{ backgroundColor: category.color }} aria-hidden="true" />{category.name}</span></RemovableFilterValue>)}
          </div>
          <details className="filter-checklist">
            <summary>Выбрать категории <span>{draftCategoryFilters.length ? `Выбрано: ${draftCategoryFilters.length}` : "Все"}</span></summary>
            <div className="filter-checklist-menu" role="group" aria-label="Категории гостей">
              {categories.length === 0 ? <span className="tag-filter-empty">Категорий пока нет.</span> : categories.map((category) => <label key={category.id}><input type="checkbox" checked={draftCategoryFilters.includes(String(category.id))} onChange={() => toggleDraftCategoryFilter(category.id)} /><span className="category-arrow"><span className="category-dot" style={{ backgroundColor: category.color }} aria-hidden="true" />{category.name}</span></label>)}
            </div>
          </details>
        </section>

        <section className="filter-section">
          <div className="selected-filter-row selected-tags-row">
            <span>Метки</span>
            {selectedFilterTags.length === 0 ? <span className="selected-category-empty">Все метки</span> : selectedFilterTags.map((tag) => <RemovableFilterValue key={tag.id} label={`метку «${tag.name}»`} onRemove={() => toggleDraftTagFilter(tag.id)}><span className="tag-badge">{tag.name}</span></RemovableFilterValue>)}
          </div>
          <details className="filter-checklist">
            <summary>Выбрать метки <span>{draftTagFilters.length ? `Выбрано: ${draftTagFilters.length}` : "Все"}</span></summary>
            <div className="filter-checklist-menu" role="group" aria-label="Метки гостей">
              {tags.length === 0 ? <span className="tag-filter-empty">Меток пока нет.</span> : tags.map((tag) => <label key={tag.id}><input type="checkbox" checked={draftTagFilters.includes(String(tag.id))} onChange={() => toggleDraftTagFilter(tag.id)} /><span className="tag-badge">{tag.name}</span></label>)}
            </div>
          </details>
        </section>

        <section className="filter-section">
          <div className="selected-filter-row">
            <span>Группы</span>
            {selectedFilterGroups.length === 0 ? <span className="selected-category-empty">Все группы</span> : selectedFilterGroups.map((group) => <RemovableFilterValue key={group.id} label={`группу «${group.name}»`} onRemove={() => toggleDraftGroupFilter(group.id)}><span className="filter-value-cloud group-filter-cloud" title={group.name}><span>{group.name}</span></span></RemovableFilterValue>)}
          </div>
          <details className="filter-checklist">
            <summary>Выбрать группы <span>{draftGroupFilters.length ? `Выбрано: ${draftGroupFilters.length}` : "Все"}</span></summary>
            <div className="filter-checklist-menu" role="group" aria-label="Группы гостей">
              {flatGroups.length === 0 ? <span className="tag-filter-empty">Групп пока нет.</span> : flatGroups.map((group) => <label key={group.id}><input type="checkbox" checked={draftGroupFilters.includes(String(group.id))} onChange={() => toggleDraftGroupFilter(group.id)} /><span className="filter-option-text" style={{ paddingLeft: group.level * 12 }}>{group.name}</span></label>)}
            </div>
          </details>
        </section>

        <section className="filter-section">
          <div className="selected-filter-row">
            <span>Ответственные</span>
            {selectedFilterResponsibles.length === 0 ? <span className="selected-category-empty">Все ответственные</span> : selectedFilterResponsibles.map((user) => { const name = userFullName(user) || user.login; return <RemovableFilterValue key={user.id} label={`ответственного «${name}»`} onRemove={() => toggleDraftResponsibleFilter(user.id)}><span className="filter-value-cloud">{name}</span></RemovableFilterValue>; })}
          </div>
          <details className="filter-checklist">
            <summary>Выбрать ответственных <span>{draftResponsibleFilters.length ? `Выбрано: ${draftResponsibleFilters.length}` : "Все"}</span></summary>
            <div className="filter-checklist-menu" role="group" aria-label="Ответственные за гостей">
              {users.length === 0 ? <span className="tag-filter-empty">Ответственных пока нет.</span> : users.map((user) => { const name = userFullName(user) || user.login; return <label key={user.id}><input type="checkbox" checked={draftResponsibleFilters.includes(String(user.id))} onChange={() => toggleDraftResponsibleFilter(user.id)} /><span className="filter-option-person"><span>{name}</span>{user.roleName && <small>{user.roleName}</small>}</span></label>; })}
            </div>
          </details>
        </section>

        <section className="filter-section filter-section-toggle">
          <label className="filter-toggle-row"><input type="checkbox" checked={draftHasCompanionsFilter} onChange={(event) => setDraftHasCompanionsFilter(event.target.checked)} /><strong>Только с сопровождающими</strong></label>
        </section>
        <section className="filter-section filter-section-toggle">
          <label className="filter-toggle-row"><input type="checkbox" checked={draftIncludeDeletedGuests} onChange={(event) => setDraftIncludeDeletedGuests(event.target.checked)} /><strong>Показывать удалённых</strong></label>
        </section>

        <div className="modal-actions filters-modal-actions">
          <button className="secondary-button" type="button" onClick={() => setIsFiltersModalOpen(false)}>Отмена</button>
          <button className="secondary-button" type="button" onClick={resetFilters}>Сбросить</button>
          <button className="primary-button" type="button" onClick={applyFilters}>Применить</button>
        </div>
      </div>
    </Modal>}

    {isExportModalOpen && <Modal className="guest-export-modal" title="Выгрузка гостей в Excel" description={`Выберите поля. В файл попадут все гости по текущему поиску и фильтрам: ${totalGuestCount}.`} onClose={() => { if (!exportingGuests) setIsExportModalOpen(false); }}>
      {guestExportError && <div className="alert alert-error">{guestExportError}</div>}
      <div className="guest-export-selection-actions">
        <button type="button" className="secondary-button" disabled={exportingGuests || selectedExportFields.length === guestExportFieldOptions.length} onClick={() => setSelectedExportFields(defaultGuestExportFields)}>Выбрать все</button>
        <button type="button" className="secondary-button" disabled={exportingGuests || selectedExportFields.length === 0} onClick={() => setSelectedExportFields([])}>Снять все</button>
        <span>Выбрано: {selectedExportFields.length}</span>
      </div>
      <div className="guest-export-fields" role="group" aria-label="Поля для выгрузки">
        {guestExportFieldOptions.map((field) => <label key={field.key}><input type="checkbox" checked={selectedExportFields.includes(field.key)} disabled={exportingGuests} onChange={() => toggleExportField(field.key)} /><span>{field.label}</span></label>)}
      </div>
      {selectedExportFields.length === 0 && <div className="guest-export-hint">Выберите хотя бы одно поле.</div>}
      <div className="modal-actions"><button type="button" className="secondary-button" disabled={exportingGuests} onClick={() => setIsExportModalOpen(false)}>Отмена</button><button type="button" className="primary-button" disabled={exportingGuests || selectedExportFields.length === 0 || totalGuestCount === 0} onClick={() => void exportGuestsToExcel()}>{exportingGuests ? "Формируем файл..." : "Выгрузить"}</button></div>
    </Modal>}

    {isImportModalOpen && <Modal className="guest-import-modal" title="Импорт гостей из Excel" description="Скачайте шаблон, заполните его и выберите готовый файл. Обязательные колонки отмечены знаком *." onClose={() => { if (!importingGuests) setIsImportModalOpen(false); }}>
      {guestImportError && <div className="alert alert-error">{guestImportError}</div>}
      <section className="guest-import-step">
        <div><strong>1. Подготовьте файл</strong><small>На листе «Справочники» будут актуальные группы, категории и метки мероприятия.</small></div>
        <button type="button" className="secondary-button" disabled={downloadingImportTemplate || importingGuests} onClick={() => void downloadGuestImportTemplate()}>{downloadingImportTemplate ? "Формируем шаблон..." : "Скачать шаблон"}</button>
      </section>
      <section className="guest-import-step">
        <div><strong>2. Выберите заполненный файл</strong><small>Поддерживается формат .xlsx. Импорт начнётся после проверки структуры файла.</small></div>
        <input ref={guestImportFileInput} className="visually-hidden" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={importingGuests} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) void importGuestsFromExcel(file); }} />
        <button type="button" className="primary-button" disabled={importingGuests} onClick={() => guestImportFileInput.current?.click()}>{importingGuests ? "Импортируем строки..." : "Выбрать файл"}</button>
        {guestImportFileName && <span className="guest-import-file-name" title={guestImportFileName}>{guestImportFileName}</span>}
      </section>
      {guestImportResult && <section className={`guest-import-result${guestImportResult.failedCount > 0 ? " has-errors" : " success"}`} aria-live="polite">
        <h3>Импорт завершён</h3>
        <div className="guest-import-result-counts"><span>Загружено: <strong>{guestImportResult.importedCount}</strong></span><span>Не загружено: <strong>{guestImportResult.failedCount}</strong></span></div>
        {guestImportResult.issues.length > 0 && <><div className="guest-import-issues">{guestImportResult.issues.map((issue) => <div key={`${issue.rowNumber}-${issue.values.join("-")}`}><strong>Строка {issue.rowNumber}{issue.values[0] ? ` · ${issue.values[0]}` : ""}</strong><span>{issue.reason}</span></div>)}</div><button type="button" className="secondary-button" onClick={() => void downloadGuestImportErrors()}>Скачать ошибки в Excel</button></>}
      </section>}
      <div className="modal-actions"><button type="button" className="secondary-button" disabled={importingGuests} onClick={() => setIsImportModalOpen(false)}>Закрыть</button></div>
    </Modal>}

    {(isCreateModalOpen || editingGuest) && <Modal className={`guest-form-modal${isCreateModalOpen && !editingGuest ? " guest-create-form-modal" : ""}`} title={editingGuest?.isDeleted ? "Удалённый гость" : editingGuest ? "Редактировать гостя" : "Добавить гостя"} description={editingGuest?.isDeleted ? "Данные доступны только для просмотра. Восстановите гостя, чтобы снова редактировать его." : editingGuest?.parentGuestId ? "Сопровождающий для: " + (editingGuest.parentGuestName ?? "родительского гостя") : editingGuest ? undefined : "Гость будет сохранён в выбранной группе."} onClose={closeForm}>{error && <div className="alert alert-error">{error}</div>}<form className={`form guest-edit-form guest-edit-form-with-tags${isCreateModalOpen && !editingGuest ? " guest-create-form-modal" : ""}${editingGuest?.isDeleted ? " guest-form-readonly" : ""}${guestFormTab === "companions" ? " guest-companions-form" : ""}`} onSubmit={submitGuest}><fieldset className="guest-form-fieldset" disabled={saving || Boolean(editingGuest?.isDeleted)}>
      {editingGuest && !editingGuest.parentGuestId && !editingGuest.isDeleted && <div className="group-edit-tabs guest-form-tabs" role="tablist" aria-label="Разделы карточки гостя"><button type="button" role="tab" aria-selected={guestFormTab === "guest"} className={`group-edit-tab${guestFormTab === "guest" ? " active" : ""}`} onClick={() => setGuestFormTab("guest")}>Гость</button><button type="button" role="tab" aria-selected={guestFormTab === "companions"} className={`group-edit-tab${guestFormTab === "companions" ? " active" : ""}`} onClick={() => setGuestFormTab("companions")}>Сопровождающие ({companionDrafts.length})</button></div>}
      {guestFormTab === "guest" && <>
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
        {editingGuest && !editingGuest.isDeleted && <div className="guest-qr-inline guest-qr-mobile"><h3>QR-код гостя</h3><GuestQrCode guest={editingGuest} small />{canDownloadGuestTicket(editingGuest) && <button type="button" className="secondary-button guest-ticket-download-button" onClick={() => void openTicketMenu(editingGuest)}>Скачать билет</button>}</div>}
        {editingGuest && <div className="guest-workflow-section"><h3 className="workflow-title">Цепочка согласования</h3>{renderWorkflow(editingGuest)}</div>}
        {editingGuest && (
          <div className="guest-created-at">Создан: {formatDateTime(editingGuest.createdAt)}</div>
        )}
        {isCreateModalOpen && !editingGuest && selectedOrganizationEmployeePosition && (
          <div className="alert alert-info guest-person-source-message">
            Данные заполнены из оригинальной структуры. Должность: {selectedOrganizationEmployeePosition}. Email и телефон заполните вручную.
          </div>
        )}
        <label className="field"><span>Имя</span><input value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} disabled={saving} required /></label>
        <label className="field"><span>Email</span><input type="email" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} disabled={saving} /></label>
        <label className="field"><span>Телефон</span><input type="tel" value={formData.phone} onChange={(event) => setFormData({ ...formData, phone: event.target.value })} disabled={saving} /></label>
        <label className="field"><span>Группа</span><select value={formData.groupId} onChange={(event) => { setGuestPlacementSeatNumber(null); setFormData({ ...formData, groupId: event.target.value, placementId: "" }); }} disabled={saving} required>{flatGroups.filter((group) => scopeIds.has(group.id)).map((group) => <option key={group.id} value={group.id}>{"- ".repeat(group.level)}{group.name} · свободно {group.availableQuota}</option>)}</select></label>
        {!editingGuest && (
          <label className="field guest-category-field">
            <span>Размещение</span>
            <select className="guest-placement-select" value={formData.placementId} disabled={saving} onChange={(event) => setFormData({ ...formData, placementId: event.target.value })}>
              <option value="">Без размещения</option>
              {placements.filter((p) => p.quota !== null && p.groupId !== null && collectScopeIds(groups, p.groupId).has(Number(formData.groupId)))
                .map((p) => <option key={p.id} value={p.id} disabled={p.guestCount >= p.quota!}>{p.name} · {p.guestCount}/{p.quota}</option>)}
            </select>
          </label>
        )}
        <label className="field guest-category-field">
          <span>Категория *</span>
          <select className="guest-category-select" value={formData.categoryId} onChange={(event) => setFormData({ ...formData, categoryId: event.target.value })} disabled={saving} required>
            <option value="" disabled>Выберите категорию</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          {selectedCategory && <span className="category-arrow"><span className="category-dot" style={{ backgroundColor: selectedCategory.color }} aria-hidden="true" />{selectedCategory.name}</span>}
          {categories.length === 0 && <small>Сначала создайте категорию мероприятия.</small>}
        </label>
        {editingGuest && (
          <div className="field guest-placement-field">
            <span>Место</span>
            <div className={`seat-reassignment-picker guest-placement-picker${saving || !canChangeGuestPlacement ? " is-disabled" : ""}${guestPlacementMenuOpensUp ? " opens-up" : ""}`}><details ref={guestPlacementMenuRef} onToggle={(event) => updateGuestPlacementMenuDirection(event.currentTarget)} onKeyDown={(event) => { if (event.key === "Escape") { setGuestPlacementMenuOpensUp(false); guestPlacementMenuRef.current?.removeAttribute("open"); event.currentTarget.querySelector<HTMLElement>("summary")?.focus(); } }}>
              <summary className={formData.placementId ? "" : "placeholder"} aria-label={`Выбранное место: ${selectedGuestPlacementValue}`} onClick={(event) => { if (saving || !canChangeGuestPlacement) event.preventDefault(); }}><span>{selectedGuestPlacementValue}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5" /></svg></summary>
              <div className="seat-reassignment-dropdown">{guestPlacementTree.roots.length > 0 ? <div className="seat-reassignment-tree guest-placement-tree placement-object-list-items" aria-label="Доступные места"><div className="placement-object-list-row guest-placement-clear-row"><span className="placement-object-list-toggle-spacer" /><button type="button" className={`placement-object-list-item${!formData.placementId ? " selected" : ""}`} disabled={saving || !canChangeGuestPlacement} onClick={clearGuestPlacement}><span>Без размещения</span><small>Снять гостя с места</small></button></div>{guestPlacementTree.roots.map((placement) => renderGuestPlacementTree(placement))}</div> : <div className="seat-reassignment-empty">Для группы гостя нет доступных свободных мест.</div>}</div>
            </details></div>
            {!canChangeGuestPlacement && <small>Размещение доступно для согласованного или приглашённого гостя.</small>}
          </div>
        )}
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
      </div>

      <aside className="guest-tags-side-panel" aria-label="Метки гостя">
        <div className="guest-tags-side-section">
          <h3>Присвоенные метки ({formData.tagIds.length}/4)</h3>
          <div className="selected-tags-row guest-tags-selected-panel">
            {selectedTags.length === 0 ? (
              <span className="selected-category-empty">Без меток</span>
            ) : selectedTags.map((tag) => (
              <span className="tag-badge selected-tag-badge" key={tag.id}>
                <span className="tag-badge-text" title={tag.name}>{tag.name}</span>
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
                    <span className="tag-badge-text" title={tag.name}>{tag.name}</span>
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
        {editingGuest && !editingGuest.isDeleted && <div className="guest-qr-inline guest-qr-desktop"><h3>QR-код гостя</h3><GuestQrCode guest={editingGuest} small />{canDownloadGuestTicket(editingGuest) && <button type="button" className="secondary-button guest-ticket-download-button" onClick={() => void openTicketMenu(editingGuest)}>Скачать билет</button>}</div>}
      </aside>
      </>}

      {guestFormTab === "companions" && editingGuest && !editingGuest.parentGuestId && !editingGuest.isDeleted && <section className="guest-companions-editor">
        <div className="guest-companions-toolbar"><label className="field"><span>Количество</span><input type="number" min={1} max={50} value={companionAddCount} onChange={(event) => setCompanionAddCount(Number(event.target.value))} /></label><button type="button" className="secondary-button" onClick={addCompanions}>Добавить</button></div>
        {companionDrafts.length === 0 ? <p className="muted">Сопровождающих пока нет. Добавьте одну или несколько строк, затем сохраните всю форму.</p> : <div className="guest-companions-list">{companionDrafts.map((companion, index) => <div className="guest-companion-draft" key={companion.id ?? "new-" + index}><label className="field"><span>ФИО *</span><input value={companion.name} required onChange={(event) => updateCompanionDraft(index, { name: event.target.value })} /></label><label className="field"><span>Группа *</span><select value={companion.groupId} required onChange={(event) => updateCompanionDraft(index, { groupId: event.target.value })}>{flatGroups.filter((group) => scopeIds.has(group.id)).map((group) => <option key={group.id} value={group.id}>{"- ".repeat(group.level)}{group.name}</option>)}</select></label><label className="field"><span>Категория *</span><select value={companion.categoryId} required onChange={(event) => updateCompanionDraft(index, { categoryId: event.target.value })}><option value="" disabled>Выберите категорию</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><button type="button" className="icon-button icon-button-danger guest-companion-remove" onClick={() => removeCompanionDraft(index)} title="Удалить сопровождающего" aria-label={`Удалить сопровождающего ${companion.name || index + 1}`}><DeleteIcon /></button></div>)}</div>}
      </section>}

      </fieldset><div className="modal-actions"><button className="secondary-button" type="button" onClick={closeForm} disabled={saving}>Закрыть</button>{!editingGuest?.isDeleted && <button className="primary-button" type="submit" disabled={saving || Boolean(editingGuest && !isGuestEditDirty && !companionDraftsDirty)}>{saving ? "Сохраняем..." : "Сохранить"}</button>}</div>
    </form></Modal>}

    {qrGuest && <Modal className="guest-qr-modal" title={`QR-код: ${qrGuest.name}`} description="Сканирование откроет публичную карточку гостя." onClose={() => setQrGuest(null)}><GuestQrCode guest={qrGuest} /><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setQrGuest(null)}>Закрыть</button></div></Modal>}
    {ticketGuest && <Modal title={`Билет: ${ticketGuest.name}`} description="Выберите шаблон для печати билета." onClose={() => setTicketGuest(null)}><div className="ticket-print-menu">{ticketTemplates.map(template => <button type="button" key={template.id} className={`ticket-print-template${selectedTicketTemplateId === template.id ? " selected" : ""}${template.isDefault ? " default" : ""}`} onClick={() => setSelectedTicketTemplateId(template.id)}><span>{template.name}</span>{template.isDefault && <strong>✓ По умолчанию</strong>}</button>)}{!ticketTemplates.length && <p>Сначала создайте шаблон билета.</p>}</div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setTicketGuest(null)}>Отмена</button><button type="button" className="primary-button" disabled={!selectedTicketTemplateId} onClick={() => { const template = ticketTemplates.find(item => item.id === selectedTicketTemplateId); if (template) { void downloadGuestTicket(ticketGuest, template); setTicketGuest(null); } }}>Скачать билет</button></div></Modal>}
    {bulkActionToConfirm && <Modal
      title="Подтверждение массовой операции"
      description={`«${bulkActionToConfirm.label}»: будет обработано ${bulkActionToConfirm.eligibleCount} из ${bulkSummary?.selectedCount ?? selectedGuestCount} выбранных гостей.`}
      onClose={() => { if (!bulkLoading) setBulkActionToConfirm(null); }}
    >
      <p>{bulkActionToConfirm.action === "delete"
        ? "Гости будут скрыты и перестанут учитываться. Позже их можно восстановить через фильтр удалённых."
        : "Операция будет выполнена только для подходящих гостей. Остальные выбранные гости будут пропущены."}</p>
      <div className="modal-actions">
        <button type="button" className="secondary-button" disabled={bulkLoading} onClick={() => setBulkActionToConfirm(null)}>Отмена</button>
        <button type="button" className={bulkActionToConfirm.action === "delete" ? "danger-button" : "primary-button"} disabled={bulkLoading} onClick={() => void executeBulkAction(bulkActionToConfirm.action)}>ОК</button>
      </div>
    </Modal>}
    {deleteGuest && <Modal title="Удалить гостя" description={`Гость «${deleteGuest.name}» будет скрыт и перестанет учитываться. Его можно восстановить через фильтр удалённых.`} onClose={() => !saving && setDeleteGuest(null)}>{error && <div className="alert alert-error">{error}</div>}<div className="modal-actions"><button className="secondary-button" onClick={() => setDeleteGuest(null)} disabled={saving}>Отмена</button><button className="danger-button" onClick={confirmDelete} disabled={saving}>{saving ? "Удаляем..." : "Удалить"}</button></div></Modal>}
  </div>;
};

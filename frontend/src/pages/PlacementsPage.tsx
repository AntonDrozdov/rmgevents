import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Modal } from "../components/Modal";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";
import { CategoryDto, GroupTreeDto, GuestDto, OrganizationDepartmentTreeItemDto, OrganizationEmployeeTreeItemDto, OrganizationStructureTreeDto } from "../types";
import { Placement, PlacementEditLockStatus, PlacementGuest, PlacementTemplate } from "../types/placements";
import { defaultSeatLabel, seatLabel } from "../utils/placementSeats";
import { flattenGroups } from "../utils/groups";

type PlacementFormType = "container" | "row" | "table" | "label";
type PlacementMove = {
  x: number;
  y: number;
  positions: Map<number, { x: number; y: number }>;
  sourceItems: Map<number, Placement>;
  rootIds: Set<number>;
  bounds: { x: number; y: number; width: number; height: number };
  alignmentCandidates: Array<{ id: number; bounds: { x: number; y: number; width: number; height: number } }>;
  appliedDx: number;
  appliedDy: number;
  didMove: boolean;
};
type PlacementAlignmentGuide = { position: number; start: number; end: number; targetId: number };
type PlacementAlignmentGuides = { vertical: PlacementAlignmentGuide | null; horizontal: PlacementAlignmentGuide | null };
type KeyboardPlacementMove = PlacementMove & { saveTimer: number | null };
type PlacementRotation = {
  item: Placement;
  members: Placement[];
  preview: Map<number, Placement>;
  centerX: number;
  centerY: number;
  startAngle: number;
  pointerX: number;
  pointerY: number;
  didRotate: boolean;
};
type PlacementResize = {
  item: Placement;
  corner: "nw" | "ne" | "sw" | "se";
  pointerX: number;
  pointerY: number;
  containerX: number;
  containerY: number;
  width: number;
  height: number;
  didResize: boolean;
};
type PlacementPropertiesTarget = {
  key: string;
  placement: Placement;
  members: Placement[];
  isRowBatch: boolean;
  isGroup: boolean;
};
const canvasOrigin = 4000;
const canvasWorkspace = { width: 10000, height: 8000 };
const defaultPlacementColor = "#2f6f87";
const focusedPlacementZoom = 1;
const blank = (parentId = "", placementType: PlacementFormType = "table") => ({ name: "", parentId, groupId: "", quota: "10", noQuota: placementType === "container" || placementType === "label", displayChildrenAsRows: placementType === "container", placementType, count: 1, startNumber: 1, color: "", fontSize: "18", seatStartNumber: "1", seatNumberingReversed: false, seatWithoutName: true, seatName: "" });
type PlacementForm = ReturnType<typeof blank>;
const SeatNumberingSettings: React.FC<{ form: PlacementForm; disabled: boolean; onChange: (patch: Partial<PlacementForm>) => void }> = ({ form, disabled, onChange }) => <>
  <label className="field"><span>Начинать нумеровать с</span><input type="number" min={1} max={2147483647 - Math.max(1, Number(form.quota) || 1) + 1} step={1} required disabled={disabled} value={form.seatStartNumber} onChange={e => onChange({ seatStartNumber: e.target.value })} /></label>
  <label className="field placement-seat-numbering-order"><span>Порядок нумерации</span><select disabled={disabled} value={form.seatNumberingReversed ? "rtl" : "ltr"} onChange={e => onChange({ seatNumberingReversed: e.target.value === "rtl" })}><option value="ltr">{form.placementType === "table" ? "По часовой стрелке" : "Слева направо"}</option><option value="rtl">{form.placementType === "table" ? "Против часовой стрелки" : "Справа налево"}</option></select></label>
  <div className="field placement-seat-name-field">
    <span>Название места</span>
    <label className="placement-seat-name-toggle">
      <input type="checkbox" checked={form.seatWithoutName} disabled={disabled} onChange={e => onChange({ seatWithoutName: e.target.checked })} />
      <span>Без названия</span>
    </label>
    <input aria-label="Название места" maxLength={60} required={!form.seatWithoutName} disabled={disabled || form.seatWithoutName} value={form.seatName} onChange={e => onChange({ seatName: e.target.value })} />
  </div>
</>;
const validSeatNumberingSettings = (form: PlacementForm) => (form.placementType !== "row" && form.placementType !== "table") || (Number.isInteger(Number(form.seatStartNumber)) && Number(form.seatStartNumber) >= 1 && Number(form.seatStartNumber) + Number(form.quota) - 1 <= 2147483647 && (form.seatWithoutName || !!form.seatName.trim()));
const tableRadiusFor = (quota: number, seatWidth = 28) => Math.max(72, Math.ceil((quota * (seatWidth + 5)) / (Math.PI * 2)) + 18);
let rowLabelMeasureContext: CanvasRenderingContext2D | null = null;
const rowLabelWidthFor = (name: string) => {
  if (typeof document === "undefined") return name.length * 8;
  rowLabelMeasureContext ??= document.createElement("canvas").getContext("2d");
  if (!rowLabelMeasureContext) return name.length * 8;
  rowLabelMeasureContext.font = '700 11px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  return Math.ceil(rowLabelMeasureContext.measureText(name).width);
};
const rowSeatWidth = (_placement: Placement) => 28;
const seatCountLabel = (count: number) => {
  const lastTwo = count % 100;
  const last = count % 10;
  return `${count} ${lastTwo >= 11 && lastTwo <= 14 ? "мест" : last === 1 ? "место" : last >= 2 && last <= 4 ? "места" : "мест"}`;
};
const renderedElementScale = (element: HTMLElement | null) => {
  if (!element) return { x: 1, y: 1 };
  const rect = element.getBoundingClientRect();
  return {
    x: rect.width / element.offsetWidth || 1,
    y: rect.height / element.offsetHeight || 1
  };
};
const resizeCornerLabels: Record<PlacementResize["corner"], string> = {
  nw: "левый верхний угол",
  ne: "правый верхний угол",
  sw: "левый нижний угол",
  se: "правый нижний угол"
};
const message = (err: unknown) => axios.isAxiosError(err) && typeof err.response?.data === "string" ? err.response.data : "Не удалось выполнить действие. Попробуйте ещё раз.";
const normalizeSearch = (value: string) => value.trim().toLocaleLowerCase("ru-RU");

const departmentMatchesSearch = (department: OrganizationDepartmentTreeItemDto, query: string): boolean => !query
  || department.name.toLocaleLowerCase("ru-RU").includes(query)
  || department.employees.some(employee => `${employee.fullName} ${employee.position}`.toLocaleLowerCase("ru-RU").includes(query))
  || department.children.some(child => departmentMatchesSearch(child, query));

const SeatOrganizationDepartment: React.FC<{ department: OrganizationDepartmentTreeItemDto; query: string; depth: number; selectedId: number | null; onSelect: (employee: OrganizationEmployeeTreeItemDto) => void }> = ({ department, query, depth, selectedId, onSelect }) => {
  const [open, setOpen] = useState(depth < 1);
  const normalized = normalizeSearch(query);
  const employees = normalized ? department.employees.filter(employee => `${employee.fullName} ${employee.position}`.toLocaleLowerCase("ru-RU").includes(normalized)) : department.employees;
  const children = department.children.filter(child => departmentMatchesSearch(child, normalized));
  useEffect(() => { if (normalized && (employees.length || children.length)) setOpen(true); }, [normalized, employees.length, children.length]);
  if (normalized && !employees.length && !children.length && !department.name.toLocaleLowerCase("ru-RU").includes(normalized)) return null;
  return <li className="org-tree-department">
    <button className="org-tree-department-button" type="button" onClick={() => setOpen(value => !value)} style={{ paddingLeft: 10 + depth * 12 }}><span aria-hidden="true">{open ? "▾" : "▸"}</span><strong>{department.name}</strong><small>{department.employees.length}</small></button>
    {open && <div className="org-tree-department-content">
      {employees.map(employee => <button className={`org-tree-employee${selectedId === employee.id ? " selected" : ""}`} key={employee.id} type="button" onClick={() => onSelect(employee)} style={{ paddingLeft: 30 + depth * 12 }}><span>{employee.fullName}</span><small>{employee.position}</small></button>)}
      {children.length > 0 && <ul className="org-tree-list">{children.map(child => <SeatOrganizationDepartment key={child.id} department={child} query={query} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />)}</ul>}
    </div>}
  </li>;
};

export const PlacementsPage: React.FC = () => {
  const { eventId = "" } = useParams();
  const { currentUser, events, currentEvent } = useAuth();
  const archived = (events.find(e => String(e.id) === eventId) ?? currentEvent)?.isArchived;
  const canManage = !!currentUser?.permissions.includes("create_group") && !archived;
  const canCreateGuest = !!currentUser?.permissions.includes("create_guest") && !archived;
  const [placementMode, setPlacementMode] = useState<"schema" | "seating">("seating");
  const [mobileOnlySeating, setMobileOnlySeating] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches);
  const [placementEditLock, setPlacementEditLock] = useState<PlacementEditLockStatus | null>(null);
  const [placementEditLockLoading, setPlacementEditLockLoading] = useState(false);
  const [placementEditLockError, setPlacementEditLockError] = useState("");
  const placementEditLockRef = useRef<PlacementEditLockStatus | null>(null);
  const canEditStructure = canManage && placementMode === "schema" && !mobileOnlySeating && placementEditLock?.isOwnedByCurrentUser === true;
  const canSeatGuests = canCreateGuest && placementMode === "seating";
  const canEditSeatLabels = canManage && placementMode === "seating";
  const [items, setItems] = useState<Placement[]>([]);
  const [groups, setGroups] = useState<GroupTreeDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const autoFocusedSearchResultRef = useRef<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [objectListCollapsed, setObjectListCollapsed] = useState(false);
  const [depth, setDepth] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Placement | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(blank());
  const [propertyForm, setPropertyForm] = useState<PlacementForm>(blank());
  const [propertyFormKey, setPropertyFormKey] = useState<string | null>(null);
  const [creationType, setCreationType] = useState<PlacementFormType | null>(null);
  const [tab, setTab] = useState<"main" | "guests">("main");
  const [guestList, setGuestList] = useState<PlacementGuest[]>([]);
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestSearch, setGuestSearch] = useState("");
  const [guestVersion, setGuestVersion] = useState(0);
  const [seatedGuests, setSeatedGuests] = useState<PlacementGuest[]>([]);
  const [seatedGuestsLoading, setSeatedGuestsLoading] = useState(false);
  const [seatedGuestsError, setSeatedGuestsError] = useState("");
  const [focusedSeatedGuestId, setFocusedSeatedGuestId] = useState<number | null>(null);
  const [focusedSeat, setFocusedSeat] = useState<{ placementId: number; seatNumber: number } | null>(null);
  const autoFocusedSeatedGuestRef = useRef<number | null>(null);
  const [newGuest, setNewGuest] = useState({ name: "", email: "", phone: "", categoryId: "" });
  const [showNewGuest, setShowNewGuest] = useState(false);
  const [templates, setTemplates] = useState<PlacementTemplate[]>([]);
  const [templateMode, setTemplateMode] = useState<"save" | "load" | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [confirmation, setConfirmation] = useState<{ text: string; run: () => Promise<void> } | null>(null);
  const [seatPlacement, setSeatPlacement] = useState<Placement | null>(null);
  const [seatNumber, setSeatNumber] = useState<number | null>(null);
  const [seatGuest, setSeatGuest] = useState<GuestDto | null>(null);
  const [seatExistingGuests, setSeatExistingGuests] = useState<GuestDto[]>([]);
  const [seatExistingLoading, setSeatExistingLoading] = useState(false);
  const [seatExistingSearch, setSeatExistingSearch] = useState("");
  const [seatExistingPage, setSeatExistingPage] = useState(1);
  const [seatExistingTotal, setSeatExistingTotal] = useState(0);
  const [seatExistingError, setSeatExistingError] = useState("");
  const seatExistingPageSize = 50;
  const seatExistingTotalPages = Math.max(1, Math.ceil(seatExistingTotal / seatExistingPageSize));
  const [seatLoading, setSeatLoading] = useState(false);
  const [seatSaving, setSeatSaving] = useState(false);
  const [seatLabelSaving, setSeatLabelSaving] = useState(false);
  const [seatLabelDraft, setSeatLabelDraft] = useState("");
  const [seatWithoutName, setSeatWithoutName] = useState(true);
  const [seatNameEditorOpen, setSeatNameEditorOpen] = useState(false);
  const [seatLabelError, setSeatLabelError] = useState("");
  const [seatError, setSeatError] = useState("");
  const [seatForm, setSeatForm] = useState({ name: "", email: "", phone: "", groupId: "", categoryId: "", tagIds: [] as number[], placementId: "", placementSeatNumber: "" });
  const [seatPlacementTreeCollapsed, setSeatPlacementTreeCollapsed] = useState<Set<number>>(new Set());
  const seatPlacementMenu = useRef<HTMLDetailsElement>(null);
  const [organizationTree, setOrganizationTree] = useState<OrganizationStructureTreeDto | null>(null);
  const [organizationLoading, setOrganizationLoading] = useState(false);
  const [organizationError, setOrganizationError] = useState("");
  const [organizationSearch, setOrganizationSearch] = useState("");
  const [selectedOrganizationEmployeeId, setSelectedOrganizationEmployeeId] = useState<number | null>(null);
  const [seatPopover, setSeatPopover] = useState<{ placementId: number; seatNumber: number; guest: PlacementGuest } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [focusedPlacementId, setFocusedPlacementId] = useState<number | null>(null);
  const [placementFocusRequest, setPlacementFocusRequest] = useState<{ placementId: number; animate: boolean; sequence: number } | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<PlacementAlignmentGuides>({ vertical: null, horizontal: null });
  const selectedIdsRef = useRef<Set<number>>(new Set());
  const [selectionBox, setSelectionBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | "root" | null>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const selectionStart = useRef<{ x: number; y: number } | null>(null);
  const selectionBoxRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const placementFocusSequence = useRef(0);
  const selectedMove = useRef<PlacementMove | null>(null);
  const keyboardMove = useRef<KeyboardPlacementMove | null>(null);
  const placementRotation = useRef<PlacementRotation | null>(null);
  const placementResize = useRef<PlacementResize | null>(null);
  const dropContainer = useRef<number | null>(null);
  const placementClipboard = useRef<number[]>([]);
  const suppressNodeClick = useRef(false);
  const dismissedSeatPopover = useRef<string | null>(null);
  const viewportInitializedFor = useRef<string | null>(null);
  const seatViewport = useRef<{ left: number; top: number; zoom: number } | null>(null);
  const flatGroups = useMemo(() => flattenGroups(groups), [groups]);
  useEffect(() => {
    const closeSeatPlacementMenu = (event: PointerEvent) => {
      const menu = seatPlacementMenu.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.removeAttribute("open");
    };
    document.addEventListener("pointerdown", closeSeatPlacementMenu);
    return () => document.removeEventListener("pointerdown", closeSeatPlacementMenu);
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 820px)");
    const syncMobileMode = () => setMobileOnlySeating(media.matches);
    syncMobileMode();
    media.addEventListener("change", syncMobileMode);
    return () => media.removeEventListener("change", syncMobileMode);
  }, []);
  useEffect(() => {
    if (!mobileOnlySeating || placementMode === "seating") return;
    seatViewport.current = null;
    setPlacementMode("seating");
    setPlacementSelection(new Set());
    setFormOpen(false);
    setTemplateMode(null);
    setConfirmation(null);
    setSearch("");
    setFocusedPlacementId(null);
  }, [mobileOnlySeating, placementMode]);
  const setPlacementSelection = (ids: Set<number>) => {
    selectedIdsRef.current = ids;
    setSelectedIds(ids);
  };

  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);

  const load = async () => {
    const [list, groupTree, cats] = await Promise.all([apiClient.getPlacements(eventId), apiClient.getGroupTree(eventId), apiClient.getCategories(eventId)]);
    setItems(list); setGroups(groupTree); setCategories(cats);
  };
  const applyPlacementEditLock = (status: PlacementEditLockStatus) => {
    const previous = placementEditLockRef.current;
    const lostOwnership = previous?.isOwnedByCurrentUser === true && !status.isOwnedByCurrentUser;
    const gainedOwnership = previous?.isOwnedByCurrentUser !== true && status.isOwnedByCurrentUser;
    placementEditLockRef.current = status;
    setPlacementEditLock(status);
    apiClient.setPlacementEditToken(eventId, status.isOwnedByCurrentUser ? status.token : null);
    if (status.isOwnedByCurrentUser) setPlacementEditLockError("");
    if (lostOwnership) {
      setPlacementEditLockError("Редактирование схемы было перехвачено другим пользователем. Последние несохранённые изменения отменены.");
      setPlacementSelection(new Set());
      setFormOpen(false);
      setTemplateMode(null);
      setConfirmation(null);
      selectedMove.current = null;
      keyboardMove.current = null;
      placementRotation.current = null;
      placementResize.current = null;
      void load().catch(error => setError(message(error)));
    } else if (gainedOwnership) {
      void load().catch(error => setError(message(error)));
    }
  };
  useEffect(() => { setLoading(true); load().catch(e => setError(message(e))).finally(() => setLoading(false)); }, [eventId]);
  useEffect(() => {
    if (!eventId || placementMode !== "schema" || !canManage || mobileOnlySeating) {
      placementEditLockRef.current = null;
      setPlacementEditLock(null);
      setPlacementEditLockLoading(false);
      setPlacementEditLockError("");
      apiClient.setPlacementEditToken(eventId, null);
      return;
    }

    let active = true;
    let requestRunning = false;
    setPlacementEditLockLoading(true);
    setPlacementEditLockError("");

    const synchronize = async (initial = false) => {
      if (requestRunning) return;
      requestRunning = true;
      try {
        let status = initial
          ? await apiClient.acquirePlacementEditLock(eventId)
          : placementEditLockRef.current?.isOwnedByCurrentUser
            ? await apiClient.heartbeatPlacementEditLock(eventId)
            : await apiClient.getPlacementEditLock(eventId);
        if (!initial && !status.isLocked) status = await apiClient.acquirePlacementEditLock(eventId);
        if (active) applyPlacementEditLock(status);
      } catch (lockError) {
        if (active) setPlacementEditLockError(message(lockError));
      } finally {
        requestRunning = false;
        if (active) setPlacementEditLockLoading(false);
      }
    };

    void synchronize(true);
    const timer = window.setInterval(() => void synchronize(), 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      const current = placementEditLockRef.current;
      if (current?.isOwnedByCurrentUser && current.token) void apiClient.releasePlacementEditLock(eventId).catch(() => undefined);
      apiClient.setPlacementEditToken(eventId, null);
      placementEditLockRef.current = null;
    };
  }, [eventId, placementMode, canManage, mobileOnlySeating]);
  useEffect(() => {
    let active = true;
    if (placementMode !== "seating") {
      setSeatedGuestsLoading(false);
      return;
    }
    setSeatedGuestsLoading(true);
    setSeatedGuestsError("");
    apiClient.seatedPlacementGuests(eventId)
      .then(list => {
        if (!active) return;
        setSeatedGuests(list);
        setFocusedSeatedGuestId(current => current !== null && list.some(guest => guest.id === current) ? current : null);
      })
      .catch(e => { if (active) setSeatedGuestsError(message(e)); })
      .finally(() => { if (active) setSeatedGuestsLoading(false); });
    return () => { active = false; };
  }, [eventId, placementMode, guestVersion]);
  useEffect(() => {
    if (focusedSeatedGuestId === null) return;
    const guest = seatedGuests.find(item => item.id === focusedSeatedGuestId);
    setFocusedSeat(guest && guest.placementId !== null && guest.seatNumber !== null
      ? { placementId: guest.placementId, seatNumber: guest.seatNumber }
      : null);
  }, [focusedSeatedGuestId, seatedGuests]);
  useEffect(() => {
    viewportInitializedFor.current = null;
    setZoom(1);
    const frame = window.requestAnimationFrame(() => {
      canvas.current?.scrollTo({ left: canvasOrigin, top: canvasOrigin });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [eventId]);
  useEffect(() => {
    let active = true;
    setGuestList([]);
    if (!formOpen || !form.groupId || form.noQuota || archived) { setGuestLoading(false); return; }
    setGuestLoading(true);
    apiClient.placementGuests(eventId, Number(form.groupId)).then(list => { if (active) setGuestList(list); })
      .catch(e => { if (active) setError(message(e)); }).finally(() => { if (active) setGuestLoading(false); });
    return () => { active = false; };
  }, [eventId, formOpen, form.groupId, form.noQuota, guestVersion, archived]);

  const act = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); } catch (e) {
      setError(message(e));
      if (placementMode === "schema" && axios.isAxiosError(e) && e.response?.status === 409) {
        try { applyPlacementEditLock(await apiClient.getPlacementEditLock(eventId)); await load(); }
        catch { /* The polling request will retry. */ }
      }
    } finally { setBusy(false); }
  };
  const requestPlacementEditTakeover = () => {
    const editorName = placementEditLock?.editorName ?? "другой пользователь";
    setConfirmation({
      text: `${editorName} сейчас редактирует схему. После перехвата этот пользователь потеряет возможность сохранять изменения. Перехватить редактирование?`,
      run: async () => {
        const status = await apiClient.takeoverPlacementEditLock(eventId);
        applyPlacementEditLock(status);
        await load();
        setConfirmation(null);
      },
    });
  };
  const open = (p: Placement | null, parentId = "") => {
    if (p) {
      setEditing(p);
      setForm(formForPlacement(p));
      setFormOpen(false);
      return;
    }
    const parent = items.find(item => item.id === Number(parentId));
    const placementType: PlacementFormType = parent?.displayChildrenAsRows ? "row" : "table";
    setCreationType(null); setEditing(null); setForm(blank(parentId, placementType));
    setTab("main"); setGuestSearch(""); setShowNewGuest(false); setNewGuest({ name: "", email: "", phone: "", categoryId: "" }); setError(""); setFormOpen(true);
  };
  const openCreate = (placementType: PlacementFormType) => {
    setEditing(null); setCreationType(placementType); setForm(blank("", placementType)); setTab("main"); setError(""); setFormOpen(true);
  };
  const placementGroupScope = (groupId: number) => {
    const ids = new Set<number>();
    const addBranch = (group: GroupTreeDto) => { ids.add(group.id); group.children.forEach(addBranch); };
    const find = (nodes: GroupTreeDto[]) => nodes.forEach(group => { if (group.id === groupId) addBranch(group); else find(group.children); });
    find(groups);
    return ids;
  };
  const placementAcceptsGuestGroup = (placement: Placement, groupId: number) => placement.quota !== null
    && placement.quota > 0
    && placement.groupId !== null
    && placementGroupScope(placement.groupId).has(groupId);
  const availableSeatNumbersFor = (placement: Placement) => Array.from({ length: placement.quota ?? 0 }, (_, index) => index + 1)
    .filter(number => !placement.occupiedSeatNumbers.includes(number)
      || (seatGuest?.placementId === placement.id && seatGuest.placementSeatNumber === number));
  const reseatingPlacements = seatGuest
    ? items.filter(placement => placementAcceptsGuestGroup(placement, Number(seatForm.groupId)))
    : [];
  const reseatingPlacement = seatGuest ? reseatingPlacements.find(placement => placement.id === Number(seatForm.placementId)) ?? null : null;
  const reseatingSeatNumbers = reseatingPlacement ? availableSeatNumbersFor(reseatingPlacement) : [];
  const reseatingTree = (() => {
    const byId = new Map(items.map(item => [item.id, item]));
    const availableSeatsByPlacement = new Map<number, number[]>();
    const visibleIds = new Set<number>();
    for (const placement of reseatingPlacements) {
      const availableSeats = availableSeatNumbersFor(placement);
      if (availableSeats.length === 0) continue;
      availableSeatsByPlacement.set(placement.id, availableSeats);
      visibleIds.add(placement.id);
      let parentId = placement.parentId;
      const visited = new Set<number>();
      while (parentId !== null && visited.add(parentId)) {
        visibleIds.add(parentId);
        parentId = byId.get(parentId)?.parentId ?? null;
      }
    }
    const childrenByParent = new Map<number, Placement[]>();
    const roots: Placement[] = [];
    for (const placement of items) {
      if (!visibleIds.has(placement.id)) continue;
      if (placement.parentId === null || !visibleIds.has(placement.parentId)) {
        roots.push(placement);
        continue;
      }
      const children = childrenByParent.get(placement.parentId) ?? [];
      children.push(placement);
      childrenByParent.set(placement.parentId, children);
    }
    return { availableSeatsByPlacement, childrenByParent, roots };
  })();
  const reseatingValid = !seatGuest || (!!reseatingPlacement && reseatingSeatNumbers.includes(Number(seatForm.placementSeatNumber)));
  const reseatingValue = reseatingPlacement && seatForm.placementSeatNumber
    ? `${reseatingPlacement.name} · ${seatLabel(reseatingPlacement, Number(seatForm.placementSeatNumber))}`
    : "Выберите место";
  const seatGuestMoving = !!seatGuest && (seatGuest.placementId !== Number(seatForm.placementId) || seatGuest.placementSeatNumber !== Number(seatForm.placementSeatNumber));
  const changeSeatGuestGroup = (groupId: string) => setSeatForm(current => {
    if (!seatGuest) return { ...current, groupId };
    const selectedPlacement = items.find(placement => placement.id === Number(current.placementId));
    return selectedPlacement && placementAcceptsGuestGroup(selectedPlacement, Number(groupId))
      ? { ...current, groupId }
      : { ...current, groupId, placementId: "", placementSeatNumber: "" };
  });
  const selectReseatingSeat = (placementId: number, selectedSeatNumber: number) => {
    setSeatForm(current => ({
      ...current,
      placementId: String(placementId),
      placementSeatNumber: String(selectedSeatNumber)
    }));
    seatPlacementMenu.current?.removeAttribute("open");
  };
  const openSeatForm = async (placement: Placement, selectedSeatNumber: number) => {
    if ((!canSeatGuests && !canEditSeatLabels) || seatLoading) return;
    const currentCanvas = canvas.current;
    seatViewport.current = currentCanvas
      ? { left: currentCanvas.scrollLeft, top: currentCanvas.scrollTop, zoom }
      : null;
    const hasCustomSeatName = Object.prototype.hasOwnProperty.call(placement.seatLabels ?? {}, selectedSeatNumber);
    setSeatPlacement(placement); setSeatNumber(selectedSeatNumber); setSeatWithoutName(!hasCustomSeatName); setSeatLabelDraft(hasCustomSeatName ? placement.seatLabels[selectedSeatNumber] : ""); setSeatNameEditorOpen(false); setSeatLabelError(""); setSeatGuest(null); setSeatExistingGuests([]); setSeatExistingSearch(""); setSeatExistingPage(1); setSeatExistingTotal(0); setSeatExistingError(""); setSeatLoading(true); setSeatSaving(false); setSeatLabelSaving(false); setSeatError(""); setSeatPlacementTreeCollapsed(new Set(items.map(item => item.id))); setOrganizationSearch(""); setSelectedOrganizationEmployeeId(null); setOrganizationError("");
    if (!canSeatGuests) { setSeatLoading(false); return; }
    if (!placement.groupId) { setSeatError("Для рассадки гостей укажите группу объекта."); setSeatLoading(false); return; }
    try {
      const [currentSeatedGuests, tree] = await Promise.all([apiClient.seatedPlacementGuests(eventId), apiClient.getOrganizationStructureTree(eventId)]);
      const occupantId = currentSeatedGuests.find(guest => guest.placementId === placement.id && guest.seatNumber === selectedSeatNumber)?.id;
      const guest = occupantId ? await apiClient.getGuest(eventId, occupantId) : null;
      setSeatGuest(guest);
      setSeatForm(guest ? { name: guest.name, email: guest.email ?? "", phone: guest.phone ?? "", groupId: String(guest.groupId), categoryId: String(guest.categoryId ?? ""), tagIds: guest.tags.map(tag => tag.id), placementId: String(guest.placementId ?? placement.id), placementSeatNumber: String(guest.placementSeatNumber ?? selectedSeatNumber) } : { name: "", email: "", phone: "", groupId: String(placement.groupId), categoryId: "", tagIds: [], placementId: String(placement.id), placementSeatNumber: String(selectedSeatNumber) });
      setOrganizationTree(tree);
    } catch (err) { setSeatError(message(err)); }
    finally { setSeatLoading(false); }
  };
  const closeSeatForm = () => {
    const viewport = seatViewport.current;
    seatViewport.current = null;
    setSeatNameEditorOpen(false);
    setSeatPlacement(null);
    setSeatNumber(null);
    if (!viewport) return;
    setZoom(viewport.zoom);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        canvas.current?.scrollTo({ left: viewport.left, top: viewport.top });
      });
    });
  };
  useEffect(() => {
    if (!seatPlacement || seatGuest || seatLoading || !canSeatGuests) return;
    let active = true;
    setSeatExistingLoading(true);
    setSeatExistingError("");
    const timer = window.setTimeout(async () => {
      try {
        const result = await apiClient.getGuests(eventId, { page: seatExistingPage, pageSize: seatExistingPageSize, search: seatExistingSearch.trim() || undefined, eligibleForSeating: true });
        if (!active) return;
        setSeatExistingGuests(result.items);
        setSeatExistingTotal(result.totalCount);
        setSeatExistingPage(result.page);
      } catch (err) {
        if (active) { setSeatExistingGuests([]); setSeatExistingTotal(0); setSeatExistingError(message(err)); }
      } finally { if (active) setSeatExistingLoading(false); }
    }, seatExistingSearch.trim() ? 300 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [eventId, seatPlacement?.id, seatGuest?.id, seatLoading, canSeatGuests, seatExistingPage, seatExistingSearch]);
  const seatPopoverKey = (placementId: number, selectedSeatNumber: number) => `${placementId}:${selectedSeatNumber}`;
  const showSeatPopover = async (placement: Placement, selectedSeatNumber: number) => {
    if (!placement.groupId || dismissedSeatPopover.current === seatPopoverKey(placement.id, selectedSeatNumber)) return;
    try {
      const guests = await apiClient.seatedPlacementGuests(eventId);
      const guest = guests.find(item => item.placementId === placement.id && item.seatNumber === selectedSeatNumber);
      if (guest && dismissedSeatPopover.current !== seatPopoverKey(placement.id, selectedSeatNumber)) setSeatPopover({ placementId: placement.id, seatNumber: selectedSeatNumber, guest });
    } catch { /* The seat remains usable if the preview cannot be loaded. */ }
  };
  const hideSeatPopover = (placementId: number, selectedSeatNumber: number) => {
    const key = seatPopoverKey(placementId, selectedSeatNumber);
    if (dismissedSeatPopover.current === key) dismissedSeatPopover.current = null;
    setSeatPopover(current => current?.placementId === placementId && current.seatNumber === selectedSeatNumber ? null : current);
  };
  const persistSeatLabel = async () => {
    if (!seatPlacement || !seatNumber) return;
    const hasCustomSeatName = Object.prototype.hasOwnProperty.call(seatPlacement.seatLabels ?? {}, seatNumber);
    const nextName = seatLabelDraft.trim();
    if (seatWithoutName && !hasCustomSeatName) return;
    if (!seatWithoutName && hasCustomSeatName && nextName === seatPlacement.seatLabels[seatNumber]) return;
    if (!seatWithoutName && !nextName) return;
    const list = await apiClient.updatePlacementSeatLabel(eventId, seatPlacement.id, seatNumber, seatWithoutName || nextName === defaultSeatLabel(seatPlacement, seatNumber) ? "" : nextName);
    const updatedPlacement = list.find(item => item.id === seatPlacement.id);
    setItems(list);
    if (updatedPlacement) {
      const hasUpdatedCustomSeatName = Object.prototype.hasOwnProperty.call(updatedPlacement.seatLabels ?? {}, seatNumber);
      setSeatPlacement(updatedPlacement);
      setSeatWithoutName(!hasUpdatedCustomSeatName);
      setSeatLabelDraft(hasUpdatedCustomSeatName ? updatedPlacement.seatLabels[seatNumber] : "");
    }
  };
  const saveSeatLabel = async () => {
    if (!seatPlacement || !seatNumber || seatLabelSaving || seatSaving) return;
    setSeatLabelSaving(true); setSeatLabelError("");
    try { await persistSeatLabel(); setSeatNameEditorOpen(false); }
    catch (err) { setSeatLabelError(message(err)); }
    finally { setSeatLabelSaving(false); }
  };
  const openSeatNameEditor = () => {
    if (!seatPlacement || !seatNumber || seatLabelSaving || seatSaving) return;
    const hasCustomSeatName = Object.prototype.hasOwnProperty.call(seatPlacement.seatLabels ?? {}, seatNumber);
    setSeatWithoutName(!hasCustomSeatName);
    setSeatLabelDraft(hasCustomSeatName ? seatPlacement.seatLabels[seatNumber] : "");
    setSeatLabelError("");
    setSeatNameEditorOpen(true);
  };
  const assignExistingGuestToSeat = async (guest: GuestDto) => {
    if (!seatPlacement || !seatNumber || seatSaving) return;
    setSeatSaving(true); setSeatError("");
    try {
      await persistSeatLabel();
      await apiClient.updateGuest(eventId, guest.id, { name: guest.name, email: guest.email ?? undefined, phone: guest.phone ?? undefined, groupId: guest.groupId, categoryId: guest.categoryId, tagIds: guest.tags.map(tag => tag.id), placementId: seatPlacement.id, placementSeatNumber: seatNumber });
      const list = await apiClient.getPlacements(eventId);
      setItems(list); setGuestVersion(version => version + 1); closeSeatForm();
    } catch (err) { setSeatError(message(err)); }
    finally { setSeatSaving(false); }
  };
  const saveSeatGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seatPlacement || !seatForm.categoryId || seatSaving || !reseatingValid) return;
    setSeatSaving(true); setSeatError("");
    try {
      await persistSeatLabel();
      const request = { name: seatForm.name.trim(), email: seatForm.email.trim() || undefined, phone: seatForm.phone.trim() || undefined, groupId: Number(seatForm.groupId), categoryId: Number(seatForm.categoryId), tagIds: seatForm.tagIds, placementId: seatGuest ? Number(seatForm.placementId) : seatPlacement.id, placementSeatNumber: seatGuest ? Number(seatForm.placementSeatNumber) : seatNumber };
      if (seatGuest) await apiClient.updateGuest(eventId, seatGuest.id, request); else await apiClient.createGuest(eventId, request);
      const list = await apiClient.getPlacements(eventId);
      setItems(list); setGuestVersion(version => version + 1); closeSeatForm();
    } catch (err) { setSeatError(message(err)); }
    finally { setSeatSaving(false); }
  };
  const descendants = (id: number) => {
    const ids = new Set([id]);
    let changed = true;
    while (changed) { changed = false; for (const p of items) if (p.parentId !== null && ids.has(p.parentId) && !ids.has(p.id)) { ids.add(p.id); changed = true; } }
    return ids;
  };
  const isTextPlacement = (placement: Placement) => placement.isLabel
    || (!placement.isRow && !placement.displayChildrenAsRows && placement.quota === null);
  const placementFootprint = (placement: Placement) => {
    if (isTextPlacement(placement)) {
      const size = placement.fontSize ?? 18;
      rowLabelWidthFor(placement.name);
      if (rowLabelMeasureContext) rowLabelMeasureContext.font = `800 ${size}px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      return { width: Math.max(1, Math.ceil(rowLabelMeasureContext?.measureText(placement.name).width ?? placement.name.length * size * .6)), height: Math.ceil(size * 1.3) };
    }
    if (placement.isRow) {
      const groupName = flatGroups.find(group => group.id === placement.groupId)?.name ?? "Без группы";
      const labelWidth = Math.min(220, Math.max(
        rowLabelWidthFor(placementMode === "schema" ? `${placement.name} · ${seatCountLabel(placement.quota ?? 0)}` : placement.name),
        placementMode === "schema" ? rowLabelWidthFor(groupName) : 0
      ));
      return { width: labelWidth + 12 + Math.max(28, (placement.quota ?? 1) * (rowSeatWidth(placement) + 5) - 5), height: 32 + (placement.parentId !== null ? 40 : 0) };
    }
    if (placement.displayChildrenAsRows) return { width: 250, height: 92 };
    const radius = tableRadiusFor(placement.quota ?? 0, rowSeatWidth(placement));
    return { width: radius * 2 + 92, height: radius * 2 + 164 };
  };
  const placementType = (placement: Placement): PlacementFormType => isTextPlacement(placement) ? "label" : placement.displayChildrenAsRows ? "container" : placement.isRow ? "row" : "table";
  const batchMembers = (placement: Placement) => placement.rowBatchId
    ? items.filter(item => item.rowBatchId === placement.rowBatchId)
    : [placement];
  const isHomogeneousGroup = (members: Placement[]) => members.length > 0 && members.every(member => placementType(member) === placementType(members[0]));
  const selectedPlacements = items.filter(item => selectedIds.has(item.id));
  const canGroupSelection = new Set(selectedPlacements.map(item =>
    item.rowBatchId ? `group:${item.rowBatchId}` : `placement:${item.id}`)).size > 1;
  const selectedBatchIds = [...new Set(selectedPlacements
    .filter(item => item.rowBatchId && batchMembers(item).length > 1)
    .map(item => item.rowBatchId!))];
  const formForPlacement = (placement: Placement, members = batchMembers(placement)): PlacementForm => {
    const type = placementType(placement);
    const isRowBatch = placement.isRow && !!placement.rowBatchId && members.length > 1;
    return {
      ...blank("", type),
      name: isRowBatch ? placement.name.replace(/\s+\d+$/, "") : placement.name,
      displayChildrenAsRows: placement.displayChildrenAsRows,
      parentId: String(placement.parentId ?? ""),
      groupId: type === "label" ? "" : String(placement.groupId ?? ""),
      noQuota: placement.quota === null,
      quota: String(placement.quota ?? 10),
      color: placement.color ?? "",
      fontSize: String(placement.fontSize ?? 18),
      seatStartNumber: String(placement.seatStartNumber ?? 1), seatNumberingReversed: placement.seatNumberingReversed ?? false, seatWithoutName: !placement.seatName, seatName: placement.seatName ?? "",
      count: isRowBatch ? members.length : 1,
      startNumber: isRowBatch ? Number(placement.name.match(/(\d+)$/)?.[1] ?? 1) : 1
    };
  };
  const selectedPropertiesTarget: PlacementPropertiesTarget | null = (() => {
    const selected = items.filter(item => selectedIds.has(item.id));
    if (selected.length === 1) {
      const placement = selected[0];
      const members = batchMembers(placement);
      if (members.length > 1) return isHomogeneousGroup(members)
        ? { key: `group:${placement.rowBatchId}`, placement: members[0], members, isRowBatch: placement.isRow, isGroup: true }
        : null;
      return { key: `placement:${placement.id}`, placement, members: [placement], isRowBatch: false, isGroup: false };
    }
    if (selected.length > 1) {
      const batchId = selected[0].rowBatchId;
      const members = batchId ? items.filter(item => item.rowBatchId === batchId) : [];
      const isCompleteGroup = members.length > 1
        && members.length === selected.length
        && members.every(member => selectedIds.has(member.id))
        && isHomogeneousGroup(members);
      return isCompleteGroup ? { key: `group:${batchId}`, placement: members[0], members, isRowBatch: members[0].isRow, isGroup: true } : null;
    }
    return null;
  })();
  useEffect(() => {
    setPropertyFormKey(selectedPropertiesTarget?.key ?? null);
    setPropertyForm(selectedPropertiesTarget ? formForPlacement(selectedPropertiesTarget.placement, selectedPropertiesTarget.members) : blank());
  }, [selectedPropertiesTarget?.key]);
  const propertyFormValid = (() => {
    if (!selectedPropertiesTarget || propertyFormKey !== selectedPropertiesTarget.key) return false;
    const quota = propertyForm.noQuota ? null : Number(propertyForm.quota);
    const minimumQuota = propertyForm.placementType === "row" ? 1 : 0;
    const count = Number(propertyForm.count);
    return ((selectedPropertiesTarget.isGroup && !selectedPropertiesTarget.isRowBatch) || !!propertyForm.name.trim())
      && (propertyForm.placementType === "label" || !!Number(propertyForm.groupId))
      && validSeatNumberingSettings(propertyForm)
      && (propertyForm.placementType !== "label" || (Number.isInteger(Number(propertyForm.fontSize)) && Number(propertyForm.fontSize) >= 8 && Number(propertyForm.fontSize) <= 200))
      && (propertyForm.noQuota || (quota !== null && Number.isFinite(quota) && quota >= minimumQuota && quota <= 50))
      && (propertyForm.placementType !== "row" || (Number.isInteger(count) && count >= 1 && count <= 100));
  })();
  const propertyFormDirty = !!selectedPropertiesTarget
    && propertyFormKey === selectedPropertiesTarget.key
    && JSON.stringify(propertyForm) !== JSON.stringify(formForPlacement(selectedPropertiesTarget.placement, selectedPropertiesTarget.members));
  const saveProperties = (draft: PlacementForm, target: PlacementPropertiesTarget) => {
    if (!propertyFormValid) return;
    const quota = draft.placementType === "label" || draft.noQuota ? null : Number(draft.quota);
    const placement = target.placement;
    const inputFor = (member: Placement, preserveRowBatch = false) => ({
      name: target.isGroup && !target.isRowBatch ? member.name : draft.name.trim(),
      parentId: member.parentId,
      groupId: draft.placementType === "label" ? null : Number(draft.groupId) || null,
      quota,
      displayChildrenAsRows: draft.placementType === "container",
      isRow: draft.placementType === "row",
      isLabel: draft.placementType === "label",
      count: draft.placementType === "row" ? Math.min(100, Math.max(1, Number(draft.count) || 1)) : 1,
      startNumber: Math.max(1, Number(draft.startNumber) || 1),
      canvasX: member.canvasX,
      canvasY: member.canvasY,
      canvasWidth: member.canvasWidth,
      canvasHeight: member.canvasHeight,
      color: draft.color || null,
      fontSize: Number(draft.fontSize),
      rotation: member.rotation ?? 0,
      seatStartNumber: Number(draft.seatStartNumber), seatNumberingReversed: draft.seatNumberingReversed, seatName: draft.seatWithoutName ? null : draft.seatName.trim(),
      preserveRowBatch
    });
    void act(async () => {
      const list = target.isRowBatch && placement.rowBatchId
        ? await apiClient.updatePlacementBatch(eventId, placement.rowBatchId, inputFor(placement))
        : target.isGroup
          ? await (async () => {
            let updated = items;
            for (const member of target.members) updated = await apiClient.updatePlacement(eventId, member.id, inputFor(member, true));
            return updated;
          })()
          : await apiClient.updatePlacement(eventId, placement.id, inputFor(placement));
      setItems(list);
      const updatedPlacement = list.find(item => item.id === placement.id);
      if (updatedPlacement) {
        const updatedMembers = updatedPlacement.rowBatchId
          ? list.filter(item => item.rowBatchId === updatedPlacement.rowBatchId)
          : [updatedPlacement];
        setPropertyForm(formForPlacement(updatedPlacement, updatedMembers));
        setPlacementSelection(new Set(updatedMembers.map(item => item.id)));
      }
    });
  };
  const changeProperties = (patch: Partial<PlacementForm>) => {
    if (!selectedPropertiesTarget || propertyFormKey !== selectedPropertiesTarget.key) return;
    setPropertyForm(current => ({ ...current, ...patch }));
  };
  const containerInsets = { left: 24, top: 112, right: 24, bottom: 24 };
  const fallbackPositionFor = (placement: Placement) => {
    const index = Math.max(0, items.findIndex(item => item.id === placement.id));
    return { x: 40 + (index % 4) * 290, y: 40 + Math.floor(index / 4) * 180 };
  };
  function placementLayout(placement: Placement, visited = new Set<number>()): { x: number; y: number; width: number; height: number } {
    if (placement.displayChildrenAsRows) return containerLayout(placement, visited);
    const size = placementFootprint(placement);
    const fallback = fallbackPositionFor(placement);
    return { x: placement.canvasX ?? fallback.x, y: placement.canvasY ?? fallback.y, ...size };
  }
  function placementBounds(placement: Placement, visited = new Set<number>()) {
    const layout = placementLayout(placement, visited);
    if (!placement.isRow || !placement.rotation) return layout;
    const angle = placement.rotation * Math.PI / 180;
    const width = Math.abs(layout.width * Math.cos(angle)) + Math.abs(layout.height * Math.sin(angle));
    const height = Math.abs(layout.width * Math.sin(angle)) + Math.abs(layout.height * Math.cos(angle));
    return { x: layout.x + (layout.width - width) / 2, y: layout.y + (layout.height - height) / 2, width, height };
  }
  function containerLayout(placement: Placement, visited = new Set<number>()): { x: number; y: number; width: number; height: number } {
    const base = placementFootprint(placement);
    const fallbackPosition = fallbackPositionFor(placement);
    const fallback = {
      x: placement.canvasX ?? fallbackPosition.x,
      y: placement.canvasY ?? fallbackPosition.y,
      width: Math.max(base.width, placement.canvasWidth ?? 0),
      height: Math.max(base.height, placement.canvasHeight ?? 0)
    };
    if (!visited.add(placement.id)) return fallback;
    const childLayouts = items.filter(item => item.parentId === placement.id)
      .map(child => placementBounds(child, new Set(visited)));
    if (!childLayouts.length) return fallback;
    const left = Math.min(...childLayouts.map(child => child.x));
    const top = Math.min(...childLayouts.map(child => child.y));
    const right = Math.max(...childLayouts.map(child => child.x + child.width));
    const bottom = Math.max(...childLayouts.map(child => child.y + child.height));
    const natural = {
      x: Math.max(0, left - containerInsets.left),
      y: Math.max(0, top - containerInsets.top),
      right: right + containerInsets.right,
      bottom: bottom + containerInsets.bottom
    };
    const combinedLeft = Math.min(natural.x, fallback.x);
    const combinedTop = Math.min(natural.y, fallback.y);
    return {
      x: combinedLeft,
      y: combinedTop,
      width: Math.max(natural.right, fallback.x + fallback.width) - combinedLeft,
      height: Math.max(natural.bottom, fallback.y + fallback.height) - combinedTop
    };
  }
  const containerFootprint = (placement: Placement): { width: number; height: number } => {
    const { width, height } = containerLayout(placement);
    return { width, height };
  };
  const focusPlacement = (placement: Placement) => {
    viewportInitializedFor.current = `${eventId}:${placementMode}`;
    const animate = focusedPlacementId !== null && zoom === focusedPlacementZoom;
    setFocusedPlacementId(placement.id);
    if (canEditStructure) setPlacementSelection(new Set(batchMembers(placement).map(item => item.id)));
    setZoom(focusedPlacementZoom);
    setPlacementFocusRequest({ placementId: placement.id, animate, sequence: ++placementFocusSequence.current });
  };
  useEffect(() => {
    if (!placementFocusRequest) return;
    if (zoom !== focusedPlacementZoom) {
      setPlacementFocusRequest(current => current ? { ...current, animate: false } : current);
      setZoom(focusedPlacementZoom);
      return;
    }
    const placement = items.find(item => item.id === placementFocusRequest.placementId);
    if (!placement) return;
    const layout = placementBounds(placement);
    const request = placementFocusRequest;
    let correctionFrame = 0;
    let verificationFrame = 0;
    let animationFrame = 0;
    const renderedPlacementTarget = () => {
      const el = canvas.current;
      const node = el?.querySelector<HTMLElement>(`[data-placement-id="${request.placementId}"]`);
      if (!el || !node) return null;
      const canvasRect = el.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      return {
        left: Math.max(0, el.scrollLeft + nodeRect.left + nodeRect.width / 2 - canvasRect.left - el.clientWidth / 2),
        top: Math.max(0, el.scrollTop + nodeRect.top + nodeRect.height / 2 - canvasRect.top - el.clientHeight / 2)
      };
    };
    const centerRenderedPlacement = () => {
      const el = canvas.current;
      const target = renderedPlacementTarget();
      if (el && target) el.scrollTo(target);
    };
    const frame = window.requestAnimationFrame(() => {
      if (request.animate) {
        const el = canvas.current;
        const target = renderedPlacementTarget();
        if (!el || !target) return;
        const startLeft = el.scrollLeft;
        const startTop = el.scrollTop;
        const startedAt = performance.now();
        const animateToPlacement = (now: number) => {
          const progress = Math.min(1, (now - startedAt) / 320);
          const eased = 1 - Math.pow(1 - progress, 3);
          el.scrollLeft = startLeft + (target.left - startLeft) * eased;
          el.scrollTop = startTop + (target.top - startTop) * eased;
          if (progress < 1) {
            animationFrame = window.requestAnimationFrame(animateToPlacement);
            return;
          }
          setPlacementFocusRequest(current => current?.sequence === request.sequence ? null : current);
        };
        animationFrame = window.requestAnimationFrame(animateToPlacement);
        return;
      }
      const el = canvas.current;
      if (!el) return;
      el.scrollTo({
        left: Math.max(0, (canvasOrigin + layout.x + layout.width / 2) * focusedPlacementZoom - el.clientWidth / 2),
        top: Math.max(0, (canvasOrigin + layout.y + layout.height / 2) * focusedPlacementZoom - el.clientHeight / 2)
      });
      correctionFrame = window.requestAnimationFrame(() => {
        centerRenderedPlacement();
        verificationFrame = window.requestAnimationFrame(() => {
          centerRenderedPlacement();
          setPlacementFocusRequest(current => current?.sequence === request.sequence ? null : current);
        });
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(correctionFrame);
      window.cancelAnimationFrame(verificationFrame);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [items, placementFocusRequest, zoom]);
  const focusSeatedGuest = (guest: PlacementGuest) => {
    if (guest.placementId === null || guest.seatNumber === null) return;
    const placement = items.find(item => item.id === guest.placementId);
    if (!placement) return;
    const layout = placementBounds(placement);
    setFocusedSeatedGuestId(guest.id);
    setFocusedSeat({ placementId: placement.id, seatNumber: guest.seatNumber });
    setFocusedPlacementId(placement.id);
    const nextZoom = focusedPlacementZoom;
    if (nextZoom !== zoom) setZoom(nextZoom);
    window.requestAnimationFrame(() => {
      const el = canvas.current;
      if (!el) return;
      el.scrollTo({
        left: Math.max(0, (canvasOrigin + layout.x + layout.width / 2) * nextZoom - el.clientWidth / 2),
        top: Math.max(0, (canvasOrigin + layout.y + layout.height / 2) * nextZoom - el.clientHeight / 2)
      });
      window.requestAnimationFrame(() => {
        const seat = el.querySelector<HTMLElement>(`[data-placement-id="${placement.id}"] [data-seat-number="${guest.seatNumber}"]`);
        if (!seat) return;
        const canvasRect = el.getBoundingClientRect();
        const seatRect = seat.getBoundingClientRect();
        el.scrollTo({
          left: Math.max(0, el.scrollLeft + seatRect.left - canvasRect.left + seatRect.width / 2 - el.clientWidth / 2),
          top: Math.max(0, el.scrollTop + seatRect.top - canvasRect.top + seatRect.height / 2 - el.clientHeight / 2),
          behavior: "smooth"
        });
      });
    });
  };
  const focusAllPlacements = (onFocused?: () => void) => {
    const el = canvas.current;
    if (!el || !items.length) return 0;
    const layouts = items.map(item => placementBounds(item));
    const left = Math.min(...layouts.map(layout => layout.x));
    const top = Math.min(...layouts.map(layout => layout.y));
    const right = Math.max(...layouts.map(layout => layout.x + layout.width));
    const bottom = Math.max(...layouts.map(layout => layout.y + layout.height));
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);
    const nextZoom = Math.min(1, Math.max(.05, Math.min((el.clientWidth - 120) / width, (el.clientHeight - 120) / height)));
    const centerX = left + width / 2;
    const centerY = top + height / 2;
    setZoom(nextZoom);
    return window.requestAnimationFrame(() => {
      el.scrollTo({
        left: Math.max(0, (canvasOrigin + centerX) * nextZoom - el.clientWidth / 2),
        top: Math.max(0, (canvasOrigin + centerY) * nextZoom - el.clientHeight / 2)
      });
      onFocused?.();
    });
  };
  const zoomPlacementAt = (nextZoom: number, anchorX: number, anchorY: number) => {
    const el = canvas.current;
    if (!el || nextZoom === zoom) return;
    const worldX = (el.scrollLeft + anchorX) / zoom;
    const worldY = (el.scrollTop + anchorY) / zoom;
    setZoom(nextZoom);
    window.requestAnimationFrame(() => {
      el.scrollLeft = Math.max(0, worldX * nextZoom - anchorX);
      el.scrollTop = Math.max(0, worldY * nextZoom - anchorY);
    });
  };
  const zoomPlacementFromCenter = (direction: 1 | -1) => {
    const el = canvas.current;
    if (!el) return;
    const nextZoom = Math.min(2, Math.max(.05, +(zoom + direction * .1).toFixed(2)));
    zoomPlacementAt(nextZoom, el.clientWidth / 2, el.clientHeight / 2);
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!canEditStructure || busy || !(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const key = event.key.toLocaleLowerCase();
      if (key === "c" && selectedIds.size) {
        event.preventDefault();
        placementClipboard.current = [...selectedIds];
        return;
      }
      if (key !== "v" || !placementClipboard.current.length) return;
      event.preventDefault();
      const knownIds = new Set(items.map(item => item.id));
      void act(async () => {
        const list = await apiClient.copyPlacements(eventId, placementClipboard.current);
        const copiedIds = list.filter(item => !knownIds.has(item.id)).map(item => item.id);
        setItems(list);
        setPlacementSelection(new Set(copiedIds));
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, canEditStructure, eventId, items, selectedIds]);
  useEffect(() => {
    const viewportKey = `${eventId}:${placementMode}`;
    if (loading || !items.length || viewportInitializedFor.current === viewportKey) return;
    let nestedFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      if (viewportInitializedFor.current === viewportKey) return;
      nestedFrame = focusAllPlacements(() => { viewportInitializedFor.current = viewportKey; });
    });
    return () => { window.cancelAnimationFrame(frame); window.cancelAnimationFrame(nestedFrame); };
  }, [eventId, items.length, loading, placementMode]);
  const detachFromContainer = (placement: Placement) => {
    const members = batchMembers(placement);
    const parent = items.find(item => item.id === placement.parentId);
    const memberIds = new Set(members.map(member => member.id));
    const roots = new Set(members.filter(member => member.parentId === null || !memberIds.has(member.parentId)).map(member => member.id));
    const movingIds = new Set([...roots].flatMap(id => [...descendants(id)]));
    const movingMembers = items.filter(item => movingIds.has(item.id));
    if (!movingMembers.length) return;
    const minX = Math.min(...movingMembers.map(member => member.canvasX ?? 0));
    const minY = Math.min(...movingMembers.map(member => member.canvasY ?? 0));
    const movingBounds = movingMembers.map(member => placementBounds(member));
    const visualOffsetX = Math.min(...movingBounds.map(bounds => bounds.x)) - minX;
    const visualOffsetY = Math.min(...movingBounds.map(bounds => bounds.y)) - minY;
    const movingWidth = Math.max(...movingBounds.map(bounds => bounds.x + bounds.width)) - Math.min(...movingBounds.map(bounds => bounds.x));
    const movingHeight = Math.max(...movingBounds.map(bounds => bounds.y + bounds.height)) - Math.min(...movingBounds.map(bounds => bounds.y));
    const parentLayout = parent ? containerLayout(parent) : null;
    let targetX = Math.max(0, Math.round((parentLayout ? parentLayout.x + parentLayout.width + 60 : minX) - visualOffsetX));
    const targetY = Math.max(0, Math.round(minY));
    const containerBounds = items
      .filter(item => item.displayChildrenAsRows && !movingIds.has(item.id))
      .map(item => containerLayout(item));
    let overlappingContainer = true;
    while (overlappingContainer) {
      overlappingContainer = false;
      const candidate = { x: targetX + visualOffsetX, y: targetY + visualOffsetY, width: movingWidth, height: movingHeight };
      for (const bounds of containerBounds) {
        const overlaps = candidate.x < bounds.x + bounds.width + 24
          && candidate.x + candidate.width + 24 > bounds.x
          && candidate.y < bounds.y + bounds.height + 24
          && candidate.y + candidate.height + 24 > bounds.y;
        if (!overlaps) continue;
        targetX = Math.max(targetX, Math.ceil(bounds.x + bounds.width + 60 - visualOffsetX));
        overlappingContainer = true;
        break;
      }
    }
    void act(async () => {
      let list = items;
      for (const member of items.filter(item => movingIds.has(item.id))) {
        const offsetX = (member.canvasX ?? 0) - minX;
        const offsetY = (member.canvasY ?? 0) - minY;
        list = await apiClient.updatePlacement(eventId, member.id, { ...member, parentId: roots.has(member.id) ? null : member.parentId, canvasX: targetX + offsetX, canvasY: targetY + offsetY, preserveRowBatch: !!member.rowBatchId });
      }
      setItems(list);
      setPlacementSelection(new Set(roots));
    });
  };
  const isRow = form.placementType === "row";
  const isHall = form.placementType === "container";
  const isLabel = form.placementType === "label";
  const editingBatch = !!editing?.isRow && !!editing.rowBatchId && items.filter(item => item.rowBatchId === editing.rowBatchId).length > 1;
  const dirty = editing && (placementType(editing) !== form.placementType || form.displayChildrenAsRows !== editing.displayChildrenAsRows || form.name.trim() !== editing.name || (Number(form.groupId) || null) !== editing.groupId || (Number(form.parentId) || null) !== editing.parentId || (form.noQuota ? null : Number(form.quota)) !== editing.quota || (form.color || null) !== editing.color);
  const guestReady = !!editing && !dirty && !!form.groupId && !form.noQuota && canManage;
  const showGuestsTab = false;
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validSeatNumberingSettings(form)) return;
    void act(async () => {
      const bounds = canvas.current?.getBoundingClientRect();
      const newObject = { name: form.name.trim(), isRow: form.placementType === "row", isLabel: form.placementType === "label", displayChildrenAsRows: form.placementType === "container", quota: form.noQuota ? null : Number(form.quota), parentId: null, fontSize: Number(form.fontSize), seatStartNumber: Number(form.seatStartNumber), seatNumberingReversed: form.seatNumberingReversed, seatName: form.seatWithoutName ? null : form.seatName.trim() } as Placement;
      const newObjectSize = placementFootprint(newObject);
      const count = form.placementType === "container" || form.placementType === "label" ? 1 : Math.max(1, Number(form.count) || 1);
      const columns = newObject.isRow ? 1 : Math.min(3, count);
      const rows = newObject.isRow ? count : Math.ceil(count / 3);
      const createdWidth = newObjectSize.width + (columns - 1) * (newObject.isRow ? 0 : 220);
      const createdHeight = newObjectSize.height + (rows - 1) * (newObject.isRow ? 54 : 220);
      const initialPosition = !editing && canvas.current && bounds
        ? items.length === 0
          ? {
            x: Math.round((canvasWorkspace.width - createdWidth) / 2),
            y: Math.round((canvasWorkspace.height - createdHeight) / 2)
          }
          : {
            x: Math.max(0, Math.round((canvas.current.scrollLeft + bounds.width / 2) / zoom - canvasOrigin - createdWidth / 2)),
            y: Math.max(0, Math.round((canvas.current.scrollTop + bounds.height / 2) / zoom - canvasOrigin - createdHeight / 2))
          }
        : null;
      const input = { name: form.name.trim(), parentId: Number(form.parentId) || null, groupId: Number(form.groupId) || null, quota: form.noQuota ? null : Number(form.quota), displayChildrenAsRows: form.displayChildrenAsRows, isRow: form.placementType === "row", isLabel: form.placementType === "label", count: form.count, startNumber: form.startNumber, canvasX: editing?.canvasX ?? initialPosition?.x ?? null, canvasY: editing?.canvasY ?? initialPosition?.y ?? null, canvasWidth: editing?.canvasWidth ?? null, canvasHeight: editing?.canvasHeight ?? null, color: form.color || null, fontSize: Number(form.fontSize), rotation: editing?.rotation ?? 0, seatStartNumber: Number(form.seatStartNumber), seatNumberingReversed: form.seatNumberingReversed, seatName: form.seatWithoutName ? null : form.seatName.trim() };
      if (editing) {
        const list = editingBatch && editing.rowBatchId
          ? await apiClient.updatePlacementBatch(eventId, editing.rowBatchId, input)
          : await apiClient.updatePlacement(eventId, editing.id, input);
        setItems(list);
        setFormOpen(false);
      }
      else {
        const knownIds = new Set(items.map(item => item.id));
        const list = await apiClient.createPlacements(eventId, input);
        const createdIds = list.filter(item => !knownIds.has(item.id)).map(item => item.id);
        setItems(list);
        setPlacementSelection(new Set(createdIds));
        if (items.length === 0 && initialPosition) {
          window.requestAnimationFrame(() => {
            const canvasElement = canvas.current;
            if (!canvasElement) return;
            canvasElement.scrollTo({
              left: Math.max(0, (canvasOrigin + initialPosition.x + createdWidth / 2) * zoom - canvasElement.clientWidth / 2),
              top: Math.max(0, (canvasOrigin + initialPosition.y + createdHeight / 2) * zoom - canvasElement.clientHeight / 2)
            });
          });
        }
        setFormOpen(false);
      }
    });
  };
  const move = (id: number, parentId: number | null) => {
    const p = items.find(x => x.id === id);
    if (!p || p.parentId === parentId) return;
    if (parentId !== null && descendants(id).has(parentId)) { setError("Нельзя переносить объект в собственную ветку."); return; }
    if (!isTextPlacement(p) && !p.groupId) { open(p); setForm(f => ({ ...f, parentId: String(parentId ?? "") })); setError("Для сохранения переноса укажите группу."); return; }
    void act(async () => setItems(await apiClient.updatePlacement(eventId, id, { ...p, parentId, preserveRowBatch: !!p.rowBatchId })));
  };
  const drop = (e: React.DragEvent, parentId: number | null) => {
    e.preventDefault(); e.stopPropagation();
    if (canEditStructure && !busy && drag.current !== null) move(drag.current, parentId);
    drag.current = null;
    setDraggedId(null);
    setDropTarget(null);
  };
  const dropOnCanvas = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!canEditStructure || busy || drag.current === null) return;
    const placement = items.find(item => item.id === drag.current);
    const canvasElement = canvas.current;
    if (!placement || !canvasElement) return;
    const bounds = canvasElement.getBoundingClientRect();
    const canvasX = Math.max(0, Math.round((e.clientX - bounds.left + canvasElement.scrollLeft) / zoom - canvasOrigin - 125));
    const canvasY = Math.max(0, Math.round((e.clientY - bounds.top + canvasElement.scrollTop) / zoom - canvasOrigin - 36));
    drag.current = null;
    setDraggedId(null);
    setDropTarget(null);
    void act(async () => setItems(await apiClient.updatePlacement(eventId, placement.id, { ...placement, canvasX, canvasY, preserveRowBatch: !!placement.rowBatchId })));
  };
  const dragBranch = draggedId === null ? new Set<number>() : descendants(draggedId);
  const invalidDrop = (target: number) => dragBranch.has(target)
    || !items.find(item => item.id === target)?.displayChildrenAsRows;
  const hoverDrop = (e: React.DragEvent, target: number | "root") => {
    if (!canEditStructure || busy || drag.current === null) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = target !== "root" && invalidDrop(target) ? "none" : "move";
    setDropTarget(target);
  };
  const leaveDrop = (e: React.DragEvent) => {
    if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) setDropTarget(null);
  };
  const remove = (id: number | null) => {
    const ids = id === null ? new Set(items.map(p => p.id)) : descendants(id);
    const guests = items.filter(p => ids.has(p.id)).reduce((sum, p) => sum + p.guestCount, 0);
    setConfirmation({ text: `Удалить ${id === null ? "всю структуру" : "объект и всю его ветку"}? Объектов: ${ids.size}. Гостей: ${guests}. Размещение гостей будет снято, сами гости сохранятся.`, run: async () => { await apiClient.deletePlacement(eventId, id); await load(); setConfirmation(null); } });
  };
  const query = search.trim().toLocaleLowerCase("ru-RU");
  const filteredPlacements = query
    ? items.filter(placement => placement.name.toLocaleLowerCase("ru-RU").includes(query))
    : items;
  const filteredSeatedGuests = query
    ? seatedGuests.filter(guest => guest.name.toLocaleLowerCase("ru-RU").includes(query))
    : seatedGuests;
  const objectListHierarchy = useMemo(() => {
    const byId = new Map(items.map(item => [item.id, item]));
    const childrenByParent = new Map<number, Placement[]>();
    const roots: Placement[] = [];
    for (const item of items) {
      if (item.parentId === null || !byId.has(item.parentId)) {
        roots.push(item);
        continue;
      }
      const children = childrenByParent.get(item.parentId) ?? [];
      children.push(item);
      childrenByParent.set(item.parentId, children);
    }
    const visibleIds = new Set((query
      ? items.filter(item => item.name.toLocaleLowerCase("ru-RU").includes(query))
      : items).map(item => item.id));
    if (query) {
      for (const id of [...visibleIds]) {
        let parentId = byId.get(id)?.parentId ?? null;
        const visited = new Set<number>();
        while (parentId !== null && visited.add(parentId)) {
          visibleIds.add(parentId);
          parentId = byId.get(parentId)?.parentId ?? null;
        }
      }
    }
    return { childrenByParent, roots, visibleIds };
  }, [items, query]);
  const soleSearchResult = placementMode === "schema" && query && filteredPlacements.length === 1 ? filteredPlacements[0] : null;
  const soleSeatedGuestResult = placementMode === "seating" && query && filteredSeatedGuests.length === 1 ? filteredSeatedGuests[0] : null;
  useEffect(() => {
    if (!soleSearchResult) {
      autoFocusedSearchResultRef.current = null;
      return;
    }
    if (autoFocusedSearchResultRef.current === soleSearchResult.id) return;
    autoFocusedSearchResultRef.current = soleSearchResult.id;
    focusPlacement(soleSearchResult);
  }, [soleSearchResult?.id]);
  useEffect(() => {
    if (!soleSeatedGuestResult) {
      autoFocusedSeatedGuestRef.current = null;
      return;
    }
    if (autoFocusedSeatedGuestRef.current === soleSeatedGuestResult.id) return;
    autoFocusedSeatedGuestRef.current = soleSeatedGuestResult.id;
    focusSeatedGuest(soleSeatedGuestResult);
  }, [soleSeatedGuestResult?.id]);
  const renderObjectListPlacement = (placement: Placement, level = 0): React.ReactNode => {
    if (!objectListHierarchy.visibleIds.has(placement.id)) return null;
    const children = (objectListHierarchy.childrenByParent.get(placement.id) ?? [])
      .filter(child => objectListHierarchy.visibleIds.has(child.id));
    const hasChildren = children.length > 0;
    const expanded = !!query || !collapsed.has(placement.id);
    return <div className="placement-object-list-branch" key={placement.id}>
      <div className="placement-object-list-row placement-object-list-tree-row" style={{ "--placement-list-depth": level } as React.CSSProperties}>
        {hasChildren ? <button type="button" className={`placement-object-list-toggle${expanded ? " expanded" : ""}`} aria-expanded={expanded} aria-label={`${expanded ? "Свернуть" : "Развернуть"} ${placement.name}`} title={expanded ? "Свернуть" : "Развернуть"} onClick={() => setCollapsed(current => {
          const next = new Set(current);
          if (next.has(placement.id)) next.delete(placement.id); else next.add(placement.id);
          return next;
        })}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5" /></svg></button> : <span className="placement-object-list-toggle-spacer" />}
        <button type="button" className={`placement-object-list-item${focusedPlacementId === placement.id || selectedIds.has(placement.id) ? " selected" : ""}`} onClick={() => focusPlacement(placement)}><span>{placement.name}</span><small>{isTextPlacement(placement) ? "Текст" : placement.displayChildrenAsRows ? "Контейнер" : placement.isRow ? "Ряд" : "Стол"}</small></button>
        {canEditStructure && <button type="button" className="icon-button icon-button-danger placement-object-list-delete" disabled={busy} onClick={() => remove(placement.id)} aria-label={`Удалить ${placement.name}`} title="Удалить объект"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21a2 2 0 0 1-2-2V6h14v13a2 2 0 0 1-2 2H7Zm1-3h2V9H8v9Zm6 0h2V9h-2v9ZM4 5V3h5l1-1h4l1 1h5v2H4Z" /></svg></button>}
      </div>
      {hasChildren && expanded && <div className="placement-object-list-children">{children.map(child => renderObjectListPlacement(child, level + 1))}</div>}
    </div>;
  };
  const renderReseatingTreePlacement = (placement: Placement, level = 0): React.ReactNode => {
    const children = reseatingTree.childrenByParent.get(placement.id) ?? [];
    const availableSeats = reseatingTree.availableSeatsByPlacement.get(placement.id) ?? [];
    const expanded = !seatPlacementTreeCollapsed.has(placement.id);
    const selectedPlacement = Number(seatForm.placementId) === placement.id;
    const objectType = isTextPlacement(placement) ? "Текст" : placement.displayChildrenAsRows ? "Контейнер" : placement.isRow ? "Ряд" : "Стол";
    return <div className="placement-object-list-branch" key={placement.id}>
      <div className="placement-object-list-row placement-object-list-tree-row" style={{ "--placement-list-depth": level } as React.CSSProperties}>
        <button type="button" className={`placement-object-list-toggle${expanded ? " expanded" : ""}`} aria-expanded={expanded} aria-label={`${expanded ? "Свернуть" : "Развернуть"} ${placement.name}`} title={expanded ? "Свернуть" : "Развернуть"} onClick={() => setSeatPlacementTreeCollapsed(current => {
          const next = new Set(current);
          if (next.has(placement.id)) next.delete(placement.id); else next.add(placement.id);
          return next;
        })}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5" /></svg></button>
        <button type="button" className={`placement-object-list-item${selectedPlacement ? " selected" : ""}`} disabled={seatSaving} onClick={() => setSeatPlacementTreeCollapsed(current => {
          const next = new Set(current);
          if (next.has(placement.id)) next.delete(placement.id); else next.add(placement.id);
          return next;
        })}><span>{placement.name}</span><small>{objectType}{availableSeats.length > 0 ? ` · свободно ${availableSeats.length}` : ""}</small></button>
      </div>
      {expanded && <div className="placement-object-list-children">
        {availableSeats.map(availableSeatNumber => {
          const selected = selectedPlacement && Number(seatForm.placementSeatNumber) === availableSeatNumber;
          const current = seatGuest?.placementId === placement.id && seatGuest.placementSeatNumber === availableSeatNumber;
          return <div className="placement-object-list-row placement-object-list-tree-row seat-reassignment-tree-seat-row" style={{ "--placement-list-depth": level + 1 } as React.CSSProperties} key={`${placement.id}:${availableSeatNumber}`}>
            <span className="placement-object-list-toggle-spacer" />
            <button type="button" className={`placement-object-list-item seat-reassignment-tree-seat${selected ? " selected" : ""}`} disabled={seatSaving} aria-pressed={selected} onClick={() => selectReseatingSeat(placement.id, availableSeatNumber)}><span>{seatLabel(placement, availableSeatNumber)}</span><small>{current ? "Текущее место" : "Свободное место"}</small></button>
          </div>;
        })}
        {children.map(child => renderReseatingTreePlacement(child, level + 1))}
      </div>}
    </div>;
  };
  const hasSeatPlacements = items.some(item => (item.quota ?? 0) > 0);
  const isInsideSelectedContainer = (placement: Placement) => {
    let parentId = placement.parentId;
    const visited = new Set<number>();
    while (parentId !== null && visited.add(parentId)) {
      if (selectedIds.has(parentId)) return true;
      parentId = items.find(item => item.id === parentId)?.parentId ?? null;
    }
    return false;
  };
  const placementDepth = (placement: Placement) => {
    let depth = 0;
    let parentId = placement.parentId;
    const visited = new Set<number>();
    while (parentId !== null && visited.add(parentId)) {
      depth += 1;
      parentId = items.find(item => item.id === parentId)?.parentId ?? null;
    }
    return depth;
  };
  const createPlacementMove = (requestedIds: Set<number>, pointerX = 0, pointerY = 0): PlacementMove | null => {
    const rootIds = new Set([...requestedIds].filter(id => ![...requestedIds].some(parentId => parentId !== id && descendants(parentId).has(id))));
    const ids = new Set([...rootIds].flatMap(id => [...descendants(id)]));
    const sourceItems = new Map(items.map(item => [item.id, item]));
    const positions = new Map([...ids].flatMap(id => {
      const item = sourceItems.get(id);
      if (!item) return [];
      const layout = placementLayout(item);
      return [[id, { x: layout.x, y: layout.y }] as const];
    }));
    if (!positions.size || !rootIds.size) return null;
    const rootBounds = [...rootIds].flatMap(id => {
      const item = sourceItems.get(id);
      return item ? [placementBounds(item)] : [];
    });
    const left = Math.min(...rootBounds.map(bounds => bounds.x));
    const top = Math.min(...rootBounds.map(bounds => bounds.y));
    const right = Math.max(...rootBounds.map(bounds => bounds.x + bounds.width));
    const bottom = Math.max(...rootBounds.map(bounds => bounds.y + bounds.height));
    const rootParentIds = new Set([...rootIds].map(id => sourceItems.get(id)?.parentId ?? null));
    const commonParentId = rootParentIds.size === 1 ? [...rootParentIds][0] : undefined;
    const alignmentCandidates = commonParentId === undefined ? [] : items
      .filter(item => !ids.has(item.id) && item.parentId === commonParentId)
      .map(item => ({ id: item.id, bounds: placementBounds(item) }));
    return {
      x: pointerX,
      y: pointerY,
      positions,
      sourceItems,
      rootIds,
      bounds: { x: left, y: top, width: right - left, height: bottom - top },
      alignmentCandidates,
      appliedDx: 0,
      appliedDy: 0,
      didMove: false
    };
  };
  const startPlacementMove = (e: React.PointerEvent<HTMLDivElement>, placement: Placement, members: Placement[]) => {
    if (e.button !== 0 || !canEditStructure || (e.target as HTMLElement).closest("[data-placement-control]")) return;
    e.stopPropagation();
    const currentSelection = selectedIdsRef.current;
    if (e.ctrlKey) {
      const memberIds = members.map(member => member.id);
      const next = new Set(currentSelection);
      const removeMembers = memberIds.every(id => next.has(id));
      for (const id of memberIds) {
        if (removeMembers) next.delete(id); else next.add(id);
      }
      setPlacementSelection(next);
      return;
    }
    const requestedIds = currentSelection.has(placement.id)
      ? new Set([...currentSelection, ...members.map(member => member.id)])
      : new Set(members.map(member => member.id));
    if (!currentSelection.has(placement.id)) setPlacementSelection(requestedIds);
    const move = createPlacementMove(requestedIds, e.clientX, e.clientY);
    if (!move) return;
    setAlignmentGuides({ vertical: null, horizontal: null });
    selectedMove.current = move;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const startRowRotation = (e: React.PointerEvent<HTMLButtonElement>, placement: Placement) => {
    if (e.button !== 0 || !canEditStructure || busy) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.closest<HTMLElement>("[data-placement-id]")!.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const members = items.filter(item => item.isRow && (item.id === placement.id || selectedIdsRef.current.has(item.id)));
    placementRotation.current = { item: placement, members, preview: new Map(members.map(item => [item.id, item])), centerX, centerY, startAngle: Math.atan2(e.clientY - centerY, e.clientX - centerX), pointerX: e.clientX, pointerY: e.clientY, didRotate: false };
    canvas.current?.setPointerCapture(e.pointerId);
  };
  const rotatedRowsAtPointer = (rotation: PlacementRotation, clientX: number, clientY: number) => {
    if (Math.hypot(clientX - rotation.centerX, clientY - rotation.centerY) < 4) return rotation.preview;
    const angle = Math.atan2(clientY - rotation.centerY, clientX - rotation.centerX);
    const delta = Math.round((angle - rotation.startAngle) * 180 / Math.PI);
    rotation.preview = new Map(rotation.members.map(item => [item.id, { ...item, rotation: (((item.rotation ?? 0) + delta) % 360 + 360) % 360 }]));
    return rotation.preview;
  };
  const startContainerResize = (e: React.PointerEvent<HTMLButtonElement>, placement: Placement, layout: { x: number; y: number; width: number; height: number }, corner: PlacementResize["corner"]) => {
    if (e.button !== 0 || !canEditStructure || busy) return;
    e.preventDefault();
    e.stopPropagation();
    placementResize.current = {
      item: placement,
      corner,
      pointerX: e.clientX,
      pointerY: e.clientY,
      containerX: layout.x,
      containerY: layout.y,
      width: layout.width,
      height: layout.height,
      didResize: false
    };
    setPlacementSelection(new Set([placement.id]));
    canvas.current?.setPointerCapture(e.pointerId);
  };
  const dropContainerAtPoint = (move: PlacementMove, clientX: number, clientY: number, _dx = move.appliedDx, _dy = move.appliedDy) => {
    const originalParentIds = new Set([...move.rootIds]
      .map(id => move.sourceItems.get(id)?.parentId)
      .filter((id): id is number => id !== null && id !== undefined));
    const directId = Number(document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-placement-id]")?.dataset.placementId);
    const direct = move.sourceItems.get(directId);
    if (direct?.displayChildrenAsRows && !move.positions.has(direct.id) && !originalParentIds.has(direct.id)) return direct;

    const nodes = Array.from(canvas.current?.querySelectorAll<HTMLElement>("[data-placement-id]") ?? []);
    const movingRects = nodes
      .filter(node => move.rootIds.has(Number(node.dataset.placementId)))
      .map(node => node.getBoundingClientRect());
    if (!movingRects.length) return null;
    const movingBounds = movingRects.reduce((bounds, rect) => ({
      left: Math.min(bounds.left, rect.left),
      top: Math.min(bounds.top, rect.top),
      right: Math.max(bounds.right, rect.right),
      bottom: Math.max(bounds.bottom, rect.bottom)
    }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    const movingCenter = { x: (movingBounds.left + movingBounds.right) / 2, y: (movingBounds.top + movingBounds.bottom) / 2 };
    const movingArea = Math.max(1, (movingBounds.right - movingBounds.left) * (movingBounds.bottom - movingBounds.top));
    const candidates = nodes
      .flatMap(node => {
        const placement = move.sourceItems.get(Number(node.dataset.placementId));
        const rect = node.getBoundingClientRect();
        if (!placement?.displayChildrenAsRows || move.positions.has(placement.id)) return [];
        const cursorInside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
        const centerInside = movingCenter.x >= rect.left && movingCenter.x <= rect.right
          && movingCenter.y >= rect.top && movingCenter.y <= rect.bottom;
        const intersectionWidth = Math.max(0, Math.min(movingBounds.right, rect.right) - Math.max(movingBounds.left, rect.left));
        const intersectionHeight = Math.max(0, Math.min(movingBounds.bottom, rect.bottom) - Math.max(movingBounds.top, rect.top));
        const containerArea = Math.max(1, rect.width * rect.height);
        const overlap = intersectionWidth * intersectionHeight / Math.min(movingArea, containerArea);
        return cursorInside || centerInside || overlap >= .1 ? [{ placement, overlap, originalParent: originalParentIds.has(placement.id) }] : [];
      })
      .sort((left, right) => Number(left.originalParent) - Number(right.originalParent)
        || placementDepth(right.placement) - placementDepth(left.placement)
        || right.overlap - left.overlap);
    return candidates[0]?.placement ?? null;
  };
  const alignmentForMove = (move: PlacementMove, rawDx: number, rawDy: number, snap: boolean) => {
    const minimumCanvasX = Math.min(...[...move.positions.values()].map(position => position.x));
    const minimumCanvasY = Math.min(...[...move.positions.values()].map(position => position.y));
    rawDx = Math.max(-minimumCanvasX, rawDx);
    rawDy = Math.max(-minimumCanvasY, rawDy);
    const threshold = (snap ? 6 : 0.75) / zoom;
    const moving = {
      left: move.bounds.x + rawDx,
      top: move.bounds.y + rawDy,
      right: move.bounds.x + move.bounds.width + rawDx,
      bottom: move.bounds.y + move.bounds.height + rawDy
    };
    const movingX = [moving.left, (moving.left + moving.right) / 2, moving.right];
    const movingY = [moving.top, (moving.top + moving.bottom) / 2, moving.bottom];
    const intervalGap = (startA: number, endA: number, startB: number, endB: number) => Math.max(0, Math.max(startA, startB) - Math.min(endA, endB));
    let vertical: (PlacementAlignmentGuide & { correction: number; distance: number; perpendicular: number }) | null = null;
    let horizontal: (PlacementAlignmentGuide & { correction: number; distance: number; perpendicular: number }) | null = null;
    for (const candidate of move.alignmentCandidates) {
      const target = {
        left: candidate.bounds.x,
        top: candidate.bounds.y,
        right: candidate.bounds.x + candidate.bounds.width,
        bottom: candidate.bounds.y + candidate.bounds.height
      };
      for (const movingAnchor of movingX) for (const targetAnchor of [target.left, (target.left + target.right) / 2, target.right]) {
        const correction = targetAnchor - movingAnchor;
        const distance = Math.abs(correction);
        const perpendicular = intervalGap(moving.top, moving.bottom, target.top, target.bottom);
        if (distance <= threshold && (!vertical || distance < vertical.distance || (distance === vertical.distance && perpendicular < vertical.perpendicular))) {
          vertical = { position: targetAnchor, start: Math.min(moving.top, target.top) - 12, end: Math.max(moving.bottom, target.bottom) + 12, targetId: candidate.id, correction, distance, perpendicular };
        }
      }
      for (const movingAnchor of movingY) for (const targetAnchor of [target.top, (target.top + target.bottom) / 2, target.bottom]) {
        const correction = targetAnchor - movingAnchor;
        const distance = Math.abs(correction);
        const perpendicular = intervalGap(moving.left, moving.right, target.left, target.right);
        if (distance <= threshold && (!horizontal || distance < horizontal.distance || (distance === horizontal.distance && perpendicular < horizontal.perpendicular))) {
          horizontal = { position: targetAnchor, start: Math.min(moving.left, target.left) - 12, end: Math.max(moving.right, target.right) + 12, targetId: candidate.id, correction, distance, perpendicular };
        }
      }
    }
    let dx = rawDx + (snap ? vertical?.correction ?? 0 : 0);
    let dy = rawDy + (snap ? horizontal?.correction ?? 0 : 0);
    if (dx < -minimumCanvasX) { dx = -minimumCanvasX; vertical = null; }
    if (dy < -minimumCanvasY) { dy = -minimumCanvasY; horizontal = null; }
    return {
      dx,
      dy,
      guides: {
        vertical: vertical ? { position: vertical.position, start: vertical.start, end: vertical.end, targetId: vertical.targetId } : null,
        horizontal: horizontal ? { position: horizontal.position, start: horizontal.start, end: horizontal.end, targetId: horizontal.targetId } : null
      } satisfies PlacementAlignmentGuides
    };
  };
  const previewPlacementMove = (move: PlacementMove, dx: number, dy: number, target: Placement | null = null) => {
    move.appliedDx = dx;
    move.appliedDy = dy;
    setItems(current => current.map(item => {
      const position = move.positions.get(item.id);
      if (position) {
        const source = move.sourceItems.get(item.id);
        return {
          ...item,
          parentId: move.rootIds.has(item.id) ? target?.id ?? source?.parentId ?? null : item.parentId,
          canvasX: Math.max(0, Math.round(position.x + dx)),
          canvasY: Math.max(0, Math.round(position.y + dy))
        };
      }
      return item;
    }));
  };
  const placementMoveUpdates = (move: PlacementMove, parentId: number | null) => {
    const updates = new Map<number, Placement>();
    for (const [id, position] of move.positions) {
      const item = move.sourceItems.get(id);
      if (!item) continue;
      updates.set(id, {
        ...item,
        parentId: parentId !== null && move.rootIds.has(id) ? parentId : item.parentId,
        canvasX: Math.max(0, Math.round(position.x + move.appliedDx)),
        canvasY: Math.max(0, Math.round(position.y + move.appliedDy))
      });
    }
    return updates;
  };
  const persistPlacementMove = async (move: PlacementMove, parentId: number | null) => {
    const updates = placementMoveUpdates(move, parentId);
    if (!updates.size) return;
    try {
      let list = [...move.sourceItems.values()];
      for (const item of updates.values()) list = await apiClient.updatePlacement(eventId, item.id, { ...item, preserveRowBatch: !!item.rowBatchId });
      setItems(list);
    } catch (err) {
      setItems([...move.sourceItems.values()]);
      throw err;
    }
  };
  const alignmentTargetIds = new Set([alignmentGuides.vertical?.targetId, alignmentGuides.horizontal?.targetId].filter((id): id is number => typeof id === "number"));
  const renderNodes = (): React.ReactNode => {
    return <div className="placement-free-canvas">{items.map(p => {
      const isRow = p.isRow;
      const isLabelObject = isTextPlacement(p);
      const layout = placementLayout(p);
      const x = layout.x;
      const y = layout.y;
      const occupiedSeats = new Set(p.occupiedSeatNumbers ?? []);
      const tableRadius = tableRadiusFor(p.quota ?? 0, rowSeatWidth(p));
      const members = batchMembers(p);
      const groupName = flatGroups.find(group => group.id === p.groupId)?.name ?? "Без группы";
      const isGrouped = members.length > 1;
      const isBatchLeader = isGrouped && members[0].id === p.id;
      const isSelected = selectedIds.has(p.id);
      const isDragging = (selectedMove.current?.didMove && selectedMove.current.positions.has(p.id)) || (keyboardMove.current?.didMove && keyboardMove.current.positions.has(p.id));
      const isAboveSelectedContainer = isInsideSelectedContainer(p);
      const layer = isDragging ? 200 + placementDepth(p) : isAboveSelectedContainer ? 101 : isSelected ? 100 : placementDepth(p) + 1;
      const containerSize = p.displayChildrenAsRows ? { width: layout.width, height: layout.height } : undefined;
      const groupBounds = members.reduce((bounds, member) => {
        const memberLayout = placementBounds(member);
        return { left: Math.min(bounds.left, memberLayout.x), top: Math.min(bounds.top, memberLayout.y), right: Math.max(bounds.right, memberLayout.x + memberLayout.width), bottom: Math.max(bounds.bottom, memberLayout.y + memberLayout.height) };
      }, { left: x, top: y, right: x, bottom: y });
      return <div key={p.id} data-placement-id={p.id} className={`placement-node placement-free-node ${isRow ? "placement-row-free" : ""} ${isLabelObject ? "placement-label" : p.quota === null ? "placement-hall" : isRow ? "" : "placement-table"}${p.color ? " placement-colored" : ""}${canEditStructure ? " placement-can-drag" : ""}${p.parentId !== null ? " placement-contained" : ""}${isAboveSelectedContainer ? " placement-above-selected-container" : ""}${isSelected ? " placement-selected" : ""}${alignmentTargetIds.has(p.id) ? " placement-alignment-target" : ""}${isDragging ? " placement-dragging" : ""}${dragBranch.has(p.id) ? " group-tree-node-drag-branch" : ""}${draggedId === p.id ? " group-tree-node-drag-source" : ""}${dropTarget === p.id ? invalidDrop(p.id) ? " group-tree-node-drop-disabled" : " group-tree-node-drop-target" : ""}`}
          onClick={e => {
            if (suppressNodeClick.current || !canEditStructure || e.ctrlKey || (e.target as HTMLElement).closest("[data-placement-control]")) return;
            setFocusedPlacementId(p.id);
            setPlacementSelection(new Set(members.map(member => member.id)));
          }}
          style={{ left: x, top: y, zIndex: layer, transform: p.isRow ? `rotate(${p.rotation ?? 0}deg)` : undefined, transformOrigin: "center center", "--row-seat-width": `${rowSeatWidth(p)}px`, "--table-radius": `${tableRadius}px`, "--container-width": containerSize ? `${containerSize.width}px` : undefined, "--container-height": containerSize ? `${containerSize.height}px` : undefined, "--placement-font-size": `${p.fontSize ?? 18}px`, "--placement-color": p.color ?? undefined } as React.CSSProperties}
          draggable={false} onPointerDownCapture={e => startPlacementMove(e, p, members)}
          onDragOver={e => hoverDrop(e, p.id)} onDragLeave={leaveDrop} onDrop={e => drop(e, p.id)}>
          <div className="placement-node-content">
            <button className="placement-node-title" type="button" title={placementMode === "schema" && !isLabelObject ? `${p.name} · Группа: ${groupName}${isRow || (!p.displayChildrenAsRows && p.quota !== null) ? ` · ${seatCountLabel(p.quota ?? 0)}` : ""}` : p.name} disabled={!canEditStructure} onClick={e => { e.stopPropagation(); if (!suppressNodeClick.current) open(p); }}>
              <span className="placement-node-title-name"><span className="placement-node-primary-name">{p.name}</span>{placementMode === "schema" && isRow && <span className="placement-row-title-seat-count">{seatCountLabel(p.quota ?? 0)}</span>}</span>
              {placementMode === "schema" && !isLabelObject && <span className="placement-node-meta"><span>{isRow ? groupName : `Группа: ${groupName}`}</span>{!isRow && !p.displayChildrenAsRows && p.quota !== null && <span className="placement-node-seat-count">{seatCountLabel(p.quota ?? 0)}</span>}</span>}
            </button>
          </div>
          {p.quota !== null && p.quota > 0 && <div className={`placement-seats${isRow ? " placement-row-seats" : " placement-table-seats"}`} role="img" aria-label={`Места: занято ${p.guestCount} из ${p.quota}`} title={`Занято: ${p.guestCount}. Свободно: ${Math.max(0, p.quota - p.guestCount)}.`}>
            {Array.from({ length: Math.min(p.quota, 50) }, (_, i) => {
              const selectedSeatNumber = i + 1;
              const selectedSeatLabel = seatLabel(p, selectedSeatNumber);
              const occupied = occupiedSeats.has(selectedSeatNumber);
              const isFocusedSeat = focusedSeat?.placementId === p.id && focusedSeat.seatNumber === selectedSeatNumber;
              const popoverVisible = seatPopover?.placementId === p.id && seatPopover.seatNumber === selectedSeatNumber;
              const angle = (Math.PI * 2 * i) / Math.min(p.quota!, 50) - Math.PI / 2;
              const seatStyle = isRow ? undefined : { left: `calc(50% + ${Math.cos(angle) * tableRadius}px - ${rowSeatWidth(p) / 2}px)`, top: `calc(50% + ${Math.sin(angle) * tableRadius}px - 14px)` };
              return <span key={i} className="placement-seat-wrap" style={seatStyle} onMouseEnter={() => { if (canSeatGuests && occupied) void showSeatPopover(p, selectedSeatNumber); }} onMouseLeave={() => hideSeatPopover(p.id, selectedSeatNumber)}>
                <button type="button" data-seat-number={selectedSeatNumber} className={`placement-seat${occupied ? " placement-seat-occupied" : ""}${isFocusedSeat ? " placement-seat-focused" : ""}`} disabled={!canSeatGuests && !canEditSeatLabels} aria-label={canSeatGuests ? occupied ? `Редактировать гостя на месте ${selectedSeatLabel}` : `Добавить гостя на место ${selectedSeatLabel}` : `Изменить название места ${selectedSeatLabel}`} title={canSeatGuests ? `${selectedSeatLabel}: ${occupied ? "редактировать гостя" : "добавить гостя"}` : canEditSeatLabels ? `${selectedSeatLabel}: изменить название` : selectedSeatLabel} onClick={e => { e.stopPropagation(); void openSeatForm(p, selectedSeatNumber); }}>{selectedSeatLabel}</button>
                {popoverVisible && <span className="placement-seat-popover" role="status"><strong>{seatPopover.guest.name}</strong><small>{seatPopover.guest.categoryName ?? "Без категории"}</small><button type="button" aria-label="Закрыть информацию о госте" title="Закрыть" onClick={e => { e.stopPropagation(); dismissedSeatPopover.current = seatPopoverKey(p.id, selectedSeatNumber); setSeatPopover(null); }}>×</button></span>}
              </span>;
            })}
            {isRow && p.quota > 50 && <span className="placement-seats-more">Ещё {p.quota - 50} мест</span>}
          </div>}
          {canEditStructure && isSelected && p.isRow && <button type="button" className="placement-container-resize-handle placement-row-rotate-handle" data-placement-control title="Повернуть ряд" aria-label={`Повернуть ряд ${p.name}`} onPointerDown={e => startRowRotation(e, p)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7" /></svg></button>}
          {canEditStructure && isSelected && p.displayChildrenAsRows && (["nw", "ne", "sw", "se"] as const).map(corner => <button key={corner} type="button" className={`placement-container-resize-handle placement-container-resize-${corner}`} data-placement-control title={`Изменить размер: ${resizeCornerLabels[corner]}`} aria-label={`Изменить размер контейнера ${p.name}: ${resizeCornerLabels[corner]}`} onPointerDown={e => startContainerResize(e, p, layout, corner)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 9 4 4m0 0h5M4 4v5m11 6 5 5m0 0h-5m5 0v-5" /></svg></button>)}
          {canEditStructure && isSelected && (!isGrouped || isBatchLeader) && <div className={`group-tree-node-actions placement-node-actions${isGrouped ? " placement-group-actions" : ""}`} data-placement-control style={isGrouped ? { left: groupBounds.left + (groupBounds.right - groupBounds.left) / 2 - x, top: groupBounds.bottom - y + 8 } : undefined}>
              <button className="icon-button icon-button-danger" type="button" onPointerDown={e => e.stopPropagation()} onClick={() => remove(p.id)} aria-label={`Удалить объект ${p.name}`} title="Удалить объект">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21a2 2 0 0 1-2-2V6h14v13a2 2 0 0 1-2 2H7Zm1-3h2V9H8v9Zm6 0h2V9h-2v9ZM4 5V3h5l1-1h4l1 1h5v2H4Z" /></svg>
              </button>
              {p.parentId !== null && (!isGrouped || isBatchLeader) && <button className="icon-button" data-placement-control type="button" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); detachFromContainer(p); }} aria-label={`Вынести ${p.name} из контейнера`} title="Вынести из контейнера"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13v7h16v-7M12 16V3m0 0L7 8m5-5 5 5" /></svg></button>}
              {isGrouped && <button type="button" className="icon-button placement-ungroup-button" aria-label="Разгруппировать объекты" title="Разгруппировать" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); void act(async () => { setItems(await apiClient.ungroupPlacementRows(eventId, p.rowBatchId!)); }); }}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /><path d="M14 4h6v6m0-6-7 7M4 14v6h6m-6 0 7-7" /></svg></button>}
          </div>}
      </div>;
    })}
      {alignmentGuides.vertical && <div className="placement-alignment-guide placement-alignment-guide-vertical" style={{ left: alignmentGuides.vertical.position, top: alignmentGuides.vertical.start, height: Math.max(1, alignmentGuides.vertical.end - alignmentGuides.vertical.start) }} />}
      {alignmentGuides.horizontal && <div className="placement-alignment-guide placement-alignment-guide-horizontal" style={{ left: alignmentGuides.horizontal.start, top: alignmentGuides.horizontal.position, width: Math.max(1, alignmentGuides.horizontal.end - alignmentGuides.horizontal.start) }} />}
    </div>;
  };

  const canvasPointAtPointer = (element: HTMLDivElement, clientX: number, clientY: number) => {
    const rect = element.getBoundingClientRect();
    const scaleX = rect.width / element.offsetWidth || 1;
    const scaleY = rect.height / element.offsetHeight || 1;
    return {
      x: (clientX - rect.left) / scaleX + element.scrollLeft,
      y: (clientY - rect.top) / scaleY + element.scrollTop
    };
  };

  const selectionBoxAtPointer = (element: HTMLDivElement, start: { x: number; y: number }, clientX: number, clientY: number) => {
    const { x, y } = canvasPointAtPointer(element, clientX, clientY);
    return { left: Math.min(start.x, x), top: Math.min(start.y, y), width: Math.abs(x - start.x), height: Math.abs(y - start.y) };
  };

  const resizedContainerAtPointer = (resize: PlacementResize, clientX: number, clientY: number): Placement => {
    const renderedScale = renderedElementScale(canvas.current);
    const dx = (clientX - resize.pointerX) / (zoom * renderedScale.x);
    const dy = (clientY - resize.pointerY) / (zoom * renderedScale.y);
    const right = resize.containerX + resize.width;
    const bottom = resize.containerY + resize.height;
    const resizeFromLeft = resize.corner === "nw" || resize.corner === "sw";
    const resizeFromTop = resize.corner === "nw" || resize.corner === "ne";
    const canvasX = resizeFromLeft ? Math.max(0, Math.min(right - 250, Math.round(resize.containerX + dx))) : resize.containerX;
    const canvasY = resizeFromTop ? Math.max(0, Math.min(bottom - 92, Math.round(resize.containerY + dy))) : resize.containerY;
    return {
      ...resize.item,
      canvasX,
      canvasY,
      canvasWidth: resizeFromLeft ? right - canvasX : Math.max(250, Math.round(resize.width + dx)),
      canvasHeight: resizeFromTop ? bottom - canvasY : Math.max(92, Math.round(resize.height + dy))
    };
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = canvas.current;
    if (!el) return;

    const rotation = placementRotation.current;
    if (rotation) {
      if (rotation.didRotate || Math.hypot(e.clientX - rotation.pointerX, e.clientY - rotation.pointerY) >= 4) {
        rotation.didRotate = true;
        const rotated = rotatedRowsAtPointer(rotation, e.clientX, e.clientY);
        setItems(current => current.map(item => rotated.get(item.id) ?? item));
      }
      return;
    }
    const resize = placementResize.current;
    if (resize) {
      if (resize.didResize || Math.hypot(e.clientX - resize.pointerX, e.clientY - resize.pointerY) >= 4) {
        resize.didResize = true;
        const resized = resizedContainerAtPointer(resize, e.clientX, e.clientY);
        setItems(current => current.map(item => item.id === resized.id ? resized : item));
      }
      return;
    }

    const move = selectedMove.current;
    if (move) {
      const renderedScale = renderedElementScale(el);
      const rawDx = (e.clientX - move.x) / (zoom * renderedScale.x);
      const rawDy = (e.clientY - move.y) / (zoom * renderedScale.y);
      if (move.didMove || Math.hypot(e.clientX - move.x, e.clientY - move.y) >= 6) {
        move.didMove = true;
        const aligned = alignmentForMove(move, rawDx, rawDy, true);
        const target = dropContainerAtPoint(move, e.clientX, e.clientY, aligned.dx, aligned.dy);
        dropContainer.current = target?.id ?? null;
        setDropTarget(dropContainer.current);
        setAlignmentGuides(aligned.guides);
        previewPlacementMove(move, aligned.dx, aligned.dy, target);
      }
    }

    if (selectionStart.current) {
      const nextSelectionBox = selectionBoxAtPointer(el, selectionStart.current, e.clientX, e.clientY);
      selectionBoxRef.current = nextSelectionBox;
      setSelectionBox(nextSelectionBox);
    }
    if (pan.current) {
      const renderedScale = renderedElementScale(el);
      el.scrollLeft = pan.current.left - (e.clientX - pan.current.x) / renderedScale.x;
      el.scrollTop = pan.current.top - (e.clientY - pan.current.y) / renderedScale.y;
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const rotation = placementRotation.current;
    placementRotation.current = null;
    if (rotation) {
      if (rotation.didRotate) {
        suppressNodeClick.current = true;
        window.setTimeout(() => { suppressNodeClick.current = false; }, 0);
        const rotated = rotatedRowsAtPointer(rotation, e.clientX, e.clientY);
        void act(async () => {
          try { setItems(await apiClient.rotatePlacementRows(eventId, [...rotated.values()].map(item => ({ id: item.id, rotation: item.rotation ?? 0 })))); }
          catch (err) { const originals = new Map(rotation.members.map(item => [item.id, item])); setItems(current => current.map(value => originals.get(value.id) ?? value)); throw err; }
        });
      }
      return;
    }
    const resized = placementResize.current;
    placementResize.current = null;
    if (resized) {
      selectionStart.current = null;
      selectionBoxRef.current = null;
      setSelectionBox(null);
      pan.current = null;
      if (resized.didResize) {
        suppressNodeClick.current = true;
        window.setTimeout(() => { suppressNodeClick.current = false; }, 0);
        const item = resizedContainerAtPointer(resized, e.clientX, e.clientY);
        void act(async () => setItems(await apiClient.updatePlacement(eventId, item.id, { ...item, preserveRowBatch: !!item.rowBatchId })));
      }
      return;
    }

    const moved = selectedMove.current;
    const finalTarget = moved?.didMove ? dropContainerAtPoint(moved, e.clientX, e.clientY) : null;
    // Pointer capture on a rotated node can change the element reported under the
    // cursor on pointerup. Keep the target that was already validated and shown.
    const parentId = dropContainer.current ?? finalTarget?.id ?? null;
    selectedMove.current = null;
    dropContainer.current = null;
    setDropTarget(null);
    setAlignmentGuides({ vertical: null, horizontal: null });

    if (moved?.didMove) {
      suppressNodeClick.current = true;
      window.setTimeout(() => { suppressNodeClick.current = false; }, 0);
      void act(() => persistPlacementMove(moved, parentId));
    }
    const currentSelectionBox = selectionStart.current && canvas.current
      ? selectionBoxAtPointer(canvas.current, selectionStart.current, e.clientX, e.clientY)
      : selectionBoxRef.current;
    if (!moved?.didMove && currentSelectionBox && currentSelectionBox.width < 4 && currentSelectionBox.height < 4) {
      setPlacementSelection(new Set());
    } else if (!moved?.didMove && currentSelectionBox && canvas.current) {
      const selected = new Set<number>();
      canvas.current.querySelectorAll<HTMLElement>("[data-placement-id]").forEach(node => {
        const rect = node.getBoundingClientRect();
        const topLeft = canvasPointAtPointer(canvas.current!, rect.left, rect.top);
        const bottomRight = canvasPointAtPointer(canvas.current!, rect.right, rect.bottom);
        const left = topLeft.x;
        const top = topLeft.y;
        const right = bottomRight.x;
        const bottom = bottomRight.y;
        const intersects = left < currentSelectionBox.left + currentSelectionBox.width
          && right > currentSelectionBox.left
          && top < currentSelectionBox.top + currentSelectionBox.height
          && bottom > currentSelectionBox.top;
        if (intersects) selected.add(Number(node.dataset.placementId));
      });
      setPlacementSelection(selected);
    }
    selectionStart.current = null;
    selectionBoxRef.current = null;
    setSelectionBox(null);
    pan.current = null;
  };

  const handleCanvasPointerCancel = () => {
    const rotation = placementRotation.current;
    placementRotation.current = null;
    if (rotation?.didRotate) { const originals = new Map(rotation.members.map(item => [item.id, item])); setItems(current => current.map(item => originals.get(item.id) ?? item)); }
    const resized = placementResize.current;
    placementResize.current = null;
    if (resized?.didResize) setItems(current => current.map(item => item.id === resized.item.id ? resized.item : item));
    selectedMove.current = null;
    dropContainer.current = null;
    setDropTarget(null);
    selectionStart.current = null;
    selectionBoxRef.current = null;
    setSelectionBox(null);
    setAlignmentGuides({ vertical: null, horizontal: null });
    pan.current = null;
  };

  useEffect(() => {
    const onPlacementArrowKey = (event: KeyboardEvent) => {
      if (!canEditStructure || busy || !selectedIds.size || event.ctrlKey || event.metaKey || event.altKey || formOpen || templateMode || confirmation || seatPlacement) return;
      const direction = event.key === "ArrowLeft" ? { x: -1, y: 0 }
        : event.key === "ArrowRight" ? { x: 1, y: 0 }
          : event.key === "ArrowUp" ? { x: 0, y: -1 }
            : event.key === "ArrowDown" ? { x: 0, y: 1 }
              : null;
      if (!direction) return;
      const target = event.target as HTMLElement | null;
      const interactive = target?.closest("input, textarea, select, button, a, [contenteditable='true']");
      if (interactive && !target?.closest(".placement-object-list-item")) return;
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      let move = keyboardMove.current;
      if (!move) {
        const created = createPlacementMove(new Set(selectedIds));
        if (!created) return;
        move = { ...created, saveTimer: null };
        keyboardMove.current = move;
      }
      move.didMove = true;
      const nextDx = move.appliedDx + direction.x * step;
      const nextDy = move.appliedDy + direction.y * step;
      const aligned = alignmentForMove(move, nextDx, nextDy, false);
      setAlignmentGuides(aligned.guides);
      previewPlacementMove(move, aligned.dx, aligned.dy);
      if (move.saveTimer !== null) window.clearTimeout(move.saveTimer);
      move.saveTimer = window.setTimeout(() => {
        if (keyboardMove.current !== move) return;
        keyboardMove.current = null;
        setAlignmentGuides({ vertical: null, horizontal: null });
        void act(() => persistPlacementMove(move, null));
      }, 280);
    };
    window.addEventListener("keydown", onPlacementArrowKey);
    return () => window.removeEventListener("keydown", onPlacementArrowKey);
  }, [busy, canEditStructure, confirmation, formOpen, items, seatPlacement, selectedIds, templateMode, zoom]);
  useEffect(() => () => {
    const timer = keyboardMove.current?.saveTimer;
    if (timer !== null && timer !== undefined) window.clearTimeout(timer);
  }, []);

  return <div className="tab-content">
    <div className="section-heading canvas-section-heading">
      <div className="section-title-row">
        <h2>{placementMode === "schema" ? "Редактирование схемы размещения" : "Рассадка гостей"}</h2>
      </div>
      <div className="section-actions placement-page-actions">
        {placementMode === "seating" && canManage && !mobileOnlySeating && <button className="danger-button" disabled={busy} onClick={() => { seatViewport.current = null; setPlacementMode("schema"); setPlacementSelection(new Set()); setSeatPlacement(null); setSearch(""); setFocusedSeatedGuestId(null); setFocusedSeat(null); }}>Редактировать схему размещения</button>}
        {placementMode === "schema" && <>{canEditStructure && <button className="placement-reset-button" disabled={busy || !items.length} onClick={() => remove(null)}>Сбросить</button>}
          <button className="danger-button" disabled={busy} onClick={() => { setPlacementMode("seating"); setPlacementSelection(new Set()); setFormOpen(false); setSearch(""); setFocusedPlacementId(null); }}>Вернуться к рассадке</button></>}
      </div>
    </div>
    {placementMode === "schema" && canManage && <div className={`placement-edit-lock-banner${placementEditLock?.isOwnedByCurrentUser ? " owned" : " blocked"}`}>
      <div><strong>{placementEditLockLoading && !placementEditLock ? "Получаем доступ к редактированию..." : placementEditLock?.isOwnedByCurrentUser ? "Вы редактируете схему" : placementEditLock?.isLocked ? `Схему редактирует ${placementEditLock.editorName ?? "другой пользователь"}` : "Ожидаем освобождения схемы"}</strong>{placementEditLock?.isOwnedByCurrentUser && <small>Доступ продлевается автоматически, пока открыта эта вкладка.</small>}</div>
      {!placementEditLockLoading && placementEditLock?.isLocked && !placementEditLock.isOwnedByCurrentUser && <button type="button" className="danger-button" disabled={busy} onClick={requestPlacementEditTakeover}>Перехватить редактирование</button>}
    </div>}
    {placementMode === "schema" && placementEditLockError && <div className="alert alert-error" role="alert">{placementEditLockError}</div>}
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    {archived && <div className="alert alert-info">Мероприятие завершено. Структура доступна для просмотра.</div>}
    <section className="panel">
      <div className="placement-toolbar"><input className="placement-search-input" type="search" placeholder={placementMode === "schema" ? "Поиск по названию" : "Поиск по гостям"} aria-label={placementMode === "schema" ? "Поиск объектов" : "Поиск посаженных гостей"} value={search} onChange={e => setSearch(e.target.value)} />
        {canEditStructure && <div className="group-template-actions placement-template-actions">
          <button type="button" className="icon-button placement-template-icon-button" title="Сохранить схему как шаблон" aria-label="Сохранить схему как шаблон" disabled={busy || loading || !items.length} onClick={() => { setTemplateName(""); setTemplateMode("save"); }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h11l3 3v15H5V3Z" /><path d="M8 3v6h8V4M8 21v-7h8v7" /></svg></button>
          <button type="button" className="icon-button placement-template-icon-button" title="Загрузить схему из шаблона" aria-label="Загрузить схему из шаблона" disabled={busy} onClick={() => void act(async () => { setTemplates(await apiClient.placementTemplates(eventId)); setTemplateId(""); setTemplateMode("load"); })}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h7l2 2h9v12H3V6Z" /><path d="M12 11v6m0 0-3-3m3 3 3-3" /></svg></button>
        </div>}
      </div>
      <div className={`placement-tree-view${canEditStructure && selectedPropertiesTarget && propertyFormKey === selectedPropertiesTarget.key ? " placement-tree-view-with-properties" : ""}`}>
        {canEditStructure && <aside className="placement-schema-toolbar" aria-label="Создание объектов">
          <button type="button" className="icon-button" title="Создать контейнер" aria-label="Создать контейнер" onClick={() => openCreate("container")}><svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3.5" y="5" width="25" height="22" rx="3" /><path d="M8 10h16M9 16h5v5H9zm9 0h5v5h-5z" /></svg></button>
          <button type="button" className="icon-button" title="Создать ряд" aria-label="Создать ряд" onClick={() => openCreate("row")}><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 22h24M6 22v4m20-4v4" /><rect x="5" y="10" width="5" height="8" rx="1.5" /><rect x="13.5" y="10" width="5" height="8" rx="1.5" /><rect x="22" y="10" width="5" height="8" rx="1.5" /></svg></button>
          <button type="button" className="icon-button" title="Создать стол" aria-label="Создать стол" onClick={() => openCreate("table")}><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="7" /><rect x="13" y="2.5" width="6" height="5" rx="1.5" /><rect x="13" y="24.5" width="6" height="5" rx="1.5" /><rect x="2.5" y="13" width="5" height="6" rx="1.5" /><rect x="24.5" y="13" width="5" height="6" rx="1.5" /></svg></button>
          <button type="button" className="icon-button" title="Создать текст" aria-label="Создать текст" onClick={() => openCreate("label")}><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 8h20M16 8v17M10 25h12" /><path d="M11 8 7 15m14-7 4 7" /></svg></button>
        </aside>}
        {placementMode === "schema" ? <aside className={`placement-object-list placement-object-list-with-toolbar${objectListCollapsed ? " collapsed" : ""}`} aria-label="Объекты на схеме">
          <div className="placement-object-list-header">
            {!objectListCollapsed && <strong>Объекты: {filteredPlacements.length}</strong>}
            <button type="button" className="icon-button" title={objectListCollapsed ? "Развернуть список объектов" : "Свернуть список объектов"} aria-label={objectListCollapsed ? "Развернуть список объектов" : "Свернуть список объектов"} onClick={() => setObjectListCollapsed(value => !value)}>{objectListCollapsed ? "›" : "‹"}</button>
          </div>
          {!objectListCollapsed && <div className="placement-object-list-items">
            {objectListHierarchy.roots.map(placement => renderObjectListPlacement(placement))}
          </div>}
        </aside> : <aside className={`placement-object-list${objectListCollapsed ? " collapsed" : ""}`} aria-label="Посаженные гости">
          <div className="placement-object-list-header">
            {!objectListCollapsed && <strong>Посажено: {filteredSeatedGuests.length}</strong>}
            <button type="button" className="icon-button" title={objectListCollapsed ? "Развернуть список гостей" : "Свернуть список гостей"} aria-label={objectListCollapsed ? "Развернуть список гостей" : "Свернуть список гостей"} onClick={() => setObjectListCollapsed(value => !value)}>{objectListCollapsed ? "›" : "‹"}</button>
          </div>
          {!objectListCollapsed && <div className="placement-object-list-items">
            {seatedGuestsLoading && <div className="placement-object-list-status">Загрузка гостей...</div>}
            {!seatedGuestsLoading && seatedGuestsError && <div className="placement-object-list-status placement-object-list-error" role="alert">{seatedGuestsError}</div>}
            {!seatedGuestsLoading && !seatedGuestsError && filteredSeatedGuests.map(guest => {
              const placement = items.find(item => item.id === guest.placementId);
              if (!placement || guest.seatNumber === null) return null;
              return <div className="placement-object-list-row" key={guest.id}>
                <button type="button" className={`placement-object-list-item${focusedSeatedGuestId === guest.id ? " selected" : ""}`} onClick={() => focusSeatedGuest(guest)}><span>{guest.name}</span><small>{placement.name} · {seatLabel(placement, guest.seatNumber)}</small></button>
              </div>;
            })}
          </div>}
        </aside>}
        <div className="placement-canvas" ref={canvas}
        onWheel={e => { e.preventDefault(); const el = e.currentTarget; const rect = el.getBoundingClientRect(); const nextZoom = Math.min(2, Math.max(.05, +(zoom + (e.deltaY < 0 ? .1 : -.1)).toFixed(2))); zoomPlacementAt(nextZoom, e.clientX - rect.left, e.clientY - rect.top); }}
        onDragOver={e => { if (canEditStructure && !busy && drag.current !== null) e.preventDefault(); }}
        onDrop={dropOnCanvas}
        onContextMenu={e => e.preventDefault()}
        onPointerDown={e => { const el = canvas.current!; const target = e.target as HTMLElement; if ((e.pointerType === "touch" && !target.closest(".placement-seat")) || e.button === 2) { pan.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }; el.setPointerCapture(e.pointerId); return; } if (target.closest(".placement-node")) return; if (e.button === 0 && canEditStructure) { selectionStart.current = canvasPointAtPointer(el, e.clientX, e.clientY); const initialSelectionBox = { left: selectionStart.current.x, top: selectionStart.current.y, width: 0, height: 0 }; selectionBoxRef.current = initialSelectionBox; setSelectionBox(initialSelectionBox); } el.setPointerCapture(e.pointerId); }}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerCancel}>
          {loading ? <div className="empty-state">Загрузка...</div> : items.length === 0 ? <div className="empty-state">Создайте первый объект или загрузите шаблон.</div> : <>
            <div className="placement-tree placement-free-tree" style={{ zoom }}>{renderNodes()}</div>
            {placementMode === "seating" && !hasSeatPlacements && <div className="placement-seating-empty-note">{mobileOnlySeating ? "Схема размещения пока не содержит мест." : "Схема размещения пока не содержит мест. Перейдите к редактированию схемы размещения, чтобы добавить объекты."}</div>}
          </>}
          {selectionBox && <div className="placement-selection-box" style={selectionBox} />}
        </div>
        {canEditStructure && selectedPropertiesTarget && propertyFormKey === selectedPropertiesTarget.key && <aside className="placement-properties-panel" aria-label="Свойства объекта размещения">
          {(selectedPropertiesTarget.isRowBatch || selectedPropertiesTarget.isGroup) && <header className="placement-properties-header"><h2>{selectedPropertiesTarget.isRowBatch ? "Группа рядов" : "Свойства группы"}</h2></header>}
          <div className="placement-properties-form">
            {propertyForm.placementType === "label" && <div className="placement-properties-object-type">Тип объекта: <strong>Текст</strong></div>}
            {(!selectedPropertiesTarget.isGroup || selectedPropertiesTarget.isRowBatch) && <label className="field"><span>{propertyForm.placementType === "label" ? "Текст" : "Название"}</span><input maxLength={140} required disabled={!canManage || busy} value={propertyForm.name} onChange={e => changeProperties({ name: e.target.value })} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} /></label>}
        {propertyForm.placementType !== "label" && <label className="field"><span>Группа *</span><select required disabled={!canManage || busy} value={propertyForm.groupId} onChange={e => changeProperties({ groupId: e.target.value })}><option value="">Выберите группу</option>{flatGroups.map(group => <option key={group.id} value={group.id}>{"— ".repeat(group.level)}{group.name}</option>)}</select></label>}
            <div className="field placement-color-field"><span>{propertyForm.placementType === "label" ? "Цвет текста" : "Цвет объекта"}</span><div className="placement-color-picker-row">
              <input className="placement-color-input" type="color" value={propertyForm.color || (propertyForm.placementType === "label" ? "#34405a" : defaultPlacementColor)} disabled={!canManage || busy} aria-label="Выбрать цвет объекта" onChange={e => changeProperties({ color: e.target.value })} />
              <button type="button" className="secondary-button" disabled={!canManage || busy || !propertyForm.color} onClick={() => changeProperties({ color: "" })}>Стандартный</button>
            </div></div>
            {propertyForm.placementType === "label" && <label className="field"><span>Размер шрифта, px</span><input type="number" min={8} max={200} required disabled={busy} value={propertyForm.fontSize} onChange={e => changeProperties({ fontSize: e.target.value })} /></label>}
            {propertyForm.placementType !== "label" && <section className={`placement-seat-settings${propertyForm.noQuota ? " placement-seat-settings-disabled" : ""}`} aria-disabled={propertyForm.noQuota}>
              <h3>Настройки мест</h3>
              {!propertyForm.noQuota && <label className="field"><span>Количество мест</span><input type="number" min={propertyForm.placementType === "row" ? 1 : 0} max={50} required disabled={!canManage || busy} value={propertyForm.quota} onChange={e => changeProperties({ quota: e.target.value })} /></label>}
              {(propertyForm.placementType === "row" || propertyForm.placementType === "table") && <SeatNumberingSettings form={propertyForm} disabled={!canManage || busy} onChange={changeProperties} />}
            </section>}
            <div className="placement-properties-actions"><button type="button" className="primary-button" disabled={!canManage || busy || !propertyFormDirty || !propertyFormValid} onClick={() => saveProperties(propertyForm, selectedPropertiesTarget)}>{busy ? "Применяем..." : "Применить"}</button></div>
          </div>
        </aside>}
        <div className="placement-canvas-controls">
          <div className="groups-tree-zoom-actions" aria-label="Масштаб размещения">
            <button className="groups-tree-scroll-button placement-focus-button" type="button" disabled={!items.length} title="Показать всю схему" aria-label="Показать всю схему" onClick={() => focusAllPlacements()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H4v5m11-5h5v5m0 6v5h-5m-6 0H4v-5M9 9h6v6H9z" /></svg></button>
            <button className="groups-tree-scroll-button" type="button" disabled={zoom >= 2} title="Увеличить масштаб" aria-label="Увеличить масштаб" onClick={() => zoomPlacementFromCenter(1)}>+</button>
            <button className="groups-tree-scroll-button" type="button" disabled={zoom <= .05} title="Уменьшить масштаб" aria-label="Уменьшить масштаб" onClick={() => zoomPlacementFromCenter(-1)}>−</button>
          </div>
          {canEditStructure && (canGroupSelection || selectedBatchIds.length > 0) && <div className="placement-selection-actions">
            {canGroupSelection && <button type="button" className="secondary-button" title="Сгруппировать" aria-label="Сгруппировать выбранные объекты" disabled={busy} onClick={() => void act(async () => { const groupedIds = [...selectedIds]; const list = await apiClient.groupPlacementRows(eventId, groupedIds); setItems(list); const batchId = list.find(item => groupedIds.includes(item.id))?.rowBatchId; setPlacementSelection(batchId ? new Set(list.filter(item => item.rowBatchId === batchId).map(item => item.id)) : new Set(groupedIds)); })}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" stroke-dasharray="3 3" /><rect x="7" y="7" width="6" height="6" rx="1.5" /><rect x="11" y="11" width="6" height="6" rx="1.5" /></svg></button>}
            {selectedBatchIds.length > 0 && <button type="button" className="secondary-button" title="Разгруппировать" aria-label="Разгруппировать выбранные объекты" disabled={busy} onClick={() => void act(async () => {
              for (const batchId of selectedBatchIds) setItems(await apiClient.ungroupPlacementRows(eventId, batchId));
            })}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /><path d="M14 4h6v6m0-6-7 7M4 14v6h6m-6 0 7-7" /></svg></button>}
          </div>}
        </div>
      </div>
    </section>

    {formOpen && creationType && <Modal className="placement-modal" title="Создать объекты размещения" onClose={() => { if (!busy) setFormOpen(false); }}>
      {error && <div className="alert alert-error">{error}</div>}
      {tab === "main" || !showGuestsTab ? <form className="form" onSubmit={save}>
        {showGuestsTab && <div className="placement-form-header-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => setTab("guests")}>Гости ({editing?.guestCount ?? 0})</button></div>}
        <label className="field"><span>{isLabel ? "Текст" : "Название"}</span><input maxLength={140} required value={form.name} disabled={!canManage || busy} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        {!isLabel && <label className="field"><span>Группа *</span><select required disabled={!canManage || busy} value={form.groupId} onChange={e => setForm({ ...form, groupId: e.target.value })}><option value="">Выберите группу</option>{flatGroups.map(g => <option key={g.id} value={g.id}>{"— ".repeat(g.level)}{g.name}</option>)}</select></label>}
        <div className="field placement-color-field"><span>{isLabel ? "Цвет текста" : "Цвет объекта"}</span><div className="placement-color-picker-row">
          <input className="placement-color-input" type="color" value={form.color || (isLabel ? "#34405a" : defaultPlacementColor)} disabled={!canManage || busy} aria-label="Выбрать цвет объекта" onChange={e => setForm({ ...form, color: e.target.value })} />
          <button type="button" className="secondary-button" disabled={!canManage || busy || !form.color} onClick={() => setForm({ ...form, color: "" })}>Стандартный</button>
        </div></div>
        {creationType ? <div className="placement-type-note">Тип объекта: {creationType === "container" ? "контейнер без мест" : creationType === "row" ? "ряд" : creationType === "label" ? "текст" : "стол"}</div> : <fieldset className="placement-type-flags" disabled={!canManage || busy}><legend>Тип объекта</legend>
          <label><input type="radio" name="placement-type" disabled={!!editing && isRow} checked={form.placementType === "container"} onChange={() => setForm({ ...form, placementType: "container", displayChildrenAsRows: true, noQuota: true, count: 1, startNumber: 1 })} /> Контейнер (без мест)</label>
          <label><input type="radio" name="placement-type" checked={form.placementType === "row"} onChange={() => setForm({ ...form, placementType: "row", displayChildrenAsRows: false, noQuota: false, quota: Number(form.quota) > 0 ? form.quota : "10" })} /> Тип ряд</label>
          <label><input type="radio" name="placement-type" checked={form.placementType === "table"} onChange={() => setForm({ ...form, placementType: "table", displayChildrenAsRows: false, noQuota: false, quota: Number(form.quota) > 0 ? form.quota : "10" })} /> Тип стол</label>
          <label><input type="radio" name="placement-type" checked={form.placementType === "label"} onChange={() => setForm({ ...form, placementType: "label", displayChildrenAsRows: false, noQuota: true, count: 1, startNumber: 1 })} /> Текст</label>
        </fieldset>}
        {isLabel && <label className="field"><span>Размер шрифта, px</span><input type="number" min={8} max={200} required disabled={busy} value={form.fontSize} onChange={e => setForm({ ...form, fontSize: e.target.value })} /></label>}
        {!isLabel && <section className={`placement-seat-settings${isHall ? " placement-seat-settings-disabled" : ""}`} aria-disabled={isHall}>
          <h3>Настройки мест</h3>
          {!editing && !isHall && <label className="field"><span>{isRow ? "Количество рядов" : "Количество столов"}</span><input type="number" min={1} max={100} required disabled={!canManage || busy} value={form.count} onChange={e => setForm({ ...form, count: Number(e.target.value) })} /></label>}
          {!isHall && <label className="field"><span>Количество мест</span><input type="number" min={isRow ? 1 : 0} max={50} required disabled={!canManage || busy} value={form.quota} onChange={e => setForm({ ...form, quota: e.target.value })} /></label>}
          {(isRow || form.placementType === "table") && <SeatNumberingSettings form={form} disabled={!canManage || busy} onChange={patch => setForm(current => ({ ...current, ...patch }))} />}
        </section>}
        <div className="modal-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setFormOpen(false)}>Закрыть</button>{canManage && <button className="primary-button" disabled={busy}>{busy ? "Сохраняем..." : editing ? "Сохранить" : "Создать"}</button>}</div>
      </form> : <div className="placement-guests">
        <div className="placement-form-header-actions"><button className="secondary-button" type="button" onClick={() => setTab("main")}>К объекту</button></div>
        {!guestReady && <div className="alert alert-info">Для назначения гостей сохраните группу и количество мест. Контейнер не принимает гостей.</div>}
        <input type="search" aria-label="Поиск гостей" placeholder="Поиск гостей" value={guestSearch} onChange={e => setGuestSearch(e.target.value)} />
        {guestLoading ? <p>Загрузка гостей...</p> : <div className="placement-guest-list">{guestList.filter(g => g.name.toLocaleLowerCase("ru-RU").includes(guestSearch.trim().toLocaleLowerCase("ru-RU"))).map(g => <div key={g.id} className="placement-guest-row"><div>{g.name}<small>{g.groupName}{g.placementId ? ` · ${items.find(p => p.id === g.placementId)?.name ?? "Размещён"}` : " · Без размещения"}</small></div><button type="button" disabled={!guestReady || busy || (g.placementId !== editing?.id && editing!.guestCount >= editing!.quota!)} onClick={() => void act(async () => { await apiClient.assignPlacement(eventId, editing!.id, g.id, g.placementId === editing!.id); const list = await apiClient.getPlacements(eventId); setItems(list); setEditing(list.find(p => p.id === editing!.id)!); setGuestVersion(v => v + 1); })}>{g.placementId === editing?.id ? "Снять" : g.placementId ? "Перенести сюда" : "Назначить"}</button></div>)}{!guestList.length && <p>Нет гостей в выбранной группе и её подгруппах.</p>}</div>}
        {canCreateGuest && <button className="secondary-button" disabled={!guestReady || busy || editing!.guestCount >= editing!.quota!} onClick={() => setShowNewGuest(v => !v)}>Создать нового гостя</button>}
        {showNewGuest && <form className="form" onSubmit={e => { e.preventDefault(); if (!guestReady) return; void act(async () => { await apiClient.createGuest(eventId, { name: newGuest.name.trim(), email: newGuest.email || undefined, phone: newGuest.phone || undefined, groupId: Number(form.groupId), categoryId: Number(newGuest.categoryId), placementId: editing!.id }); const list = await apiClient.getPlacements(eventId); setItems(list); setEditing(list.find(p => p.id === editing!.id)!); setGuestVersion(v => v + 1); setShowNewGuest(false); setNewGuest({ name: "", email: "", phone: "", categoryId: "" }); }); }}>
          <label className="field"><span>Имя</span><input required value={newGuest.name} onChange={e => setNewGuest({ ...newGuest, name: e.target.value })} /></label>
          <label className="field"><span>Email</span><input type="email" value={newGuest.email} onChange={e => setNewGuest({ ...newGuest, email: e.target.value })} /></label>
          <label className="field"><span>Телефон</span><input type="tel" value={newGuest.phone} onChange={e => setNewGuest({ ...newGuest, phone: e.target.value })} /></label>
          <label className="field"><span>Категория *</span><select required value={newGuest.categoryId} onChange={e => setNewGuest({ ...newGuest, categoryId: e.target.value })}><option value="">Выберите категорию</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <button className="primary-button" disabled={busy || !guestReady}>Создать и разместить</button>
        </form>}
      </div>}
    </Modal>}

    {seatPlacement && <Modal className="guest-form-modal seat-guest-modal" title={`Место ${seatLabel(seatPlacement, seatNumber!) || seatNumber} в ${seatPlacement.name}`} headerActions={placementMode === "seating" ? <button type="button" className="secondary-button" disabled={seatSaving || seatLabelSaving} onClick={openSeatNameEditor}>Изменить название места</button> : undefined} onClose={() => { if (seatNameEditorOpen) { setSeatNameEditorOpen(false); return; } if (!seatSaving && !seatLabelSaving) closeSeatForm(); }}>
      {seatError && <div className="alert alert-error">{seatError}</div>}
      {seatLoading ? <div className="empty-state">Загрузка данных гостя...</div> : <>
        {canSeatGuests && <>{!seatGuest ? <div className="seat-existing-guests">
          <input type="search" value={seatExistingSearch} onChange={e => { setSeatExistingSearch(e.target.value); setSeatExistingPage(1); }} placeholder="Поиск по ФИО или email (от 2 символов)" aria-label="Поиск гостей мероприятия" disabled={seatSaving} />
          <div className="seat-existing-guests-table-wrap"><table className="seat-existing-guests-table"><thead><tr><th>ФИО</th><th>Email</th><th></th></tr></thead><tbody>{(!seatExistingLoading && !seatExistingError ? seatExistingGuests : []).map(guest => <tr key={guest.id}><td>{guest.name}</td><td>{guest.email ?? "—"}</td><td><button type="button" className="secondary-button" disabled={seatSaving || !guest.categoryId} title={!guest.categoryId ? "У гостя не указана категория" : undefined} onClick={() => void assignExistingGuestToSeat(guest)}>{guest.placementId ? "Пересадить" : "Добавить"}</button></td></tr>)}{seatExistingLoading ? <tr><td colSpan={3}>Загрузка гостей...</td></tr> : seatExistingError ? <tr><td colSpan={3} role="alert">{seatExistingError}</td></tr> : seatExistingGuests.length === 0 && <tr><td colSpan={3}>{seatExistingSearch.trim() ? "Согласованные гости не найдены." : "Нет согласованных гостей, доступных для рассадки."}</td></tr>}</tbody></table></div>
          <div className="pagination-row"><span className="muted">{seatExistingLoading ? "Загрузка..." : `Всего: ${seatExistingTotal}`}</span><div className="pagination-actions"><button className="secondary-button pagination-button" type="button" disabled={seatSaving || seatExistingLoading || seatExistingPage <= 1} onClick={() => setSeatExistingPage(page => page - 1)}>Назад</button><span className="pagination-current">Страница {seatExistingPage} из {seatExistingTotalPages}</span><button className="secondary-button pagination-button" type="button" disabled={seatSaving || seatExistingLoading || seatExistingPage >= seatExistingTotalPages} onClick={() => setSeatExistingPage(page => page + 1)}>Вперёд</button></div></div>
        </div> : <form className="form guest-edit-form seat-guest-form" onSubmit={saveSeatGuest}>
        <aside className="organization-picker seat-organization-picker" aria-label="Оригинальная структура">
          <div className="organization-picker-header"><strong>Оригинальная структура</strong>{organizationTree && <span>{organizationTree.departmentsCount} отделов · {organizationTree.employeesCount} сотрудников</span>}</div>
          <input className="organization-picker-search" value={organizationSearch} onChange={e => setOrganizationSearch(e.target.value)} placeholder="Поиск отдела или сотрудника" disabled={seatSaving || organizationLoading} />
          {organizationLoading ? <div className="organization-picker-message">Загружаем структуру...</div> : organizationError ? <div className="organization-picker-message error-text">{organizationError}</div> : !organizationTree ? <div className="organization-picker-message">Структура не загружена.</div> : <ul className="org-tree-list org-tree-root">{organizationTree.departments.filter(department => departmentMatchesSearch(department, normalizeSearch(organizationSearch))).map(department => <SeatOrganizationDepartment key={department.id} department={department} query={organizationSearch} depth={0} selectedId={selectedOrganizationEmployeeId} onSelect={employee => { setSelectedOrganizationEmployeeId(employee.id); setSeatForm(current => ({ ...current, name: employee.fullName })); }} />)}</ul>}
        </aside>
        <div className="seat-guest-main">
          <label className="field"><span>Имя</span><input required value={seatForm.name} disabled={seatSaving} onChange={e => setSeatForm({ ...seatForm, name: e.target.value })} /></label>
          <label className="field"><span>Email</span><input type="email" value={seatForm.email} disabled={seatSaving} onChange={e => setSeatForm({ ...seatForm, email: e.target.value })} /></label>
          <label className="field"><span>Телефон</span><input type="tel" value={seatForm.phone} disabled={seatSaving} onChange={e => setSeatForm({ ...seatForm, phone: e.target.value })} /></label>
          <label className="field"><span>Группа</span><select required value={seatForm.groupId} disabled={seatSaving} onChange={e => changeSeatGuestGroup(e.target.value)}>{flatGroups.filter(group => seatPlacement.groupId !== null && placementGroupScope(seatPlacement.groupId).has(group.id)).map(group => <option key={group.id} value={group.id}>{"— ".repeat(group.level)}{group.name}</option>)}</select></label>
          <label className="field"><span>Категория *</span><select required value={seatForm.categoryId} disabled={seatSaving} onChange={e => setSeatForm({ ...seatForm, categoryId: e.target.value })}><option value="">Выберите категорию</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{categories.length === 0 && <small>Сначала создайте категорию мероприятия.</small>}</label>
          <section className="seat-reassignment-fields" aria-labelledby="seat-reassignment-title">
            <h3 id="seat-reassignment-title">Размещение</h3>
            <div className="field seat-reassignment-picker"><span>Место</span><details ref={seatPlacementMenu} onKeyDown={event => { if (event.key === "Escape") { seatPlacementMenu.current?.removeAttribute("open"); event.currentTarget.querySelector<HTMLElement>("summary")?.focus(); } }}>
              <summary className={seatForm.placementId ? "" : "placeholder"} aria-label={`Выбранное место: ${reseatingValue}`} onClick={event => { if (seatSaving) event.preventDefault(); }}><span>{reseatingValue}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5" /></svg></summary>
              <div className="seat-reassignment-dropdown">{reseatingTree.roots.length > 0 ? <div className="seat-reassignment-tree placement-object-list-items" aria-label="Доступные места">{reseatingTree.roots.map(placement => renderReseatingTreePlacement(placement))}</div> : <div className="seat-reassignment-empty">Для группы гостя нет доступных свободных мест.</div>}</div>
            </details></div>
          </section>
        </div>
        <div className="modal-actions"><button className="primary-button" disabled={seatSaving || !seatForm.categoryId || !reseatingValid}>{seatSaving ? "Сохраняем..." : seatGuestMoving ? "Сохранить и пересадить" : "Сохранить"}</button></div>
      </form>}</>}
        {!canSeatGuests && <div className="empty-state">Редактирование гостей недоступно для вашей роли.</div>}
      </>}
    </Modal>}

    {seatNameEditorOpen && seatPlacement && seatNumber && <Modal className="seat-name-modal" title="Изменить название места" onClose={() => { if (!seatLabelSaving) setSeatNameEditorOpen(false); }}>
      {seatLabelError && <div className="alert alert-error">{seatLabelError}</div>}
      <form className="form seat-name-editor-form" onSubmit={e => { e.preventDefault(); void saveSeatLabel(); }}>
        <div className="field placement-seat-name-field">
          <span>Название места</span>
          <label className="placement-seat-name-toggle">
            <input type="checkbox" checked={seatWithoutName} disabled={seatLabelSaving} onChange={e => setSeatWithoutName(e.target.checked)} />
            <span>Без названия</span>
          </label>
          <input aria-label="Название места" maxLength={60} required={!seatWithoutName} value={seatLabelDraft} disabled={seatLabelSaving || seatWithoutName} onChange={e => setSeatLabelDraft(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" disabled={seatLabelSaving} onClick={() => setSeatNameEditorOpen(false)}>Закрыть</button>
          <button className="primary-button" disabled={seatLabelSaving || (!seatWithoutName && !seatLabelDraft.trim())}>{seatLabelSaving ? "Сохраняем..." : "Сохранить"}</button>
        </div>
      </form>
    </Modal>}

    {templateMode && <Modal title={templateMode === "save" ? "Сохранить шаблон размещения" : "Загрузить шаблон размещения"} onClose={() => { if (!busy) setTemplateMode(null); }}>
      {error && <div className="alert alert-error">{error}</div>}
      <form className="form" onSubmit={e => { e.preventDefault(); if (templateMode === "save") void act(async () => { await apiClient.savePlacementTemplate(eventId, templateName); setTemplateMode(null); }); else { setTemplateMode(null); setConfirmation({ text: `Текущая структура будет заменена. Размещение ${items.reduce((n, p) => n + p.guestCount, 0)} гостей будет снято. Новые объекты будут привязаны к корневой группе мероприятия. Продолжить?`, run: async () => { const list = await apiClient.applyPlacementTemplate(eventId, Number(templateId)); viewportInitializedFor.current = null; setSearch(""); setPlacementSelection(new Set()); setItems(list); setCollapsed(new Set()); setConfirmation(null); } }); } }}>
        {templateMode === "save" ? <label className="field"><span>Название шаблона</span><input required maxLength={150} value={templateName} onChange={e => setTemplateName(e.target.value)} /></label> : <label className="field"><span>Шаблон</span><select required value={templateId} onChange={e => setTemplateId(e.target.value)}><option value="">Выберите шаблон</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>{!templates.length && <small>Сохранённых шаблонов пока нет.</small>}</label>}
        <button className="primary-button" disabled={busy || (templateMode === "load" && !templateId)}>{templateMode === "save" ? "Сохранить" : "Загрузить"}</button>
      </form>
    </Modal>}
    {confirmation && <Modal title="Подтверждение" description={confirmation.text} onClose={() => { if (!busy) setConfirmation(null); }}>{error && <div className="alert alert-error">{error}</div>}<div className="modal-actions"><button className="secondary-button" disabled={busy} onClick={() => setConfirmation(null)}>Отмена</button><button className="danger-button" disabled={busy} onClick={() => void act(confirmation.run)}>Подтвердить</button></div></Modal>}
  </div>;
};

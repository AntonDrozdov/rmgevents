import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Modal } from "../components/Modal";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";
import { CategoryDto, GroupTreeDto, GuestDto, OrganizationDepartmentTreeItemDto, OrganizationEmployeeTreeItemDto, OrganizationStructureTreeDto } from "../types";
import { Placement, PlacementGuest, PlacementTemplate } from "../types/placements";
import { flattenGroups } from "../utils/groups";

const blank = (parentId = "") => ({ name: "", parentId, groupId: "", quota: "10", noQuota: false, displayChildrenAsRows: false, count: 1, startNumber: 1 });
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
  const [items, setItems] = useState<Placement[]>([]);
  const [groups, setGroups] = useState<GroupTreeDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(1);
  const [depth, setDepth] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Placement | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(blank());
  const [tab, setTab] = useState<"main" | "guests">("main");
  const [guestList, setGuestList] = useState<PlacementGuest[]>([]);
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestSearch, setGuestSearch] = useState("");
  const [guestVersion, setGuestVersion] = useState(0);
  const [newGuest, setNewGuest] = useState({ name: "", email: "", phone: "", categoryId: "" });
  const [showNewGuest, setShowNewGuest] = useState(false);
  const [templates, setTemplates] = useState<PlacementTemplate[]>([]);
  const [templateMode, setTemplateMode] = useState<"save" | "load" | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [confirmation, setConfirmation] = useState<{ text: string; run: () => Promise<void> } | null>(null);
  const [seatPlacement, setSeatPlacement] = useState<Placement | null>(null);
  const [seatNumber, setSeatNumber] = useState<number | null>(null);
  const [seatTab, setSeatTab] = useState<"new" | "existing">("existing");
  const [seatGuest, setSeatGuest] = useState<GuestDto | null>(null);
  const [seatExistingGuests, setSeatExistingGuests] = useState<GuestDto[]>([]);
  const [seatExistingLoading, setSeatExistingLoading] = useState(false);
  const [seatExistingSearch, setSeatExistingSearch] = useState("");
  const [seatLoading, setSeatLoading] = useState(false);
  const [seatSaving, setSeatSaving] = useState(false);
  const [seatError, setSeatError] = useState("");
  const [seatForm, setSeatForm] = useState({ name: "", email: "", phone: "", groupId: "", categoryId: "", tagIds: [] as number[] });
  const [organizationTree, setOrganizationTree] = useState<OrganizationStructureTreeDto | null>(null);
  const [organizationLoading, setOrganizationLoading] = useState(false);
  const [organizationError, setOrganizationError] = useState("");
  const [organizationSearch, setOrganizationSearch] = useState("");
  const [selectedOrganizationEmployeeId, setSelectedOrganizationEmployeeId] = useState<number | null>(null);
  const [seatPopover, setSeatPopover] = useState<{ placementId: number; seatNumber: number; guest: PlacementGuest } | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | "root" | null>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const dismissedSeatPopover = useRef<string | null>(null);
  const flatGroups = useMemo(() => flattenGroups(groups), [groups]);

  const load = async () => {
    const [list, groupTree, cats] = await Promise.all([apiClient.getPlacements(eventId), apiClient.getGroupTree(eventId), apiClient.getCategories(eventId)]);
    setItems(list); setGroups(groupTree); setCategories(cats);
  };
  useEffect(() => { setLoading(true); load().catch(e => setError(message(e))).finally(() => setLoading(false)); }, [eventId]);
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
    try { await action(); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  };
  const open = (p: Placement | null, parentId = "") => {
    setEditing(p); setForm(p ? { ...blank(), name: p.name, displayChildrenAsRows: p.displayChildrenAsRows, parentId: String(p.parentId ?? ""), groupId: String(p.groupId ?? ""), noQuota: p.quota === null, quota: String(p.quota ?? 10) } : blank(parentId));
    setTab("main"); setGuestSearch(""); setShowNewGuest(false); setNewGuest({ name: "", email: "", phone: "", categoryId: "" }); setError(""); setFormOpen(true);
  };
  const placementGroupScope = (groupId: number) => {
    const ids = new Set<number>();
    const addBranch = (group: GroupTreeDto) => { ids.add(group.id); group.children.forEach(addBranch); };
    const find = (nodes: GroupTreeDto[]) => nodes.forEach(group => { if (group.id === groupId) addBranch(group); else find(group.children); });
    find(groups);
    return ids;
  };
  const openSeatForm = async (placement: Placement, selectedSeatNumber: number) => {
    if (!canCreateGuest || !placement.groupId || seatLoading) return;
    setSeatPlacement(placement); setSeatNumber(selectedSeatNumber); setSeatTab("existing"); setSeatGuest(null); setSeatExistingGuests([]); setSeatExistingSearch(""); setSeatLoading(true); setSeatSaving(false); setSeatError(""); setOrganizationSearch(""); setSelectedOrganizationEmployeeId(null); setOrganizationError("");
    try {
      const [eligibleGuests, tree, eventGuests] = await Promise.all([apiClient.placementGuests(eventId, placement.groupId), apiClient.getOrganizationStructureTree(eventId), apiClient.getGuests(eventId, { page: 1, pageSize: 1000 })]);
      const occupantId = eligibleGuests.find(guest => guest.placementId === placement.id && guest.seatNumber === selectedSeatNumber)?.id;
      const guest = occupantId ? await apiClient.getGuest(eventId, occupantId) : null;
      setSeatGuest(guest);
      setSeatExistingGuests(eventGuests.items);
      setSeatForm(guest ? { name: guest.name, email: guest.email ?? "", phone: guest.phone ?? "", groupId: String(guest.groupId), categoryId: String(guest.categoryId ?? ""), tagIds: guest.tags.map(tag => tag.id) } : { name: "", email: "", phone: "", groupId: String(placement.groupId), categoryId: "", tagIds: [] });
      setOrganizationTree(tree);
    } catch (err) { setSeatError(message(err)); }
    finally { setSeatLoading(false); }
  };
  const seatPopoverKey = (placementId: number, selectedSeatNumber: number) => `${placementId}:${selectedSeatNumber}`;
  const showSeatPopover = async (placement: Placement, selectedSeatNumber: number) => {
    if (!placement.groupId || dismissedSeatPopover.current === seatPopoverKey(placement.id, selectedSeatNumber)) return;
    try {
      const guests = await apiClient.placementGuests(eventId, placement.groupId);
      const guest = guests.find(item => item.placementId === placement.id && item.seatNumber === selectedSeatNumber);
      if (guest && dismissedSeatPopover.current !== seatPopoverKey(placement.id, selectedSeatNumber)) setSeatPopover({ placementId: placement.id, seatNumber: selectedSeatNumber, guest });
    } catch { /* The seat remains usable if the preview cannot be loaded. */ }
  };
  const hideSeatPopover = (placementId: number, selectedSeatNumber: number) => {
    const key = seatPopoverKey(placementId, selectedSeatNumber);
    if (dismissedSeatPopover.current === key) dismissedSeatPopover.current = null;
    setSeatPopover(current => current?.placementId === placementId && current.seatNumber === selectedSeatNumber ? null : current);
  };
  const assignExistingGuestToSeat = async (guest: GuestDto) => {
    if (!seatPlacement || !seatNumber || seatSaving) return;
    setSeatSaving(true); setSeatError("");
    try {
      await apiClient.updateGuest(eventId, guest.id, { name: guest.name, email: guest.email ?? undefined, phone: guest.phone ?? undefined, groupId: guest.groupId, categoryId: guest.categoryId, tagIds: guest.tags.map(tag => tag.id), placementId: seatPlacement.id, placementSeatNumber: seatNumber });
      const list = await apiClient.getPlacements(eventId);
      setItems(list); setGuestVersion(version => version + 1); setSeatPlacement(null); setSeatNumber(null);
    } catch (err) { setSeatError(message(err)); }
    finally { setSeatSaving(false); }
  };
  const saveSeatGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seatPlacement || !seatForm.categoryId || seatSaving) return;
    setSeatSaving(true); setSeatError("");
    try {
      const request = { name: seatForm.name.trim(), email: seatForm.email.trim() || undefined, phone: seatForm.phone.trim() || undefined, groupId: Number(seatForm.groupId), categoryId: Number(seatForm.categoryId), tagIds: seatForm.tagIds, placementId: seatPlacement.id, placementSeatNumber: seatNumber };
      if (seatGuest) await apiClient.updateGuest(eventId, seatGuest.id, request); else await apiClient.createGuest(eventId, request);
      const list = await apiClient.getPlacements(eventId);
      setItems(list); setGuestVersion(version => version + 1); setSeatPlacement(null); setSeatNumber(null);
    } catch (err) { setSeatError(message(err)); }
    finally { setSeatSaving(false); }
  };
  const descendants = (id: number) => {
    const ids = new Set([id]);
    let changed = true;
    while (changed) { changed = false; for (const p of items) if (p.parentId !== null && ids.has(p.parentId) && !ids.has(p.id)) { ids.add(p.id); changed = true; } }
    return ids;
  };
  const unavailableParents = editing ? descendants(editing.id) : new Set<number>();
  const isRow = items.some(p => p.id === Number(form.parentId) && p.displayChildrenAsRows);
  const isHall = form.displayChildrenAsRows;
  useEffect(() => {
    if (isRow) setForm(f => ({ ...f, displayChildrenAsRows: false, noQuota: false, quota: Number(f.quota) > 0 ? f.quota : "10" }));
  }, [isRow]);
  const dirty = editing && (form.displayChildrenAsRows !== editing.displayChildrenAsRows || form.name.trim() !== editing.name || (Number(form.groupId) || null) !== editing.groupId || (Number(form.parentId) || null) !== editing.parentId || (form.noQuota ? null : Number(form.quota)) !== editing.quota);
  const guestReady = !!editing && !dirty && !!form.groupId && !form.noQuota && canManage;
  const showGuestsTab = !!editing && !form.noQuota;
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    void act(async () => {
      const input = { name: form.name.trim(), parentId: Number(form.parentId) || null, groupId: Number(form.groupId) || null, quota: form.noQuota ? null : Number(form.quota), displayChildrenAsRows: form.displayChildrenAsRows, count: form.count, startNumber: form.startNumber };
      if (editing) {
        const list = await apiClient.updatePlacement(eventId, editing.id, input);
        setItems(list);
        setFormOpen(false);
      }
      else {
        const list = await apiClient.createPlacements(eventId, input);
        const created = list.find(p => !items.some(old => old.id === p.id));
        setItems(list);
        if (form.count === 1 && created) open(created);
        else setFormOpen(false);
      }
    });
  };
  const move = (id: number, parentId: number | null) => {
    const p = items.find(x => x.id === id);
    if (!p || p.parentId === parentId) return;
    if (parentId !== null && descendants(id).has(parentId)) { setError("Нельзя переносить объект в собственную ветку."); return; }
    if (!p.groupId) { open(p); setForm(f => ({ ...f, parentId: String(parentId ?? "") })); setError("Для сохранения переноса укажите группу."); return; }
    void act(async () => setItems(await apiClient.updatePlacement(eventId, id, { ...p, parentId })));
  };
  const drop = (e: React.DragEvent, parentId: number | null) => {
    e.preventDefault(); e.stopPropagation();
    if (canManage && !busy && drag.current !== null) move(drag.current, parentId);
    drag.current = null;
    setDraggedId(null);
    setDropTarget(null);
  };
  const dragBranch = draggedId === null ? new Set<number>() : descendants(draggedId);
  const invalidDrop = (target: number) => {
    const source = items.find(p => p.id === draggedId);
    return dragBranch.has(target) || (!!items.find(p => p.id === target)?.displayChildrenAsRows && !!source && (source.displayChildrenAsRows || source.quota === null || source.quota < 1));
  };
  const hoverDrop = (e: React.DragEvent, target: number | "root") => {
    if (!canManage || busy || drag.current === null) return;
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
  const visibleIds = new Set<number>();
  for (const p of items) if (!query || p.name.toLocaleLowerCase("ru-RU").includes(query)) {
    let current: Placement | undefined = p;
    while (current && !visibleIds.has(current.id)) { visibleIds.add(current.id); current = items.find(x => x.id === current!.parentId); }
  }
  const maxDepth = items.reduce((max, p) => { let n = 1; let parent = p.parentId; const visited = new Set<number>(); while (parent !== null && !visited.has(parent)) { visited.add(parent); n++; parent = items.find(x => x.id === parent)?.parentId ?? null; } return Math.max(max, n); }, 1);
  const renderNodes = (parentId: number | null, level: number): React.ReactNode => {
    const nodes = items.filter(p => p.parentId === parentId && visibleIds.has(p.id));
    if (!nodes.length) return null;
    const rows = items.some(p => p.id === parentId && p.displayChildrenAsRows);
    return <ul className={rows ? "placement-rows" : parentId === null ? "placement-tree-root" : "placement-tree-children"}>{nodes.map(p => {
      const children = items.some(x => x.parentId === p.id);
      const expanded = !collapsed.has(p.id) && (depth === 0 || level < depth || !!query);
      const occupiedSeats = new Set(p.occupiedSeatNumbers ?? []);
      const hallDropClass = p.displayChildrenAsRows && dropTarget === p.id ? (invalidDrop(p.id) ? " group-tree-node-drop-disabled" : " group-tree-node-drop-target") : "";
      return <li key={p.id} className={`${p.displayChildrenAsRows ? "placement-row-container" : rows ? "placement-row-item" : ""}${hallDropClass}`}
        onDragOver={p.displayChildrenAsRows ? e => hoverDrop(e, p.id) : undefined}
        onDragLeave={p.displayChildrenAsRows ? leaveDrop : undefined}
        onDrop={p.displayChildrenAsRows ? e => drop(e, p.id) : undefined}>
        <div className={`placement-node${rows ? " placement-row-node" : ""} ${p.quota === null ? "placement-hall" : "placement-table"}${query && p.name.toLocaleLowerCase("ru-RU").includes(query) ? " placement-match" : ""}${dragBranch.has(p.id) ? " group-tree-node-drag-branch" : ""}${draggedId === p.id ? " group-tree-node-drag-source" : ""}${dropTarget === p.id ? invalidDrop(p.id) ? " group-tree-node-drop-disabled" : " group-tree-node-drop-target" : ""}`}
          draggable={canManage && !busy} onDragStart={e => { drag.current = p.id; setDraggedId(p.id); setDropTarget(null); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(p.id)); }} onDragEnd={() => { drag.current = null; setDraggedId(null); setDropTarget(null); }}
          onDragOver={e => hoverDrop(e, p.id)} onDragLeave={leaveDrop} onDrop={e => drop(e, p.id)}>
          <div className="placement-node-content">
            <button className="placement-node-title" type="button" onClick={() => open(p)}>{p.name}</button>
            <small className={!p.groupId ? "error-text" : ""}>{flatGroups.find(g => g.id === p.groupId)?.name ?? "Укажите группу"}</small>
          </div>
          {p.quota !== null && p.quota > 0 && <div className="placement-seats" role="img" aria-label={`Места: занято ${p.guestCount} из ${p.quota}`} title={`Занято: ${p.guestCount}. Свободно: ${Math.max(0, p.quota - p.guestCount)}.`}>
            {Array.from({ length: Math.min(p.quota, rows ? 1000 : 100) }, (_, i) => {
              const selectedSeatNumber = i + 1;
              const occupied = occupiedSeats.has(selectedSeatNumber);
              const popoverVisible = seatPopover?.placementId === p.id && seatPopover.seatNumber === selectedSeatNumber;
              return <span key={i} className="placement-seat-wrap" onMouseEnter={() => { if (occupied) void showSeatPopover(p, selectedSeatNumber); }} onMouseLeave={() => hideSeatPopover(p.id, selectedSeatNumber)}>
                <button type="button" className={`placement-seat${occupied ? " placement-seat-occupied" : ""}`} disabled={!canCreateGuest} aria-label={occupied ? `Редактировать гостя на месте ${selectedSeatNumber}` : `Добавить гостя на место ${selectedSeatNumber}`} title={occupied ? "Редактировать гостя" : "Добавить гостя"} onClick={e => { e.stopPropagation(); void openSeatForm(p, selectedSeatNumber); }} />
                {popoverVisible && <span className="placement-seat-popover" role="status"><strong>{seatPopover.guest.name}</strong><small>{seatPopover.guest.categoryName ?? "Без категории"}</small><button type="button" aria-label="Закрыть информацию о госте" title="Закрыть" onClick={e => { e.stopPropagation(); dismissedSeatPopover.current = seatPopoverKey(p.id, selectedSeatNumber); setSeatPopover(null); }}>×</button></span>}
              </span>;
            })}
            {rows && p.quota > 1000 && <span className="placement-seats-more">Ещё {p.quota - 1000} мест</span>}
          </div>}
          <div className="group-tree-node-actions placement-node-actions">
            {canManage && <>
              <button className="icon-button" type="button" onClick={() => open(p)} aria-label={`Редактировать ${p.name}`} title="Редактировать">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Zm12.5-16.5 4 4 1-1a1.4 1.4 0 0 0 0-2l-2-2a1.4 1.4 0 0 0-2 0l-1 1Z" /></svg>
              </button>
              <button className="icon-button icon-button-danger" type="button" onClick={() => remove(p.id)} aria-label={`Удалить ветку ${p.name}`} title="Удалить ветку">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21a2 2 0 0 1-2-2V6h14v13a2 2 0 0 1-2 2H7Zm1-3h2V9H8v9Zm6 0h2V9h-2v9ZM4 5V3h5l1-1h4l1 1h5v2H4Z" /></svg>
              </button>
              <button className="icon-button group-tree-add-inline" type="button" onClick={() => open(null, String(p.id))} aria-label={`Добавить объект в ${p.name}`} title="Добавить дочерние объекты">+</button>
            </>}
            {children && <button className="group-tree-collapse-toggle" type="button" aria-expanded={expanded} aria-label={expanded ? "Свернуть" : "Раскрыть"} title={expanded ? "Свернуть ветку" : "Раскрыть ветку"} onClick={() => setCollapsed(c => { const next = new Set(c); next.has(p.id) ? next.delete(p.id) : next.add(p.id); return next; })}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.3 6.7 1.4-1.4 6.7 6.7-6.7 6.7-1.4-1.4 5.3-5.3-5.3-5.3Z" transform={expanded ? "rotate(90 12 12)" : undefined} /></svg>
            </button>}
          </div>
        </div>
        {expanded && renderNodes(p.id, level + 1)}
      </li>;
    })}</ul>;
  };

  return <div className="tab-content">
    <div className="section-heading"><div className="section-title-row"><h2>Размещение</h2><span className="badge">Всего: {items.length}</span></div>
      {canManage && <div className="section-actions"><button className="primary-button" disabled={busy} onClick={() => open(null)}>Создать объект размещения</button>
        <button className="danger-button" disabled={busy || !items.length} onClick={() => remove(null)}>Сбросить</button></div>}
    </div>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    {archived && <div className="alert alert-info">Мероприятие завершено. Структура доступна для просмотра.</div>}
    <section className="panel">
      <div className="placement-toolbar"><input className="placement-search-input" type="search" placeholder="Поиск по названию" aria-label="Поиск объектов" value={search} onChange={e => setSearch(e.target.value)} />
        {canManage && <div className="group-template-actions placement-template-actions">
          <button type="button" className="secondary-button original-structure-button" disabled={busy || loading || !items.length} onClick={() => { setTemplateName(""); setTemplateMode("save"); }}>Сохранить шаблон</button>
          <button type="button" className="secondary-button original-structure-button" disabled={busy} onClick={() => void act(async () => { setTemplates(await apiClient.placementTemplates(eventId)); setTemplateId(""); setTemplateMode("load"); })}>Загрузить шаблон</button>
        </div>}
      </div>
      {canManage && <div className={`placement-root-drop${dropTarget === "root" ? " group-tree-node-drop-target" : ""}`} onDragOver={e => hoverDrop(e, "root")} onDragLeave={leaveDrop} onDrop={e => drop(e, null)}>Перетащите сюда для переноса на верхний уровень</div>}
      <div className="placement-tree-view">
        <div className="placement-canvas" ref={canvas}
        onWheel={e => { e.preventDefault(); setZoom(z => Math.min(2, Math.max(.05, +(z + (e.deltaY < 0 ? .1 : -.1)).toFixed(2)))); }}
        onPointerDown={e => { if ((e.target as HTMLElement).closest(".placement-node")) return; const el = canvas.current!; pan.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }; el.setPointerCapture(e.pointerId); }}
        onPointerMove={e => { if (pan.current && canvas.current) { canvas.current.scrollLeft = pan.current.left - (e.clientX - pan.current.x); canvas.current.scrollTop = pan.current.top - (e.clientY - pan.current.y); } }} onPointerUp={() => { pan.current = null; }} onPointerCancel={() => { pan.current = null; }}>
          {loading ? <div className="empty-state">Загрузка...</div> : items.length === 0 ? <div className="empty-state">Создайте первый объект или загрузите шаблон.</div> : visibleIds.size === 0 ? <div className="empty-state">Объекты не найдены.</div> : <div className="placement-tree" style={{ zoom }}>{renderNodes(null, 1)}</div>}
        </div>
        <div className="groups-tree-depth-actions placement-canvas-controls" aria-label="Показать уровни размещения">
          <button className="groups-tree-depth-button" type="button" aria-pressed={depth === 0} title="Показать все уровни" aria-label="Показать все уровни" onClick={() => { setDepth(0); setCollapsed(new Set()); }}>∞</button>
          {Array.from({ length: maxDepth }, (_, i) => i + 1).map(level => <button className="groups-tree-depth-button" type="button" key={level} aria-pressed={depth === level} title={`Показать ${level} уровней`} onClick={() => { setDepth(level); setCollapsed(new Set()); }}>{level}</button>)}
        </div>
        <div className="groups-tree-zoom-actions placement-canvas-controls" aria-label="Масштаб размещения">
          <button className="groups-tree-scroll-button" type="button" disabled={zoom >= 2} title="Увеличить масштаб" aria-label="Увеличить масштаб" onClick={() => setZoom(z => Math.min(2, +(z + .1).toFixed(2)))}>+</button>
          <button className="groups-tree-scroll-button" type="button" disabled={zoom <= .05} title="Уменьшить масштаб" aria-label="Уменьшить масштаб" onClick={() => setZoom(z => Math.max(.05, +(z - .1).toFixed(2)))}>−</button>
        </div>
      </div>
    </section>

    {formOpen && <Modal className="placement-modal" title={editing ? `Размещение: ${editing.name}` : "Создать объекты размещения"} onClose={() => { if (!busy) setFormOpen(false); }}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="group-edit-tabs" aria-label="Разделы объекта размещения">
        <button className={`group-edit-tab${tab === "main" || !showGuestsTab ? " active" : ""}`} type="button" aria-pressed={tab === "main" || !showGuestsTab} onClick={() => setTab("main")}>Основное</button>
        {showGuestsTab && <button className={`group-edit-tab${tab === "guests" ? " active" : ""}`} type="button" aria-pressed={tab === "guests"} onClick={() => setTab("guests")}>Гости ({editing?.guestCount ?? 0})</button>}
      </div>
      {tab === "main" || !showGuestsTab ? <form className="form" onSubmit={save}>
        <label className="field"><span>Название</span><input maxLength={140} required value={form.name} disabled={!canManage || busy} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        {!editing && !form.displayChildrenAsRows && <div className="placement-two-fields"><label className="field"><span>Количество</span><input type="number" min={1} max={100} required value={form.count} onChange={e => setForm({ ...form, count: Number(e.target.value) })} /></label><label className="field"><span>Начальный номер</span><input type="number" min={1} max={2147483500} required disabled={form.count === 1} value={form.startNumber} onChange={e => setForm({ ...form, startNumber: Number(e.target.value) })} /></label></div>}
        {!editing && !form.displayChildrenAsRows && form.count > 1 && <small>Будут созданы: {form.name || "Название"} {form.startNumber} … {form.name || "Название"} {form.startNumber + form.count - 1}</small>}
        <label className="field"><span>Родительский объект</span><select disabled={!canManage || busy} value={form.parentId} onChange={e => setForm({ ...form, parentId: e.target.value })}><option value="">Верхний уровень</option>{items.filter(p => !unavailableParents.has(p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="field"><span>Группа *</span><select required disabled={!canManage || busy} value={form.groupId} onChange={e => setForm({ ...form, groupId: e.target.value })}><option value="">Выберите группу</option>{flatGroups.map(g => <option key={g.id} value={g.id}>{"— ".repeat(g.level)}{g.name}</option>)}</select></label>
        {editing && isHall ? <div className="placement-type-note">Тип объекта: ЗАЛ. В зале нет собственных мест, гости размещаются в дочерних рядах.</div> : <>
          {!isRow && <label className="placement-checkbox"><input type="checkbox" checked={isHall} disabled={!canManage || busy} onChange={e => setForm({ ...form, displayChildrenAsRows: e.target.checked, noQuota: e.target.checked, count: e.target.checked ? 1 : form.count, startNumber: e.target.checked ? 1 : form.startNumber })} /> Отображение ЗАЛ</label>}
          {isRow ? <small>Объект внутри ЗАЛа должен иметь хотя бы одно место.</small> : <label className="placement-checkbox"><input type="checkbox" checked={form.noQuota} disabled={!canManage || busy || isHall} onChange={e => setForm({ ...form, noQuota: e.target.checked })} /> Без мест — гостей назначать нельзя</label>}
          {!form.noQuota && !isHall && <label className="field"><span>Количество мест</span><input type="number" min={isRow ? 1 : 0} max={2147483647} required disabled={!canManage || busy} value={form.quota} onChange={e => setForm({ ...form, quota: e.target.value })} /></label>}
        </>}
        <div className="modal-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setFormOpen(false)}>Закрыть</button>{canManage && <button className="primary-button" disabled={busy}>{busy ? "Сохраняем..." : editing ? "Сохранить" : "Создать"}</button>}</div>
      </form> : <div className="placement-guests">
        {!guestReady && <div className="alert alert-info">Для назначения гостей сохраните группу и количество мест на вкладке «Основное». Объект без мест не принимает гостей.</div>}
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

    {seatPlacement && <Modal className="guest-form-modal seat-guest-modal" title={seatGuest ? `Гость: ${seatGuest.name}` : `Новое место в ${seatPlacement.name}`} description={seatGuest ? "Измените данные гостя, занимающего это место." : "Новый гость будет сразу размещён на выбранном месте."} onClose={() => { if (!seatSaving) setSeatPlacement(null); }}>
      {seatError && <div className="alert alert-error">{seatError}</div>}
      {seatLoading ? <div className="empty-state">Загрузка данных гостя...</div> : <>
        {!seatGuest && <div className="group-edit-tabs" aria-label="Способ добавления гостя">
          <button className={`group-edit-tab${seatTab === "new" ? " active" : ""}`} type="button" aria-pressed={seatTab === "new"} onClick={() => setSeatTab("new")}>Новый гость</button>
          <button className={`group-edit-tab${seatTab === "existing" ? " active" : ""}`} type="button" aria-pressed={seatTab === "existing"} onClick={() => setSeatTab("existing")}>Гости мероприятия</button>
        </div>}
        {!seatGuest && seatTab === "existing" ? <div className="seat-existing-guests">
          <input type="search" value={seatExistingSearch} onChange={e => setSeatExistingSearch(e.target.value)} placeholder="Поиск по ФИО или email" aria-label="Поиск гостей мероприятия" disabled={seatSaving || seatExistingLoading} />
          <div className="seat-existing-guests-table-wrap"><table className="seat-existing-guests-table"><thead><tr><th>ФИО</th><th>Email</th><th></th></tr></thead><tbody>{seatExistingGuests.filter(guest => `${guest.name} ${guest.email ?? ""}`.toLocaleLowerCase("ru-RU").includes(normalizeSearch(seatExistingSearch))).map(guest => <tr key={guest.id}><td>{guest.name}</td><td>{guest.email ?? "—"}</td><td><button type="button" className="secondary-button" disabled={seatSaving || !guest.categoryId} title={!guest.categoryId ? "У гостя не указана категория" : undefined} onClick={() => void assignExistingGuestToSeat(guest)}>{guest.placementId ? "Пересадить" : "Добавить"}</button></td></tr>)}{seatExistingGuests.length === 0 && <tr><td colSpan={3}>Гостей мероприятия пока нет.</td></tr>}</tbody></table></div>
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
          <label className="field"><span>Группа</span><select required value={seatForm.groupId} disabled={seatSaving} onChange={e => setSeatForm({ ...seatForm, groupId: e.target.value })}>{flatGroups.filter(group => seatPlacement.groupId !== null && placementGroupScope(seatPlacement.groupId).has(group.id)).map(group => <option key={group.id} value={group.id}>{"— ".repeat(group.level)}{group.name}</option>)}</select></label>
          <label className="field"><span>Категория *</span><select required value={seatForm.categoryId} disabled={seatSaving} onChange={e => setSeatForm({ ...seatForm, categoryId: e.target.value })}><option value="">Выберите категорию</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{categories.length === 0 && <small>Сначала создайте категорию мероприятия.</small>}</label>
        </div>
        <div className="modal-actions"><button className="secondary-button" type="button" disabled={seatSaving} onClick={() => setSeatPlacement(null)}>Закрыть</button><button className="primary-button" disabled={seatSaving || !seatForm.categoryId}>{seatSaving ? "Сохраняем..." : seatGuest ? "Сохранить" : "Добавить гостя"}</button></div>
      </form>}</>}
    </Modal>}

    {templateMode && <Modal title={templateMode === "save" ? "Сохранить шаблон размещения" : "Загрузить шаблон размещения"} onClose={() => { if (!busy) setTemplateMode(null); }}>
      {error && <div className="alert alert-error">{error}</div>}
      <form className="form" onSubmit={e => { e.preventDefault(); if (templateMode === "save") void act(async () => { await apiClient.savePlacementTemplate(eventId, templateName); setTemplateMode(null); }); else { setTemplateMode(null); setConfirmation({ text: `Текущая структура будет заменена. Размещение ${items.reduce((n, p) => n + p.guestCount, 0)} гостей будет снято. Загруженные объекты потребуют выбора групп. Продолжить?`, run: async () => { setItems(await apiClient.applyPlacementTemplate(eventId, Number(templateId))); setCollapsed(new Set()); setConfirmation(null); } }); } }}>
        {templateMode === "save" ? <label className="field"><span>Название шаблона</span><input required maxLength={150} value={templateName} onChange={e => setTemplateName(e.target.value)} /></label> : <label className="field"><span>Шаблон</span><select required value={templateId} onChange={e => setTemplateId(e.target.value)}><option value="">Выберите шаблон</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>{!templates.length && <small>Сохранённых шаблонов пока нет.</small>}</label>}
        <button className="primary-button" disabled={busy || (templateMode === "load" && !templateId)}>{templateMode === "save" ? "Сохранить" : "Загрузить"}</button>
      </form>
    </Modal>}
    {confirmation && <Modal title="Подтверждение" description={confirmation.text} onClose={() => { if (!busy) setConfirmation(null); }}>{error && <div className="alert alert-error">{error}</div>}<div className="modal-actions"><button className="secondary-button" disabled={busy} onClick={() => setConfirmation(null)}>Отмена</button><button className="danger-button" disabled={busy} onClick={() => void act(confirmation.run)}>Подтвердить</button></div></Modal>}
  </div>;
};

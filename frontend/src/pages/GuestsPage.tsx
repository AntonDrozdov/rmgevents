import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Modal } from "../components/Modal";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";
import { GroupTreeDto, GuestDto } from "../types";
import { flattenGroups } from "../utils/groups";

const statusLabel: Record<string, string> = {
  saved: "Сохранён",
  on_review: "На согласовании",
  admin_review: "На согласовании у администратора",
  approved: "Согласован Администратором",
  invited: "Приглашён",
  rejected: "Отклонён",
};

const EditIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Zm12.5-16.5 4 4 1-1a1.4 1.4 0 0 0 0-2l-2-2a1.4 1.4 0 0 0-2 0l-1 1Z" /></svg>;
const DeleteIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21a2 2 0 0 1-2-2V6h14v13a2 2 0 0 1-2 2H7Zm1-3h2V9H8v9Zm6 0h2V9h-2v9ZM4 5V3h5l1-1h4l1 1h5v2H4Z" /></svg>;
const RejectIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z" /></svg>;
const emptyForm = (groupId = "") => ({ name: "", email: "", phone: "", groupId });
const formatDateTime = (value: string) => new Date(value).toLocaleString("ru-RU");

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

export const GuestsPage: React.FC = () => {
  const { eventId = "" } = useParams<{ eventId: string }>();
  const { currentUser } = useAuth();
  const [guests, setGuests] = useState<GuestDto[]>([]);
  const [groups, setGroups] = useState<GroupTreeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingGuest, setEditingGuest] = useState<GuestDto | null>(null);
  const [deleteGuest, setDeleteGuest] = useState<GuestDto | null>(null);
  const [formData, setFormData] = useState(emptyForm());

  const canCreate = currentUser?.permissions.includes("create_guest") ?? false;
  const canApprove = currentUser?.permissions.includes("approve_guest") ?? false;
  const isAdministrator = currentUser?.roleName.toLowerCase() === "administrator";
  const flatGroups = useMemo(() => flattenGroups(groups), [groups]);
  const scopeIds = useMemo(() => collectScopeIds(groups, currentUser?.groupId), [groups, currentUser?.groupId]);
  const isGuestEditDirty = editingGuest !== null && (
    formData.name.trim() !== editingGuest.name ||
    formData.email.trim() !== (editingGuest.email ?? "") ||
    formData.phone.trim() !== (editingGuest.phone ?? "") ||
    Number(formData.groupId) !== editingGuest.groupId
  );

  const loadData = async () => {
    if (!eventId) return;
    setLoading(true);
    setError("");
    try {
      const [guestList, groupTree] = await Promise.all([apiClient.getGuests(eventId), apiClient.getGroupTree(eventId)]);
      setGuests(guestList);
      setGroups(groupTree);
    } catch (err) {
      setError("Не удалось загрузить гостей.");
      console.error(err);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [eventId]);

  const applyGuestUpdate = (updatedGuest: GuestDto) => {
    setGuests((current) => current.map((guest) =>
      guest.id === updatedGuest.id ? updatedGuest : guest));
    setEditingGuest((current) =>
      current?.id === updatedGuest.id ? updatedGuest : current);
  };

  const openCreateModal = () => {
    setError("");
    setFormData(emptyForm(String([...scopeIds][0] ?? flatGroups[0]?.id ?? "")));
    setIsCreateModalOpen(true);
  };

  const openEditModal = (guest: GuestDto) => {
    setError("");
    setEditingGuest(guest);
    setFormData({ name: guest.name, email: guest.email ?? "", phone: guest.phone ?? "", groupId: String(guest.groupId) });
  };

  const closeForm = () => {
    if (saving) return;
    setIsCreateModalOpen(false);
    setEditingGuest(null);
    setFormData(emptyForm());
    setError("");
  };

  const submitGuest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (editingGuest && !isGuestEditDirty) return;
    setSaving(true);
    setError("");
    const request = { name: formData.name.trim(), email: formData.email.trim() || undefined, phone: formData.phone.trim() || undefined, groupId: Number(formData.groupId) };
    try {
      if (editingGuest) await apiClient.updateGuest(eventId, editingGuest.id, request);
      else await apiClient.createGuest(eventId, request);
      setIsCreateModalOpen(false);
      setEditingGuest(null);
      setFormData(emptyForm());
      await loadData();
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
      await loadData();
    } catch (err) {
      setError("Не удалось удалить гостя.");
      console.error(err);
    } finally { setSaving(false); }
  };

  const canApproveGuest = (guest: GuestDto) => {
    if (!canApprove || !scopeIds.has(guest.groupId)) return false;
    return guest.status === "on_review" ||
      (guest.status === "admin_review" && isAdministrator);
  };
  const canRejectGuest = (guest: GuestDto) => canApprove && scopeIds.has(guest.groupId) && guest.status !== "saved" && guest.status !== "rejected";
  const canSubmitGuest = (guest: GuestDto) => canCreate && scopeIds.has(guest.groupId) && guest.status === "saved";
  const canInviteGuest = (guest: GuestDto) => canCreate && scopeIds.has(guest.groupId) && guest.status === "approved";
  const canReturnGuest = (guest: GuestDto) => canApprove && scopeIds.has(guest.groupId) && guest.status === "rejected";
  const canManageGuest = (guest: GuestDto) => canCreate && scopeIds.has(guest.groupId);

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
    <div className="section-heading guests-heading"><div className="section-title-row"><h2>Гости</h2><span className="badge">Всего: {guests.length}</span></div><div className="section-actions">{canCreate && <button className="primary-button create-action-button guest-create-button" onClick={openCreateModal}>Добавить гостя</button>}</div></div>
    {error && !isCreateModalOpen && !editingGuest && !deleteGuest && <div className="alert alert-error">{error}</div>}
    <section className="panel guests-table-panel">{loading ? <div className="empty-state compact">Загрузка...</div> : guests.length === 0 ? <div className="empty-state compact">Гостей пока нет.</div> : <div className="table-wrap guests-table-wrap"><table><thead><tr><th>Имя</th><th>Контакты</th><th>Группа</th><th>Статус</th><th>Создан</th><th className="actions-column" aria-label="Действия" /></tr></thead><tbody>{guests.map((guest) => {
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
      return <tr className={`table-hover-row${canEdit ? " table-editable-row" : ""}`} key={guest.id} tabIndex={canEdit ? 0 : undefined} onClick={canEdit ? (event) => { if (!(event.target as HTMLElement).closest("button, a, input, select, textarea")) openEditModal(guest); } : undefined} onKeyDown={canEdit ? (event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openEditModal(guest); } } : undefined}><td>{guest.name}</td><td><div>{guest.email || "-"}</div><small>{guest.phone || ""}</small></td><td>{guest.groupName || guest.groupId}</td><td><div className="guest-status-actions">{nextAction ? <button className={`status status-action-button ${guest.status}`} type="button" onClick={nextAction} title={nextActionLabel}><span className="status-current">{statusLabel[guest.status] ?? guest.status}</span><span className="status-next">{nextActionLabel}</span></button> : <span className={`status ${guest.status}`}>{statusLabel[guest.status] ?? guest.status}</span>}{showReject && <button className="icon-button icon-button-danger guest-reject-button" onClick={() => updateGuestStatus(guest.id, false)} title="Отклонить" aria-label={`Отклонить ${guest.name}`}><RejectIcon /></button>}</div></td><td>{new Date(guest.createdAt).toLocaleDateString("ru-RU")}</td>
        <td className="actions-column">{canManageGuest(guest) ? <div className="table-icon-actions"><button className="icon-button" onClick={() => openEditModal(guest)} title="Редактировать" aria-label={`Редактировать ${guest.name}`}><EditIcon /></button><button className="icon-button icon-button-danger" onClick={() => setDeleteGuest(guest)} title="Удалить" aria-label={`Удалить ${guest.name}`}><DeleteIcon /></button></div> : "-"}</td></tr>;
    })}</tbody></table></div>}</section>

    {(isCreateModalOpen || editingGuest) && <Modal className="guest-form-modal" title={editingGuest ? "Редактировать гостя" : "Добавить гостя"} description={editingGuest ? "Измените данные гостя и просмотрите цепочку согласования." : "Гость будет сохранён в выбранной группе."} onClose={closeForm}>{error && <div className="alert alert-error">{error}</div>}<form className="form guest-edit-form" onSubmit={submitGuest}>
      <label className="field"><span>Имя</span><input value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} disabled={saving} required /></label>
      <label className="field"><span>Email</span><input type="email" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} disabled={saving} /></label>
      <label className="field"><span>Телефон</span><input type="tel" value={formData.phone} onChange={(event) => setFormData({ ...formData, phone: event.target.value })} disabled={saving} /></label>
      <label className="field"><span>Группа</span><select value={formData.groupId} onChange={(event) => setFormData({ ...formData, groupId: event.target.value })} disabled={saving} required>{flatGroups.filter((group) => scopeIds.has(group.id)).map((group) => <option key={group.id} value={group.id}>{"- ".repeat(group.level)}{group.name} · свободно {group.availableQuota}</option>)}</select></label>
      {editingGuest && <div className="guest-workflow-section"><h3 className="workflow-title">Цепочка согласования</h3>{renderWorkflow(editingGuest)}</div>}
      <div className="modal-actions"><button className="secondary-button" type="button" onClick={closeForm} disabled={saving}>Закрыть</button><button className="primary-button" type="submit" disabled={saving || Boolean(editingGuest && !isGuestEditDirty)}>{saving ? "Сохраняем..." : "Сохранить"}</button></div>
    </form></Modal>}

    {deleteGuest && <Modal title="Удалить гостя" description={`Гость «${deleteGuest.name}» будет удалён без возможности восстановления.`} onClose={() => !saving && setDeleteGuest(null)}>{error && <div className="alert alert-error">{error}</div>}<div className="modal-actions"><button className="secondary-button" onClick={() => setDeleteGuest(null)} disabled={saving}>Отмена</button><button className="danger-button" onClick={confirmDelete} disabled={saving}>{saving ? "Удаляем..." : "Удалить"}</button></div></Modal>}
  </div>;
};

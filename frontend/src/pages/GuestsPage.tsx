import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Modal } from "../components/Modal";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";
import { GroupTreeDto, GuestDto } from "../types";
import { flattenGroups } from "../utils/groups";

const statusLabel: Record<string, string> = {
  pending: "Ожидает",
  approved: "Одобрен",
  rejected: "Отклонен",
};

export const GuestsPage: React.FC = () => {
  const { eventId = "" } = useParams<{ eventId: string }>();
  const { currentUser } = useAuth();
  const [guests, setGuests] = useState<GuestDto[]>([]);
  const [groups, setGroups] = useState<GroupTreeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    groupId: "",
  });

  const canCreate = currentUser?.permissions.includes("create_guest") ?? false;
  const canApprove = currentUser?.permissions.includes("approve_guest") ?? false;
  const flatGroups = useMemo(() => flattenGroups(groups), [groups]);

  const loadGuests = async () => {
    if (!eventId) return;

    setLoading(true);
    setError("");

    try {
      const guestList = await apiClient.getGuests(eventId);
      setGuests(guestList);
    } catch (err) {
      setError("Не удалось загрузить гостей.");
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
      setError("Не удалось загрузить группы для создания гостя.");
      console.error(err);
    } finally {
      setGroupsLoading(false);
    }
  };

  useEffect(() => {
    loadGuests();
  }, [eventId]);

  const openCreateModal = async () => {
    setIsCreateModalOpen(true);
    await loadGroupsForCreate();
  };

  const closeCreateModal = () => {
    if (saving) return;
    setIsCreateModalOpen(false);
    setError("");
  };

  const handleCreateGuest = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      await apiClient.createGuest(eventId, {
        name: formData.name.trim(),
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        groupId: Number(formData.groupId),
      });

      setFormData({ name: "", email: "", phone: "", groupId: String(flatGroups[0]?.id ?? "") });
      setIsCreateModalOpen(false);
      await loadGuests();
    } catch (err) {
      setError("Не удалось создать гостя. Проверьте группу и доступную квоту.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const updateGuestStatus = async (guestId: number, approve: boolean) => {
    setError("");

    try {
      await apiClient.approveGuest(eventId, { guestId, approve });
      await loadGuests();
    } catch (err) {
      setError("Не удалось обновить статус гостя.");
      console.error(err);
    }
  };

  return (
    <div className="tab-content">
      <div className="section-heading guests-heading">
        <div className="section-title-row">
          <h2>Гости</h2>
          <span className="badge">Всего: {guests.length}</span>
        </div>
        <div className="section-actions">
          {canCreate && (
            <button className="primary-button create-action-button guest-create-button" onClick={openCreateModal}>
              Добавить гостя
            </button>
          )}
        </div>
      </div>

      {error && !isCreateModalOpen && <div className="alert alert-error">{error}</div>}

      <section className="panel guests-table-panel">
        {loading ? (
          <div className="empty-state compact">Загрузка...</div>
        ) : guests.length === 0 ? (
          <div className="empty-state compact">Гостей пока нет.</div>
        ) : (
          <div className="table-wrap guests-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Имя</th>
                  <th>Контакты</th>
                  <th>Группа</th>
                  <th>Статус</th>
                  <th>Создан</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {guests.map((guest) => (
                  <tr key={guest.id}>
                    <td>{guest.name}</td>
                    <td>
                      <div>{guest.email || "-"}</div>
                      <small>{guest.phone || ""}</small>
                    </td>
                    <td>{guest.groupName || guest.groupId}</td>
                    <td><span className={`status ${guest.status}`}>{statusLabel[guest.status] ?? guest.status}</span></td>
                    <td>{new Date(guest.createdAt).toLocaleDateString("ru-RU")}</td>
                    <td>
                      {guest.status === "pending" && canApprove ? (
                        <div className="inline-actions">
                          <button className="success-button" onClick={() => updateGuestStatus(guest.id, true)}>Одобрить</button>
                          <button className="danger-button" onClick={() => updateGuestStatus(guest.id, false)}>Отклонить</button>
                        </div>
                      ) : (
                        "-"
                      )}
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
          title="Добавить гостя"
          description="Гость будет создан в выбранной группе с учетом доступной квоты."
          onClose={closeCreateModal}
        >
          {error && <div className="alert alert-error">{error}</div>}

          <form className="form" onSubmit={handleCreateGuest}>
            <label className="field">
              <span>Имя</span>
              <input value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} disabled={saving} required />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} disabled={saving} />
            </label>
            <label className="field">
              <span>Телефон</span>
              <input type="tel" value={formData.phone} onChange={(event) => setFormData({ ...formData, phone: event.target.value })} disabled={saving} />
            </label>
            <label className="field">
              <span>Группа</span>
              <select value={formData.groupId} onChange={(event) => setFormData({ ...formData, groupId: event.target.value })} disabled={saving || groupsLoading} required>
                {groupsLoading ? (
                  <option value="">Загрузка групп...</option>
                ) : (
                  flatGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {"- ".repeat(group.level)}{group.name} · свободно {group.availableQuota}
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

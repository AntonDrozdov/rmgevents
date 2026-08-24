import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";
import { GroupTreeDto, GuestDto } from "../types";
import { flattenGroups, groupNameById } from "../utils/groups";

const statusLabel: Record<string, string> = {
  pending: "Ожидает",
  approved: "Одобрен",
  rejected: "Отклонен",
};

export const GuestsPage: React.FC = () => {
  const { eventId = "" } = useParams<{ eventId: string }>();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [guests, setGuests] = useState<GuestDto[]>([]);
  const [groups, setGroups] = useState<GroupTreeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    groupId: "",
  });

  const canCreate = currentUser?.permissions.includes("create_guest") ?? false;
  const canApprove = currentUser?.permissions.includes("approve_guest") ?? false;
  const flatGroups = useMemo(() => flattenGroups(groups), [groups]);

  const loadData = async () => {
    if (!eventId) return;

    setLoading(true);
    setError("");

    try {
      const [guestList, groupTree] = await Promise.all([
        apiClient.getGuests(eventId),
        apiClient.getGroupTree(eventId),
      ]);
      setGuests(guestList);
      setGroups(groupTree);

      if (!formData.groupId && groupTree.length > 0) {
        setFormData((value) => ({ ...value, groupId: flattenGroups(groupTree)[0]?.id ?? "" }));
      }
    } catch (err) {
      setError("Ошибка загрузки гостей.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canCreate && !canApprove) {
      setError("У вас нет прав для управления гостями.");
      setLoading(false);
      return;
    }

    loadData();
  }, [eventId, canCreate, canApprove]);

  const handleCreateGuest = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    try {
      await apiClient.createGuest(eventId, {
        name: formData.name.trim(),
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        groupId: formData.groupId,
      });

      setFormData({ name: "", email: "", phone: "", groupId: flatGroups[0]?.id ?? "" });
      setShowForm(false);
      await loadData();
    } catch (err) {
      setError("Не удалось создать гостя. Проверьте группу и доступную квоту.");
      console.error(err);
    }
  };

  const updateGuestStatus = async (guestId: string, approve: boolean) => {
    setError("");

    try {
      await apiClient.approveGuest(eventId, { guestId, approve });
      await loadData();
    } catch (err) {
      setError("Не удалось обновить статус гостя.");
      console.error(err);
    }
  };

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Мероприятие</p>
          <h1>Гости</h1>
          <p className="muted">Список гостей, их группы и статус согласования.</p>
        </div>
        <button className="secondary-button" onClick={() => navigate("/dashboard")}>Назад</button>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {canCreate && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Добавление гостя</h2>
              <p className="muted">Гость создаётся в выбранной группе с учетом квоты.</p>
            </div>
            <button className="primary-button" onClick={() => setShowForm((value) => !value)}>
              {showForm ? "Скрыть форму" : "Добавить гостя"}
            </button>
          </div>

          {showForm && (
            <form className="form-grid" onSubmit={handleCreateGuest}>
              <label className="field">
                <span>Имя</span>
                <input value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} required />
              </label>
              <label className="field">
                <span>Email</span>
                <input type="email" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} />
              </label>
              <label className="field">
                <span>Телефон</span>
                <input type="tel" value={formData.phone} onChange={(event) => setFormData({ ...formData, phone: event.target.value })} />
              </label>
              <label className="field">
                <span>Группа</span>
                <select value={formData.groupId} onChange={(event) => setFormData({ ...formData, groupId: event.target.value })} required>
                  {flatGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {"- ".repeat(group.level)}{group.name} · свободно {group.availableQuota}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary-button form-submit" type="submit">Создать гостя</button>
            </form>
          )}
        </section>
      )}

      <section className="panel">
        <div className="section-heading">
          <h2>Список гостей</h2>
          <span className="badge">{guests.length}</span>
        </div>

        {loading ? (
          <div className="empty-state compact">Загрузка...</div>
        ) : guests.length === 0 ? (
          <div className="empty-state compact">Гостей пока нет.</div>
        ) : (
          <div className="table-wrap">
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
                    <td>{groupNameById(groups, guest.groupId)}</td>
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
    </main>
  );
};

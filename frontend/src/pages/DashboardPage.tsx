import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";
import { EventDetailDto, GroupTreeDto, GuestDto, UserDto } from "../types";
import { flattenGroups } from "../utils/groups";

export const DashboardPage: React.FC = () => {
  const { currentUser, currentEvent, events, selectEvent, logout } = useAuth();
  const [eventDetails, setEventDetails] = useState<EventDetailDto | null>(null);
  const [groups, setGroups] = useState<GroupTreeDto[]>([]);
  const [guests, setGuests] = useState<GuestDto[]>([]);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const permissions = currentUser?.permissions ?? [];
  const groupCount = useMemo(() => flattenGroups(groups).length, [groups]);
  const approvedGuests = guests.filter((guest) => guest.status === "approved").length;
  const pendingGuests = guests.filter((guest) => guest.status === "pending").length;

  useEffect(() => {
    const loadDashboard = async () => {
      if (!currentEvent) return;

      setLoading(true);
      setError("");

      try {
        const [details, groupTree, guestList, userList] = await Promise.all([
          apiClient.getEvent(currentEvent.id),
          apiClient.getGroupTree(currentEvent.id),
          apiClient.getGuests(currentEvent.id),
          apiClient.getUsers(currentEvent.id),
        ]);

        setEventDetails(details);
        setGroups(groupTree);
        setGuests(guestList);
        setUsers(userList);
      } catch (err) {
        setError("Не удалось загрузить данные мероприятия.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [currentEvent]);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  if (!currentEvent) {
    return (
      <main className="page-shell">
        <section className="empty-state">
          <h1>Нет доступных мероприятий</h1>
          <p>После входа система должна вернуть хотя бы одно мероприятие с ролью пользователя.</p>
          <button className="secondary-button" onClick={handleLogout}>Выйти</button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-layout">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">RMG Events</p>
          <h1>Панель управления</h1>
        </div>

        <div className="event-switcher">
          <span className="sidebar-label">Мероприятия</span>
          {events.map((event) => (
            <button
              className={event.id === currentEvent.id ? "event-button active" : "event-button"}
              key={event.id}
              onClick={() => selectEvent(event)}
              type="button"
            >
              <span>{event.name}</span>
              <small>{event.roleName}</small>
            </button>
          ))}
        </div>

        <button className="secondary-button full-width" onClick={handleLogout}>Выйти</button>
      </aside>

      <section className="content">
        <header className="page-header">
          <div>
            <p className="eyebrow">Текущее мероприятие</p>
            <h2>{eventDetails?.name ?? currentEvent.name}</h2>
            <p className="muted">{eventDetails?.description || "Описание мероприятия не заполнено."}</p>
          </div>
          <div className="profile-pill">
            <span>{currentUser?.displayName ?? "Пользователь"}</span>
            <small>{currentUser?.roleName ?? currentEvent.roleName}</small>
          </div>
        </header>

        {error && <div className="alert alert-error">{error}</div>}
        {loading && <div className="panel">Загрузка данных...</div>}

        {!loading && (
          <>
            <section className="stats-grid">
              <article className="metric">
                <span>Группы</span>
                <strong>{groupCount}</strong>
              </article>
              <article className="metric">
                <span>Гости</span>
                <strong>{guests.length}</strong>
              </article>
              <article className="metric">
                <span>Ожидают решения</span>
                <strong>{pendingGuests}</strong>
              </article>
              <article className="metric">
                <span>Одобрены</span>
                <strong>{approvedGuests}</strong>
              </article>
              <article className="metric">
                <span>Сотрудники</span>
                <strong>{users.length}</strong>
              </article>
            </section>

            <section className="panel">
              <div className="section-heading">
                <div>
                  <h3>Доступные действия</h3>
                  <p className="muted">Интерфейс показывает операции по разрешениям текущей роли.</p>
                </div>
              </div>

              <div className="action-grid">
                {(permissions.includes("create_guest") || permissions.includes("approve_guest")) && (
                  <button className="action-card" onClick={() => navigate(`/events/${currentEvent.id}/guests`)}>
                    <strong>Гости</strong>
                    <span>Создание, просмотр и согласование заявок</span>
                  </button>
                )}
                {permissions.includes("create_group") && (
                  <button className="action-card" onClick={() => navigate(`/events/${currentEvent.id}/groups`)}>
                    <strong>Группы</strong>
                    <span>Иерархия групп и квоты вместимости</span>
                  </button>
                )}
                {permissions.includes("create_user") && (
                  <button className="action-card" onClick={() => navigate(`/events/${currentEvent.id}/users`)}>
                    <strong>Сотрудники</strong>
                    <span>Назначение пользователей на роли и группы</span>
                  </button>
                )}
                {permissions.includes("create_event") && (
                  <button className="action-card" onClick={() => navigate("/events/create")}>
                    <strong>Новое мероприятие</strong>
                    <span>Создание мероприятия и стартовой группы</span>
                  </button>
                )}
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
};

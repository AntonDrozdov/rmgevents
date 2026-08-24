import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";
import { EventDetailDto, EventOption } from "../types";

export const DashboardPage: React.FC = () => {
  const { token, currentUser, currentEvent, events, selectEvent, logout } = useAuth();
  const [eventDetails, setEventDetails] = useState<EventDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    if (currentEvent) {
      loadEventDetails();
    }
  }, [currentEvent, token, navigate]);

  const loadEventDetails = async () => {
    if (!currentEvent) return;
    
    setLoading(true);
    setError("");
    
    try {
      const details = await apiClient.getEvent(currentEvent.id);
      setEventDetails(details);
    } catch (err) {
      setError("Ошибка загрузки данных мероприятия");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>Панель управления</h1>
          {currentEvent && (
            <p style={styles.subtitle}>Мероприятие: {currentEvent.name} ({currentEvent.roleName})</p>
          )}
        </div>
        <div style={styles.headerRight}>
          <span style={styles.userInfo}>{currentUser?.displayName}</span>
          <button onClick={handleLogout} style={styles.logoutBtn}>
            Выход
          </button>
        </div>
      </header>

      <div style={styles.mainContent}>
        {events.length > 1 && (
          <aside style={styles.sidebar}>
            <h3 style={styles.sidebarTitle}>Выбор мероприятия</h3>
            <div style={styles.eventList}>
              {events.map((event) => (
                <button
                  key={event.id}
                  onClick={() => selectEvent(event)}
                  style={{
                    ...styles.eventItem,
                    ...(currentEvent?.id === event.id ? styles.eventItemActive : {}),
                  }}
                >
                  <div style={styles.eventName}>{event.name}</div>
                  <div style={styles.eventRole}>{event.roleName}</div>
                </button>
              ))}
            </div>
          </aside>
        )}

        <main style={styles.content}>
          {loading ? (
            <div style={styles.loading}>Загрузка...</div>
          ) : error ? (
            <div style={styles.error}>{error}</div>
          ) : eventDetails ? (
            <div>
              <section style={styles.section}>
                <h2 style={styles.sectionTitle}>Информация о мероприятии</h2>
                <div style={styles.infoGrid}>
                  <div style={styles.infoItem}>
                    <label>Название</label>
                    <p>{eventDetails.name}</p>
                  </div>
                  <div style={styles.infoItem}>
                    <label>Описание</label>
                    <p>{eventDetails.description || "Нет описания"}</p>
                  </div>
                  <div style={styles.infoItem}>
                    <label>Статус</label>
                    <p>{eventDetails.isArchived ? "Архивирован" : "Активен"}</p>
                  </div>
                </div>
              </section>

              <section style={styles.section}>
                <h2 style={styles.sectionTitle}>Быстрые ссылки</h2>
                <div style={styles.quickLinks}>
                  {currentUser?.permissions.includes("create_guest") && (
                    <button style={styles.linkButton} onClick={() => navigate(`/events/${currentEvent?.id}/guests`)}>
                      Управление гостями
                    </button>
                  )}
                  {currentUser?.permissions.includes("create_group") && (
                    <button style={styles.linkButton} onClick={() => navigate(`/events/${currentEvent?.id}/groups`)}>
                      Управление группами
                    </button>
                  )}
                  {currentUser?.permissions.includes("create_user") && (
                    <button style={styles.linkButton} onClick={() => navigate(`/events/${currentEvent?.id}/users`)}>
                      Управление пользователями
                    </button>
                  )}
                  {currentUser?.permissions.includes("create_event") && (
                    <button style={styles.linkButton} onClick={() => navigate("/events/create")}>
                      Создать мероприятие
                    </button>
                  )}
                </div>
              </section>

              <section style={styles.section}>
                <h2 style={styles.sectionTitle}>Статистика</h2>
                <div style={styles.statsGrid}>
                  <div style={styles.statCard}>
                    <div style={styles.statLabel}>Роли</div>
                    <div style={styles.statValue}>{eventDetails.roles.length}</div>
                  </div>
                  <div style={styles.statCard}>
                    <div style={styles.statLabel}>Группы</div>
                    <div style={styles.statValue}>{eventDetails.groups.length}</div>
                  </div>
                  <div style={styles.statCard}>
                    <div style={styles.statLabel}>Пользователи</div>
                    <div style={styles.statValue}>{eventDetails.users.length}</div>
                  </div>
                  <div style={styles.statCard}>
                    <div style={styles.statLabel}>Гости</div>
                    <div style={styles.statValue}>{eventDetails.guests.length}</div>
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <div>Данные не найдены</div>
          )}
        </main>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    minHeight: "100vh",
    backgroundColor: "#f5f5f5",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#333",
    color: "white",
    padding: "20px",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    margin: "0 0 8px 0",
    fontSize: "28px",
  },
  subtitle: {
    margin: "0",
    fontSize: "14px",
    opacity: "0.8",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "20px",
  },
  userInfo: {
    fontSize: "14px",
  },
  logoutBtn: {
    padding: "8px 16px",
    backgroundColor: "#d32f2f",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "14px",
  },
  mainContent: {
    display: "flex",
    flex: 1,
  },
  sidebar: {
    width: "250px",
    backgroundColor: "white",
    padding: "20px",
    borderRight: "1px solid #ddd",
  },
  sidebarTitle: {
    margin: "0 0 15px 0",
    fontSize: "16px",
    color: "#333",
  },
  eventList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "8px",
  },
  eventItem: {
    padding: "12px",
    backgroundColor: "#f5f5f5",
    border: "1px solid #ddd",
    borderRadius: "4px",
    cursor: "pointer",
    textAlign: "left" as const,
    transition: "all 0.2s",
  },
  eventItemActive: {
    backgroundColor: "#007bff",
    color: "white",
    borderColor: "#007bff",
  },
  eventName: {
    fontWeight: "600" as const,
    marginBottom: "4px",
  },
  eventRole: {
    fontSize: "12px",
    opacity: "0.8",
  },
  content: {
    flex: 1,
    padding: "20px",
  },
  section: {
    backgroundColor: "white",
    padding: "20px",
    borderRadius: "8px",
    marginBottom: "20px",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)",
  },
  sectionTitle: {
    margin: "0 0 15px 0",
    fontSize: "18px",
    color: "#333",
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
    gap: "15px",
  },
  infoItem: {
    paddingBottom: "10px",
    borderBottom: "1px solid #eee",
  },
  quickLinks: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "10px",
  },
  linkButton: {
    padding: "12px",
    backgroundColor: "#007bff",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600" as const,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "15px",
  },
  statCard: {
    backgroundColor: "#f9f9f9",
    padding: "20px",
    borderRadius: "4px",
    textAlign: "center" as const,
    border: "1px solid #eee",
  },
  statLabel: {
    fontSize: "12px",
    color: "#999",
    marginBottom: "8px",
    textTransform: "uppercase" as const,
  },
  statValue: {
    fontSize: "32px",
    fontWeight: "700" as const,
    color: "#007bff",
  },
  loading: {
    textAlign: "center" as const,
    padding: "40px",
    color: "#666",
  },
  error: {
    padding: "15px",
    backgroundColor: "#ffebee",
    color: "#d32f2f",
    borderRadius: "4px",
  },
};

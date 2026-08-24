import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";
import { GuestDto } from "../types";

export const GuestsPage: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const { token, currentUser } = useAuth();
  const navigate = useNavigate();
  const [guests, setGuests] = useState<GuestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    groupId: "",
  });

  useEffect(() => {
    if (!token || !eventId) {
      navigate("/login");
      return;
    }

    if (!currentUser?.permissions.includes("create_guest")) {
      setError("У вас нет прав для управления гостями");
      return;
    }

    loadGuests();
  }, [token, eventId, currentUser, navigate]);

  const loadGuests = async () => {
    if (!eventId) return;

    setLoading(true);
    setError("");

    try {
      const data = await apiClient.getGuests(eventId);
      setGuests(data);
    } catch (err) {
      setError("Ошибка загрузки гостей");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId) return;

    try {
      await apiClient.createGuest(eventId, {
        name: formData.name,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        groupId: formData.groupId,
      });

      setFormData({ name: "", email: "", phone: "", groupId: "" });
      setShowForm(false);
      loadGuests();
    } catch (err) {
      setError("Ошибка создания гостя");
      console.error(err);
    }
  };

  const handleApproveGuest = async (guestId: string) => {
    if (!eventId) return;

    try {
      await apiClient.approveGuest(eventId, guestId, { status: "approved" });
      loadGuests();
    } catch (err) {
      console.error("Ошибка при одобрении гостя:", err);
    }
  };

  const handleRejectGuest = async (guestId: string) => {
    if (!eventId) return;

    try {
      await apiClient.approveGuest(eventId, guestId, { status: "rejected" });
      loadGuests();
    } catch (err) {
      console.error("Ошибка при отклонении гостя:", err);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1>Управление гостями</h1>
        <button onClick={() => navigate("/dashboard")} style={styles.backButton}>
          ← Назад
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {currentUser?.permissions.includes("create_guest") && (
        <button onClick={() => setShowForm(!showForm)} style={styles.createButton}>
          {showForm ? "Отмена" : "+ Добавить гостя"}
        </button>
      )}

      {showForm && (
        <form onSubmit={handleCreateGuest} style={styles.form}>
          <div style={styles.formGroup}>
            <label>Имя *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              style={styles.input}
            />
          </div>
          <div style={styles.formGroup}>
            <label>Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              style={styles.input}
            />
          </div>
          <div style={styles.formGroup}>
            <label>Телефон</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              style={styles.input}
            />
          </div>
          <div style={styles.formGroup}>
            <label>ID группы *</label>
            <input
              type="text"
              value={formData.groupId}
              onChange={(e) => setFormData({ ...formData, groupId: e.target.value })}
              required
              style={styles.input}
              placeholder="UUID группы"
            />
          </div>
          <button type="submit" style={styles.submitButton}>
            Создать
          </button>
        </form>
      )}

      {loading ? (
        <div style={styles.loading}>Загрузка...</div>
      ) : guests.length === 0 ? (
        <div style={styles.empty}>Гостей не найдено</div>
      ) : (
        <div style={styles.table}>
          <table>
            <thead>
              <tr>
                <th>Имя</th>
                <th>Email</th>
                <th>Телефон</th>
                <th>Статус</th>
                <th>Создан</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {guests.map((guest) => (
                <tr key={guest.id}>
                  <td>{guest.name}</td>
                  <td>{guest.email || "-"}</td>
                  <td>{guest.phone || "-"}</td>
                  <td>
                    <span
                      style={{
                        ...styles.status,
                        ...(guest.status === "pending"
                          ? styles.statusPending
                          : guest.status === "approved"
                          ? styles.statusApproved
                          : styles.statusRejected),
                      }}
                    >
                      {guest.status}
                    </span>
                  </td>
                  <td>{new Date(guest.createdAt).toLocaleDateString()}</td>
                  <td style={styles.actions}>
                    {guest.status === "pending" &&
                      currentUser?.permissions.includes("approve_guest") && (
                        <>
                          <button
                            onClick={() => handleApproveGuest(guest.id)}
                            style={styles.approveButton}
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => handleRejectGuest(guest.id)}
                            style={styles.rejectButton}
                          >
                            ✕
                          </button>
                        </>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    padding: "20px",
    maxWidth: "1200px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
  },
  backButton: {
    padding: "8px 16px",
    backgroundColor: "#666",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
  },
  createButton: {
    padding: "10px 20px",
    backgroundColor: "#28a745",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    marginBottom: "20px",
  },
  form: {
    backgroundColor: "white",
    padding: "20px",
    borderRadius: "8px",
    marginBottom: "20px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "15px",
  },
  formGroup: {
    display: "flex",
    flexDirection: "column" as const,
  },
  input: {
    padding: "8px",
    border: "1px solid #ddd",
    borderRadius: "4px",
    fontSize: "14px",
  },
  submitButton: {
    padding: "10px 20px",
    backgroundColor: "#007bff",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    gridColumn: "1 / -1",
  },
  table: {
    backgroundColor: "white",
    borderRadius: "8px",
    overflow: "hidden",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)",
  },
  status: {
    padding: "4px 8px",
    borderRadius: "3px",
    fontSize: "12px",
    fontWeight: "600" as const,
  },
  statusPending: {
    backgroundColor: "#fff3cd",
    color: "#856404",
  },
  statusApproved: {
    backgroundColor: "#d4edda",
    color: "#155724",
  },
  statusRejected: {
    backgroundColor: "#f8d7da",
    color: "#721c24",
  },
  actions: {
    display: "flex",
    gap: "5px",
  },
  approveButton: {
    padding: "4px 8px",
    backgroundColor: "#28a745",
    color: "white",
    border: "none",
    borderRadius: "3px",
    cursor: "pointer",
    fontSize: "12px",
  },
  rejectButton: {
    padding: "4px 8px",
    backgroundColor: "#dc3545",
    color: "white",
    border: "none",
    borderRadius: "3px",
    cursor: "pointer",
    fontSize: "12px",
  },
  loading: {
    textAlign: "center" as const,
    padding: "40px",
    color: "#666",
  },
  empty: {
    textAlign: "center" as const,
    padding: "40px",
    color: "#999",
  },
  error: {
    padding: "15px",
    backgroundColor: "#ffebee",
    color: "#d32f2f",
    borderRadius: "4px",
    marginBottom: "20px",
  },
};

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";

const getTodayInputValue = () => {
  const today = new Date();
  const offset = today.getTimezoneOffset();
  return new Date(today.getTime() - offset * 60_000).toISOString().slice(0, 10);
};

export const CreateEventPage: React.FC = () => {
  const navigate = useNavigate();
  const { addEvent } = useAuth();
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState(getTodayInputValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const createdEvent = await apiClient.createEvent({
        name: name.trim(),
        eventDate,
      });
      addEvent({
        id: createdEvent.id,
        name: createdEvent.name,
        roleName: "Administrator",
        eventDate: createdEvent.eventDate,
        createdAt: createdEvent.createdAt,
        createdByName: createdEvent.createdByName,
      });
      navigate(`/events/${createdEvent.id}/guests`);
    } catch (err) {
      setError("Не удалось создать мероприятие.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-shell narrow">
      <header className="page-header">
        <div>
          <p className="eyebrow">Новое мероприятие</p>
          <h1>Создать мероприятие</h1>
          <p className="muted">
            После создания откроется страница настройки мероприятия с вкладкой гостей.
          </p>
        </div>
        <button className="secondary-button" onClick={() => navigate("/dashboard")}>Назад</button>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="panel">
        <form className="form employee-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Название *</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label className="field">
            <span>Дата мероприятия *</span>
            <input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} required />
          </label>
          <button className="primary-button" type="submit" disabled={loading || !name.trim() || !eventDate}>
            {loading ? "Создаём..." : "Создать мероприятие"}
          </button>
        </form>
      </section>
    </main>
  );
};

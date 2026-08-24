import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../services/apiClient";

export const CreateEventPage: React.FC = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await apiClient.createEvent({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      navigate("/dashboard");
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
          <p className="muted">После создания бэкенд заведёт корневую группу по умолчанию.</p>
        </div>
        <button className="secondary-button" onClick={() => navigate("/dashboard")}>Назад</button>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="panel">
        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Название</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label className="field">
            <span>Описание</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} />
          </label>
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "Создаём..." : "Создать мероприятие"}
          </button>
        </form>
      </section>
    </main>
  );
};

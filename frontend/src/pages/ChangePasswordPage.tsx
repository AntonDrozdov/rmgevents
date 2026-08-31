import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { RmgLogo } from "../components/RmgLogo";
import { useAuth } from "../contexts/AuthContext";

export const ChangePasswordPage: React.FC = () => {
  const { token, loginName, mustChangePassword, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true });
    } else if (!mustChangePassword) {
      navigate("/dashboard", { replace: true });
    }
  }, [token, mustChangePassword, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (newPassword !== confirmation) {
      setError("Новый пароль и подтверждение не совпадают.");
      return;
    }

    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const backendMessage = axios.isAxiosError(err) && typeof err.response?.data === "string"
        ? err.response.data
        : "Не удалось изменить пароль.";
      setError(backendMessage);
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <main className="login-page">
      <section className="login-card">
        <RmgLogo />
        <h1>Смена временного пароля</h1>
        <p className="muted">
          Для логина <strong>{loginName}</strong> установлен временный пароль. Измените его, чтобы продолжить работу.
        </p>

        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Текущий пароль</span>
            <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} disabled={saving} required autoFocus />
          </label>
          <label className="field">
            <span>Новый пароль</span>
            <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} disabled={saving} required minLength={8} />
          </label>
          <label className="field">
            <span>Повторите новый пароль</span>
            <input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={saving} required minLength={8} />
          </label>

          {error && <div className="alert alert-error">{error}</div>}

          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? "Сохраняем..." : "Изменить пароль"}
          </button>
          <button className="secondary-button" type="button" onClick={handleLogout} disabled={saving}>
            Выйти
          </button>
        </form>
      </section>
    </main>
  );
};

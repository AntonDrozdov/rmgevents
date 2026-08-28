import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RmgLogo } from "../components/RmgLogo";
import { useAuth } from "../contexts/AuthContext";

export const LoginPage: React.FC = () => {
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, token } = useAuth();

  useEffect(() => {
    if (token) {
      navigate("/dashboard", { replace: true });
    }
  }, [token, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(loginName.trim(), password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError("Не удалось войти. Проверьте логин и пароль.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card">
        <RmgLogo />
        <h1>Система управления мероприятиями</h1>
        <p className="muted">
          Войдите, чтобы открыть дашборд доступных вам мероприятий.
        </p>

        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Логин</span>
            <input
              type="text"
              value={loginName}
              onChange={(event) => setLoginName(event.target.value)}
              placeholder="Введите логин"
              disabled={loading}
              required
            />
          </label>

          <label className="field">
            <span>Пароль</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Введите пароль"
              disabled={loading}
              required
            />
          </label>

          {error && <div className="alert alert-error">{error}</div>}

          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "Входим..." : "Войти"}
          </button>
        </form>
      </section>
    </main>
  );
};

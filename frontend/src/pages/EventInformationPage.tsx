import axios from "axios";
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";

const allowedExtensions = new Set(["jpg", "jpeg", "png", "svg"]);
const maximumCoverSize = 5 * 1024 * 1024;

const getErrorMessage = (error: unknown, fallback: string) => {
  const responseData = axios.isAxiosError(error) ? error.response?.data : null;
  if (typeof responseData === "string") return responseData;
  if (responseData && typeof responseData.message === "string") return responseData.message;
  return fallback;
};

export const EventInformationPage: React.FC = () => {
  const { eventId = "" } = useParams<{ eventId: string }>();
  const { updateEvent } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [logoImageId, setLogoImageId] = useState<number | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [initialValues, setInitialValues] = useState({
    name: "",
    description: "",
    eventDate: "",
    logoImageId: null as number | null,
  });

  const isDirty = coverFile !== null ||
    name.trim() !== initialValues.name ||
    description.trim() !== initialValues.description ||
    eventDate !== initialValues.eventDate ||
    logoImageId !== initialValues.logoImageId;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setCoverFile(null);

    apiClient.getEvent(eventId)
      .then((event) => {
        if (!active) return;
        setName(event.name);
        setDescription(event.description ?? "");
        setEventDate(event.eventDate.slice(0, 10));
        setLogoImageId(event.logoImageId ?? null);
        setCoverPreview(event.logoImageId ? apiClient.getImageUrl(event.logoImageId) : null);
        setInitialValues({
          name: event.name,
          description: (event.description ?? "").trim(),
          eventDate: event.eventDate.slice(0, 10),
          logoImageId: event.logoImageId ?? null,
        });
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError, "Не удалось загрузить настройки мероприятия."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [eventId]);

  useEffect(() => {
    if (!coverFile) return;
    const objectUrl = URL.createObjectURL(coverFile);
    setCoverPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [coverFile]);

  const handleCoverChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError("");
    setSuccess("");
    const file = event.target.files?.[0] ?? null;
    if (!file) return;

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!allowedExtensions.has(extension)) {
      setError("Допустимы только файлы JPG, JPEG, PNG и SVG.");
      event.target.value = "";
      return;
    }
    if (file.size > maximumCoverSize) {
      setError("Размер обложки не должен превышать 5 МБ.");
      event.target.value = "";
      return;
    }
    setCoverFile(file);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isDirty) return;
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      let nextLogoImageId = logoImageId;
      if (coverFile) {
        nextLogoImageId = await apiClient.uploadEventCover(eventId, coverFile);
      }

      const updatedEvent = await apiClient.updateEvent(eventId, {
        name: name.trim(),
        description: description.trim() || null,
        eventDate,
        logoImageId: nextLogoImageId,
      });

      setLogoImageId(updatedEvent.logoImageId ?? null);
      setCoverFile(null);
      setCoverPreview(updatedEvent.logoImageId ? apiClient.getImageUrl(updatedEvent.logoImageId) : null);
      setName(updatedEvent.name);
      setDescription(updatedEvent.description ?? "");
      setEventDate(updatedEvent.eventDate.slice(0, 10));
      setInitialValues({
        name: updatedEvent.name,
        description: (updatedEvent.description ?? "").trim(),
        eventDate: updatedEvent.eventDate.slice(0, 10),
        logoImageId: updatedEvent.logoImageId ?? null,
      });
      updateEvent(updatedEvent);
      setSuccess("Настройки мероприятия сохранены.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось сохранить настройки мероприятия."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="event-information-panel panel">
      <div className="event-information-heading">
        <div>
          <p className="eyebrow">Мероприятие</p>
          <h1>Настройки</h1>
          <p className="muted">Измените основную информацию и обложку мероприятия.</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {loading ? (
        <p className="muted">Загрузка настроек...</p>
      ) : (
        <form className="form event-information-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Название *</span>
            <input
              value={name}
              onChange={(event) => { setName(event.target.value); setSuccess(""); }}
              maxLength={255}
              disabled={saving}
              required
            />
          </label>

          <label className="field">
            <span>Дата мероприятия *</span>
            <input
              type="date"
              value={eventDate}
              onChange={(event) => { setEventDate(event.target.value); setSuccess(""); }}
              disabled={saving}
              required
            />
          </label>

          <label className="field event-description-field">
            <span>Описание</span>
            <textarea
              value={description}
              onChange={(event) => { setDescription(event.target.value); setSuccess(""); }}
              rows={5}
              maxLength={2000}
              disabled={saving}
            />
            <small>{description.length}/2000</small>
          </label>

          <div className="event-cover-field">
            <span className="event-cover-label">Обложка</span>
            <div className="event-cover-editor">
              <div className="event-cover-preview">
                {coverPreview ? (
                  <img src={coverPreview} alt="Обложка мероприятия" />
                ) : (
                  <span>Обложка не загружена</span>
                )}
              </div>
              <label className={`secondary-button event-cover-upload${coverFile ? " selected" : ""}`}>
                {coverFile ? "✓ Изображение выбрано" : "Выбрать изображение"}
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.svg,image/jpeg,image/png,image/svg+xml"
                  onChange={handleCoverChange}
                  disabled={saving}
                />
              </label>
              <small className={coverFile ? "event-cover-file-name" : undefined}>
                {coverFile ? coverFile.name : "JPG, JPEG, PNG или SVG, до 5 МБ."}
              </small>
            </div>
          </div>

          <div className="event-information-actions">
            <button
              className="primary-button"
              type="submit"
              disabled={saving || !name.trim() || !eventDate || !isDirty}
            >
              {saving ? "Сохраняем..." : "Сохранить"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
};

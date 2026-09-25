import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ReferenceCollection } from "../components/ReferenceCollection";
import { Modal } from "../components/Modal";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";
import { TagDto } from "../types";

const EditIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Zm12.5-16.5 4 4 1-1a1.4 1.4 0 0 0 0-2l-2-2a1.4 1.4 0 0 0-2 0l-1 1Z" /></svg>;
const DeleteIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21a2 2 0 0 1-2-2V6h14v13a2 2 0 0 1-2 2H7Zm1-3h2V9H8v9Zm6 0h2V9h-2v9ZM4 5V3h5l1-1h4l1 1h5v2H4Z" /></svg>;

const emptyForm = { name: "" };
const formatDateTime = (value: string) => new Date(value).toLocaleString("ru-RU");

export const TagsPage: React.FC = () => {
  const { eventId = "" } = useParams<{ eventId: string }>();
  const { currentUser, currentEvent, events } = useAuth();
  const [tags, setTags] = useState<TagDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<TagDto | null>(null);
  const [deleteTag, setDeleteTag] = useState<TagDto | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  const selectedEvent = useMemo(
    () => events.find((event) => String(event.id) === eventId) ?? currentEvent,
    [events, eventId, currentEvent]
  );
  const isArchived = selectedEvent?.isArchived ?? false;
  const canManageTags = (currentUser?.permissions.includes("create_event") ?? false) && !isArchived;
  const isFormDirty = editingTag !== null && (
    formData.name.trim() !== editingTag.name
  );

  const loadTags = async () => {
    if (!eventId) return;

    setLoading(true);
    setError("");
    try {
      const result = await apiClient.getTags(eventId);
      setTags(result);
    } catch (err) {
      setError("Не удалось загрузить метки.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadTags(); }, [eventId]);

  const openCreateModal = () => {
    setError("");
    setEditingTag(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const openEditModal = (tag: TagDto) => {
    setError("");
    setEditingTag(tag);
    setFormData({ name: tag.name });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setIsModalOpen(false);
    setEditingTag(null);
    setFormData(emptyForm);
    setError("");
  };

  const submitTag = async (event: React.FormEvent) => {
    event.preventDefault();
    if (editingTag && !isFormDirty) return;

    if (!formData.name.trim() || formData.name.length > 50) {
      setError("Название метки: от 1 до 50 символов.");
      return;
    }

    setSaving(true);
    setError("");
    const request = {
      name: formData.name.trim(),
      color: "#FFFFFF",
    };

    try {
      if (editingTag) {
        const updated = await apiClient.updateTag(eventId, editingTag.id, request);
        setTags((current) => current.map((tag) =>
          tag.id === updated.id ? updated : tag));
      } else {
        const created = await apiClient.createTag(eventId, request);
        setTags((current) => [...current, created].sort((left, right) =>
          left.name.localeCompare(right.name, "ru")));
      }

      setIsModalOpen(false);
      setEditingTag(null);
      setFormData(emptyForm);
      setError("");
    } catch (err) {
      setError(editingTag ? "Не удалось сохранить метку." : "Не удалось создать метку.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTag) return;

    setSaving(true);
    setError("");
    try {
      await apiClient.deleteTag(eventId, deleteTag.id);
      setTags((current) => current.filter((tag) => tag.id !== deleteTag.id));
      setDeleteTag(null);
    } catch (err) {
      setError("Не удалось удалить метку.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return <div className="tab-content">
    <div className="section-heading">
      <div className="section-title-row">
        <h2>Метки</h2>
        <span className="badge">Всего: {tags.length}</span>
      </div>
      <div className="section-actions">
        {canManageTags && (
          <button className="primary-button create-action-button" type="button" onClick={openCreateModal}>
            Создать метку
          </button>
        )}
      </div>
    </div>

    {error && !isModalOpen && !deleteTag && <div className="alert alert-error">{error}</div>}
    {isArchived && <div className="alert alert-info">Мероприятие завершено. Метки доступны только для просмотра.</div>}

    <ReferenceCollection items={tags} variant="tags" loading={loading} canManage={canManageTags} onEdit={openEditModal}
      renderActions={(tag) => <><button className="icon-button" type="button" onClick={() => openEditModal(tag)} title="Редактировать" aria-label={`Редактировать ${tag.name}`}>
                          <EditIcon />
                        </button>
                        <button className="icon-button icon-button-danger" type="button" onClick={() => setDeleteTag(tag)} title="Удалить" aria-label={`Удалить ${tag.name}`}>
                          <DeleteIcon />
                        </button></>} />

    {isModalOpen && (
      <Modal
        title={editingTag ? "Редактировать метку" : "Создать метку"}
        description="Укажите название метки (до 50 символов)."
        onClose={closeModal}
      >
        {error && <div className="alert alert-error">{error}</div>}
        <form className="form category-form" onSubmit={submitTag}>
          {editingTag && (
            <label className="field">
              <span>Дата создания</span>
              <input value={formatDateTime(editingTag.createdAt)} readOnly />
            </label>
          )}
          <label className="field">
            <span>Название метки</span>
            <input
              value={formData.name}
              onChange={(event) => setFormData({ ...formData, name: event.target.value })}
              disabled={saving}
              maxLength={50}
              required
            />
          </label>
          <span className="tag-badge">{formData.name.trim() || "Новая метка"}</span>
          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={closeModal} disabled={saving}>Закрыть</button>
            <button className="primary-button" type="submit" disabled={saving || Boolean(editingTag && !isFormDirty)}>
              {saving ? "Сохраняем..." : "Сохранить"}
            </button>
          </div>
        </form>
      </Modal>
    )}

    {deleteTag && (
      <Modal
        title="Удалить метку"
        description={`Метка «${deleteTag.name}» будет удалена. У гостей эта метка будет снята.`}
        onClose={() => !saving && setDeleteTag(null)}
      >
        {error && <div className="alert alert-error">{error}</div>}
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={() => setDeleteTag(null)} disabled={saving}>Отмена</button>
          <button className="danger-button" type="button" onClick={confirmDelete} disabled={saving}>
            {saving ? "Удаляем..." : "Удалить"}
          </button>
        </div>
      </Modal>
    )}
  </div>;
};

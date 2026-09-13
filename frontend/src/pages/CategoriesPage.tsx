import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Modal } from "../components/Modal";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";
import { CategoryDto } from "../types";

const EditIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Zm12.5-16.5 4 4 1-1a1.4 1.4 0 0 0 0-2l-2-2a1.4 1.4 0 0 0-2 0l-1 1Z" /></svg>;
const DeleteIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21a2 2 0 0 1-2-2V6h14v13a2 2 0 0 1-2 2H7Zm1-3h2V9H8v9Zm6 0h2V9h-2v9ZM4 5V3h5l1-1h4l1 1h5v2H4Z" /></svg>;

const emptyForm = { name: "", color: "#292962" };
const formatDateTime = (value: string) => new Date(value).toLocaleString("ru-RU");

export const CategoriesPage: React.FC = () => {
  const { eventId = "" } = useParams<{ eventId: string }>();
  const { currentUser, currentEvent, events } = useAuth();
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryDto | null>(null);
  const [deleteCategory, setDeleteCategory] = useState<CategoryDto | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  const selectedEvent = useMemo(
    () => events.find((event) => String(event.id) === eventId) ?? currentEvent,
    [events, eventId, currentEvent]
  );
  const isArchived = selectedEvent?.isArchived ?? false;
  const canManageCategories = (currentUser?.permissions.includes("create_event") ?? false) && !isArchived;
  const isFormDirty = editingCategory !== null && (
    formData.name.trim() !== editingCategory.name ||
    formData.color.toUpperCase() !== editingCategory.color.toUpperCase()
  );

  const loadCategories = async () => {
    if (!eventId) return;

    setLoading(true);
    setError("");
    try {
      const result = await apiClient.getCategories(eventId);
      setCategories(result);
    } catch (err) {
      setError("Не удалось загрузить категории.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadCategories(); }, [eventId]);

  const openCreateModal = () => {
    setError("");
    setEditingCategory(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const openEditModal = (category: CategoryDto) => {
    setError("");
    setEditingCategory(category);
    setFormData({ name: category.name, color: category.color });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setIsModalOpen(false);
    setEditingCategory(null);
    setFormData(emptyForm);
    setError("");
  };

  const submitCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (editingCategory && !isFormDirty) return;

    setSaving(true);
    setError("");
    const request = {
      name: formData.name.trim(),
      color: formData.color,
    };

    try {
      if (editingCategory) {
        const updated = await apiClient.updateCategory(eventId, editingCategory.id, request);
        setCategories((current) => current.map((category) =>
          category.id === updated.id ? updated : category));
      } else {
        const created = await apiClient.createCategory(eventId, request);
        setCategories((current) => [...current, created].sort((left, right) =>
          left.name.localeCompare(right.name, "ru")));
      }

      setIsModalOpen(false);
      setEditingCategory(null);
      setFormData(emptyForm);
      setError("");
    } catch (err) {
      setError(editingCategory ? "Не удалось сохранить категорию." : "Не удалось создать категорию.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteCategory) return;

    setSaving(true);
    setError("");
    try {
      await apiClient.deleteCategory(eventId, deleteCategory.id);
      setCategories((current) => current.filter((category) => category.id !== deleteCategory.id));
      setDeleteCategory(null);
    } catch (err) {
      setError("Не удалось удалить категорию.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return <div className="tab-content">
    <div className="section-heading">
      <div className="section-title-row">
        <h2>Категории</h2>
        <span className="badge">Всего: {categories.length}</span>
      </div>
      <div className="section-actions">
        {canManageCategories && (
          <button className="primary-button create-action-button" type="button" onClick={openCreateModal}>
            Создать категорию
          </button>
        )}
      </div>
    </div>

    {error && !isModalOpen && !deleteCategory && <div className="alert alert-error">{error}</div>}
    {isArchived && <div className="alert alert-info">Мероприятие завершено. Категории доступны только для просмотра.</div>}

    <section className="panel">
      {loading ? (
        <div className="empty-state compact">Загрузка...</div>
      ) : categories.length === 0 ? (
        <div className="empty-state compact">Категорий пока нет.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Название</th>
                <th>Цвет</th>
                <th>Создана</th>
                <th className="actions-column" aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr
                  className={canManageCategories ? "table-hover-row table-editable-row" : "table-hover-row"}
                  key={category.id}
                  tabIndex={canManageCategories ? 0 : undefined}
                  onClick={canManageCategories ? (event) => {
                    if (!(event.target as HTMLElement).closest("button, a, input, select, textarea")) {
                      openEditModal(category);
                    }
                  } : undefined}
                  onKeyDown={canManageCategories ? (event) => {
                    if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      openEditModal(category);
                    }
                  } : undefined}
                >
                  <td>
                    <span className="category-arrow" style={{ backgroundColor: category.color, color: "#ffffff" }}>
                      {category.name}
                    </span>
                  </td>
                  <td>
                    <div className="category-color-cell">
                      <span className="category-color-swatch" style={{ backgroundColor: category.color }} aria-hidden="true" />
                      <span>{category.color}</span>
                    </div>
                  </td>
                  <td>{formatDateTime(category.createdAt)}</td>
                  <td className="actions-column">
                    {canManageCategories ? (
                      <div className="table-icon-actions">
                        <button className="icon-button" type="button" onClick={() => openEditModal(category)} title="Редактировать" aria-label={`Редактировать ${category.name}`}>
                          <EditIcon />
                        </button>
                        <button className="icon-button icon-button-danger" type="button" onClick={() => setDeleteCategory(category)} title="Удалить" aria-label={`Удалить ${category.name}`}>
                          <DeleteIcon />
                        </button>
                      </div>
                    ) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>

    {isModalOpen && (
      <Modal
        title={editingCategory ? "Редактировать категорию" : "Создать категорию"}
        description="Укажите название и цвет категории. Цвет будет отображаться в строках гостей."
        onClose={closeModal}
      >
        {error && <div className="alert alert-error">{error}</div>}
        <form className="form category-form" onSubmit={submitCategory}>
          <label className="field">
            <span>Название категории</span>
            <input
              value={formData.name}
              onChange={(event) => setFormData({ ...formData, name: event.target.value })}
              disabled={saving}
              maxLength={255}
              required
            />
          </label>
          <div className="field category-color-field">
            <span>Цвет категории</span>
            <div className="category-color-picker-row">
              <input
                className="category-color-input"
                type="color"
                value={formData.color}
                onChange={(event) => setFormData({ ...formData, color: event.target.value })}
                disabled={saving}
                required
              />
              <span className="category-color-value">{formData.color.toUpperCase()}</span>
              <span className="category-arrow" style={{ backgroundColor: formData.color, color: "#ffffff" }}>
                {formData.name.trim() || "Новая категория"}
              </span>
            </div>
          </div>
          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={closeModal} disabled={saving}>Закрыть</button>
            <button className="primary-button" type="submit" disabled={saving || Boolean(editingCategory && !isFormDirty)}>
              {saving ? "Сохраняем..." : "Сохранить"}
            </button>
          </div>
        </form>
      </Modal>
    )}

    {deleteCategory && (
      <Modal
        title="Удалить категорию"
        description={`Категория «${deleteCategory.name}» будет удалена. У гостей эта категория будет снята.`}
        onClose={() => !saving && setDeleteCategory(null)}
      >
        {error && <div className="alert alert-error">{error}</div>}
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={() => setDeleteCategory(null)} disabled={saving}>Отмена</button>
          <button className="danger-button" type="button" onClick={confirmDelete} disabled={saving}>
            {saving ? "Удаляем..." : "Удалить"}
          </button>
        </div>
      </Modal>
    )}
  </div>;
};

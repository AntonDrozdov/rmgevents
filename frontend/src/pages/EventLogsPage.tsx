import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Modal } from "../components/Modal";
import { apiClient } from "../services/apiClient";
import { EventLogDto, EventLogFilterOptionsDto } from "../types";

const actionLabels: Record<string, string> = {
  created: "Создание",
  updated: "Изменение",
  deleted: "Удаление",
  submitted_for_review: "Отправка на согласование",
  reviewer_approved: "Согласование",
  admin_approved: "Согласование администратором",
  rejected: "Отклонение",
  invited: "Приглашение",
  restored_to_saved: "Возврат в сохранённые",
  archived: "Завершение",
  restored: "Возврат в активные",
  password_reset: "Сброс пароля",
  cover_uploaded: "Загрузка обложки",
};

const entityLabels: Record<string, string> = {
  Event: "Мероприятие",
  Guest: "Гость",
  Category: "Категория",
  Tag: "Метка",
  Group: "Группа",
  User: "Сотрудник",
};

const emptyOptions: EventLogFilterOptionsDto = {
  users: [],
  actions: [],
  entityTypes: [],
};

const formatDateTime = (value: string) => new Date(value).toLocaleString("ru-RU");
const toDateTimeOffsetStart = (value: string) =>
  value ? new Date(`${value}T00:00:00.000`).toISOString() : undefined;
const toDateTimeOffsetEnd = (value: string) =>
  value ? new Date(`${value}T23:59:59.999`).toISOString() : undefined;

export const EventLogsPage: React.FC = () => {
  const { eventId = "" } = useParams<{ eventId: string }>();
  const [logs, setLogs] = useState<EventLogDto[]>([]);
  const [options, setOptions] = useState<EventLogFilterOptionsDto>(emptyOptions);
  const [loading, setLoading] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [logSearch, setLogSearch] = useState("");
  const [debouncedLogSearch, setDebouncedLogSearch] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [draftUserFilter, setDraftUserFilter] = useState("");
  const [draftActionFilter, setDraftActionFilter] = useState("");
  const [draftEntityTypeFilter, setDraftEntityTypeFilter] = useState("");
  const [draftDateFromFilter, setDraftDateFromFilter] = useState("");
  const [draftDateToFilter, setDraftDateToFilter] = useState("");

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const pageStart = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(currentPage * pageSize, totalCount);
  const canGoPreviousPage = currentPage > 1;
  const canGoNextPage = currentPage < totalPages;
  const activeFiltersCount = [
    userFilter,
    actionFilter,
    entityTypeFilter,
    debouncedLogSearch,
    dateFromFilter,
    dateToFilter,
  ].filter(Boolean).length;

  const selectedUserName = useMemo(
    () => options.users.find((user) => String(user.userId) === draftUserFilter)?.name ?? "Все пользователи",
    [options.users, draftUserFilter]
  );
  const selectedActionName = draftActionFilter ? actionLabels[draftActionFilter] ?? draftActionFilter : "Все действия";
  const selectedEntityName = draftEntityTypeFilter ? entityLabels[draftEntityTypeFilter] ?? draftEntityTypeFilter : "Все сущности";

  const loadLogs = async () => {
    if (!eventId) return;

    setLoading(true);
    setError("");
    try {
      const result = await apiClient.getEventLogs(eventId, {
        page: currentPage,
        pageSize,
        userId: userFilter ? Number(userFilter) : undefined,
        action: actionFilter || undefined,
        entityType: entityTypeFilter || undefined,
        search: debouncedLogSearch || undefined,
        dateFrom: toDateTimeOffsetStart(dateFromFilter),
        dateTo: toDateTimeOffsetEnd(dateToFilter),
      });
      setLogs(result.items);
      setTotalCount(result.totalCount);
      setCurrentPage(result.page);
      setPageSize(result.pageSize);
    } catch (err) {
      setError("Не удалось загрузить логи мероприятия.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadLogs(); }, [eventId, currentPage, pageSize, userFilter, actionFilter, entityTypeFilter, debouncedLogSearch, dateFromFilter, dateToFilter]);

  useEffect(() => {
    if (!eventId) return;

    setOptionsLoading(true);
    void apiClient.getEventLogFilterOptions(eventId)
      .then(setOptions)
      .catch((err) => {
        console.error(err);
      })
      .finally(() => setOptionsLoading(false));
  }, [eventId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const normalizedSearch = logSearch.trim();
      setDebouncedLogSearch(normalizedSearch.length >= 2 ? normalizedSearch : "");
      setCurrentPage(1);
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [logSearch]);

  const openFiltersModal = () => {
    setDraftUserFilter(userFilter);
    setDraftActionFilter(actionFilter);
    setDraftEntityTypeFilter(entityTypeFilter);
    setDraftDateFromFilter(dateFromFilter);
    setDraftDateToFilter(dateToFilter);
    setIsFiltersModalOpen(true);
  };

  const applyFilters = () => {
    setUserFilter(draftUserFilter);
    setActionFilter(draftActionFilter);
    setEntityTypeFilter(draftEntityTypeFilter);
    setDateFromFilter(draftDateFromFilter);
    setDateToFilter(draftDateToFilter);
    setCurrentPage(1);
    setIsFiltersModalOpen(false);
  };

  const resetFilters = () => {
    setDraftUserFilter("");
    setDraftActionFilter("");
    setDraftEntityTypeFilter("");
    setDraftDateFromFilter("");
    setDraftDateToFilter("");
    setUserFilter("");
    setActionFilter("");
    setEntityTypeFilter("");
    setLogSearch("");
    setDebouncedLogSearch("");
    setDateFromFilter("");
    setDateToFilter("");
    setCurrentPage(1);
    setIsFiltersModalOpen(false);
  };

  return <div className="tab-content">
    <div className="section-heading">
      <div className="section-title-row">
        <h2>Логи</h2>
        <span className="badge">Всего: {totalCount}</span>
      </div>
    </div>

    {error && !isFiltersModalOpen && <div className="alert alert-error">{error}</div>}

    <section className="panel logs-panel">
      <div className="logs-toolbar">
        <button
          className={`secondary-button filter-modal-button${activeFiltersCount > 0 ? " active" : ""}`}
          type="button"
          onClick={openFiltersModal}
          disabled={loading || optionsLoading}
        >
          Фильтровать{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ""}
        </button>
        <label className="field event-log-search-field">
          <span>Поиск по описанию</span>
          <input
            value={logSearch}
            onChange={(event) => setLogSearch(event.target.value)}
            placeholder="Например: имя гостя или категория"
          />
        </label>
        {activeFiltersCount > 0 && <span className="guest-search-count">Найдено: {totalCount}</span>}
      </div>

      {loading ? (
        <div className="empty-state compact">Загрузка...</div>
      ) : logs.length === 0 ? (
        <div className="empty-state compact">Логов по выбранным фильтрам пока нет.</div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="event-log-table">
              <thead>
                <tr>
                  <th>Когда</th>
                  <th>Кто</th>
                  <th>Действие</th>
                  <th>Сущность</th>
                  <th>Информация</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="event-log-date-cell">{formatDateTime(log.createdAt)}</td>
                    <td>
                      <div className="event-log-user-cell">
                        <span>{log.actorName}</span>
                        {log.actorRoleName && <small>{log.actorRoleName}</small>}
                      </div>
                    </td>
                    <td>
                      <span className="log-chip muted">{actionLabels[log.action] ?? log.action}</span>
                    </td>
                    <td>
                      <span className="log-chip">{entityLabels[log.entityType] ?? log.entityType}</span>
                    </td>
                    <td className="event-log-description-cell">
                      <strong>{log.title}</strong>
                      {log.description && <span>{log.description}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination-row">
            <div className="pagination-summary">Показаны {pageStart}-{pageEnd} из {totalCount}</div>
            <label className="pagination-size">
              <span>На странице</span>
              <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setCurrentPage(1); }} disabled={loading}>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </label>
            <div className="pagination-actions">
              <button className="secondary-button pagination-button" type="button" onClick={() => setCurrentPage((value) => Math.max(1, value - 1))} disabled={loading || !canGoPreviousPage}>Назад</button>
              <span className="pagination-current">Страница {currentPage} из {totalPages}</span>
              <button className="secondary-button pagination-button" type="button" onClick={() => setCurrentPage((value) => Math.min(totalPages, value + 1))} disabled={loading || !canGoNextPage}>Вперёд</button>
            </div>
          </div>
        </>
      )}
    </section>

    {isFiltersModalOpen && <Modal className="filters-modal event-log-filters-modal" title="Фильтры логов" description="Можно сузить ленту по пользователю, типу действия, сущности и дате." onClose={() => setIsFiltersModalOpen(false)}>
      <div className="filters-form">
        <div className="log-filter-grid">
          <label className="field">
            <span>Пользователь</span>
            <select value={draftUserFilter} onChange={(event) => setDraftUserFilter(event.target.value)}>
              <option value="">Все пользователи</option>
              {options.users.map((user) => (
                <option key={user.userId} value={user.userId}>{user.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Действие</span>
            <select value={draftActionFilter} onChange={(event) => setDraftActionFilter(event.target.value)}>
              <option value="">Все действия</option>
              {options.actions.map((action) => (
                <option key={action} value={action}>{actionLabels[action] ?? action}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Сущность</span>
            <select value={draftEntityTypeFilter} onChange={(event) => setDraftEntityTypeFilter(event.target.value)}>
              <option value="">Все сущности</option>
              {options.entityTypes.map((entityType) => (
                <option key={entityType} value={entityType}>{entityLabels[entityType] ?? entityType}</option>
              ))}
            </select>
          </label>
          <div className="event-log-date-filter-row">
            <label className="field">
              <span>Дата с</span>
              <input type="date" value={draftDateFromFilter} onChange={(event) => setDraftDateFromFilter(event.target.value)} />
            </label>
            <label className="field">
              <span>Дата по</span>
              <input type="date" value={draftDateToFilter} onChange={(event) => setDraftDateToFilter(event.target.value)} />
            </label>
          </div>
        </div>

        <div className="event-log-filter-summary">
          <span>{selectedUserName}</span>
          <span>{selectedActionName}</span>
          <span>{selectedEntityName}</span>
          {(draftDateFromFilter || draftDateToFilter) && (
            <span>
              {draftDateFromFilter || "начало"} — {draftDateToFilter || "сегодня"}
            </span>
          )}
        </div>

        <div className="modal-actions filters-modal-actions">
          <button className="secondary-button" type="button" onClick={() => setIsFiltersModalOpen(false)}>Отмена</button>
          <button className="secondary-button" type="button" onClick={resetFilters}>Сбросить</button>
          <button className="primary-button" type="button" onClick={applyFilters}>Применить</button>
        </div>
      </div>
    </Modal>}
  </div>;
};

import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import { createPortal } from "react-dom";
import { Modal } from "./Modal";
import { apiClient, AssistantAction, AssistantModelOption, AssistantTokenUsage } from "../services/apiClient";
import { useAuth } from "../contexts/AuthContext";

type Message = { role: "user" | "assistant"; content: string; sources?: string[]; actions?: AssistantAction[]; usage?: AssistantTokenUsage | null };
type StoredChat = {
  messages: Message[];
  modelId: string;
  activeEventId: number | null;
  onboardingSeen: boolean;
  pendingEventQuestion: string | null;
};
const sourceNames: Record<string, string> = { get_event_summary: "Сводка гостей", list_guests: "Список гостей", search_guests: "Поиск гостей", search_guests_across_events: "Поиск гостей по мероприятиям", get_guest_neighbors: "Соседние места", get_groups: "Группы и квоты", get_placements: "Размещение", get_event_catalogs: "Справочники и сотрудники", list_staff: "Список сотрудников", search_staff: "Поиск сотрудников", get_staff_summary: "Статистика сотрудников", search_staff_across_events: "Поиск сотрудников по мероприятиям" };
const price = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const modelCost = (model: AssistantModelOption) => model.inputPricePerThousandTokens !== null && model.outputPricePerThousandTokens !== null
  ? `вход ${price.format(model.inputPricePerThousandTokens)} ₽ / выход ${price.format(model.outputPricePerThousandTokens)} ₽ за 1 000 токенов`
  : "стоимость не указана в локальном справочнике";
const compactModelCost = (model: AssistantModelOption) => model.inputPricePerThousandTokens !== null && model.outputPricePerThousandTokens !== null
  ? `вх. ${price.format(model.inputPricePerThousandTokens)} ₽ · вых. ${price.format(model.outputPricePerThousandTokens)} ₽ / 1 000`
  : "цена не указана";
const tokens = new Intl.NumberFormat("ru-RU");
const eventDataPattern = /(гост|групп|квот|категор|метк|сотруд|билет|рассад|размещ|журнал|лог|согласован|мероприят)/i;
const switchEventPattern = /(выб(?:ери|рать)|смен(?:и|ить)|друг(?:ое|ом)|какое мероприятие|список мероприятий)/i;
const crossEventSearchPattern = /(в\s+каких|на\s+каких|по\s+всем|во\s+всех)\s+(мероприят|событи)/i;

function readStoredChat(key: string): StoredChat | null {
  try {
    const value = sessionStorage.getItem(key);
    if (!value) return null;
    const data = JSON.parse(value) as Partial<StoredChat>;
    return {
      messages: Array.isArray(data.messages) ? data.messages : [],
      modelId: typeof data.modelId === "string" ? data.modelId : "",
      activeEventId: typeof data.activeEventId === "number" ? data.activeEventId : null,
      onboardingSeen: data.onboardingSeen === true,
      pendingEventQuestion: typeof data.pendingEventQuestion === "string" ? data.pendingEventQuestion : null,
    };
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

function executionMessage(value: unknown) {
  if (value && typeof value === "object" && "message" in value && typeof value.message === "string")
    return value.message;
  if (value && typeof value === "object" && "temporaryPassword" in value && typeof value.temporaryPassword === "string")
    return `Действие выполнено. Временный пароль: ${value.temporaryPassword}`;
  if (value && typeof value === "object" && "changedCount" in value) {
    const result = value as { changedCount?: number; skippedCount?: number };
    return `Действие выполнено. Изменено: ${result.changedCount ?? 0}, пропущено: ${result.skippedCount ?? 0}.`;
  }
  return "Действие выполнено через API приложения. Данные сохранены.";
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data === "string" && data.trim()) return data.trim();
    if (data && typeof data === "object" && "message" in data && typeof data.message === "string") return data.message;
    if (error.response?.status) return `HTTP ${error.response.status}`;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

export function AIMode() {
  const { pathname } = useLocation();
  const { updateEvent, currentUser, loginName, token, events } = useAuth();
  const routeEventId = Number(pathname.match(/^\/events\/(\d+)/)?.[1]) || null;
  const chatStorageKey = token && (currentUser?.userId ?? loginName)
    ? `aimode-chat:${currentUser?.userId ?? loginName}:${token}`
    : null;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingMessage, setPendingMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionStates, setActionStates] = useState<Record<string, { status: string; message: string }>>({});
  const [confirmAction, setConfirmAction] = useState<AssistantAction | null>(null);
  const [models, setModels] = useState<AssistantModelOption[]>([]);
  const [modelId, setModelId] = useState("");
  const [modelsError, setModelsError] = useState("");
  const [modelsNoticeStep, setModelsNoticeStep] = useState<"models" | "explanation" | null>(null);
  const [activeEventId, setActiveEventId] = useState<number | null>(null);
  const [onboardingSeen, setOnboardingSeen] = useState(false);
  const [pendingEventQuestion, setPendingEventQuestion] = useState<string | null>(null);
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const modelsNoticeButton = useRef<HTMLButtonElement>(null);
  const modelIdRef = useRef(modelId);
  const activeEvent = events.find(event => event.id === activeEventId) ?? null;
  const totalUsage = messages.reduce((total, message) => ({
    inputTokens: total.inputTokens + (message.usage?.inputTokens ?? 0),
    outputTokens: total.outputTokens + (message.usage?.outputTokens ?? 0),
    totalTokens: total.totalTokens + (message.usage?.totalTokens ?? 0),
  }), { inputTokens: 0, outputTokens: 0, totalTokens: 0 });

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { modelIdRef.current = modelId; }, [modelId]);
  useEffect(() => {
    if (!chatStorageKey) {
      setMessages([]);
      setModelId("");
      setActiveEventId(null);
      setOnboardingSeen(false);
      setPendingEventQuestion(null);
      setLoadedStorageKey(null);
      return;
    }
    const stored = readStoredChat(chatStorageKey);
    setMessages(stored?.messages ?? []);
    setModelId(stored?.modelId ?? "");
    setActiveEventId(stored?.activeEventId ?? null);
    setOnboardingSeen(stored?.onboardingSeen ?? false);
    setPendingEventQuestion(stored?.pendingEventQuestion ?? null);
    setLoadedStorageKey(chatStorageKey);
  }, [chatStorageKey]);
  useEffect(() => {
    if (!chatStorageKey || loadedStorageKey !== chatStorageKey) return;
    try {
      sessionStorage.setItem(chatStorageKey, JSON.stringify({ messages, modelId, activeEventId, onboardingSeen, pendingEventQuestion } satisfies StoredChat));
    } catch {
      // Keeping the current chat usable is more important than failing on unavailable storage.
    }
  }, [activeEventId, chatStorageKey, loadedStorageKey, messages, modelId, onboardingSeen, pendingEventQuestion]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages, busy, open]);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setModels([]);
    setModelsError("");
    apiClient.getAssistantModels().then(items => {
      if (!active) return;
      setModels(items);
      setModelsError("");
      const selected = items.find(item => item.id === modelIdRef.current)?.id ?? items[0]?.id ?? "";
      if (selected) {
        setModelId(selected);
      }
    }).catch(err => {
      if (!active) return;
      setModelsError(axios.isAxiosError(err) && typeof err.response?.data?.message === "string"
        ? err.response.data.message : "Не удалось загрузить список моделей Yandex AI Studio.");
    });
    return () => { active = false; };
  }, [open]);
  useEffect(() => {
    if (!modelsNoticeStep) return;
    modelsNoticeButton.current?.focus();
    const closeNotice = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setModelsNoticeStep(null);
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("keydown", closeNotice, true);
    return () => document.removeEventListener("keydown", closeNotice, true);
  }, [modelsNoticeStep]);
  useEffect(() => {
    if (!confirmAction) return;
    confirmButton.current?.focus();
    const closeConfirmation = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || actionBusy) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setConfirmAction(null);
    };
    document.addEventListener("keydown", closeConfirmation, true);
    return () => document.removeEventListener("keydown", closeConfirmation, true);
  }, [confirmAction, actionBusy]);

  const close = () => { setConfirmAction(null); setModelsNoticeStep(null); setOpen(false); trigger.current?.focus(); };
  const send = async () => {
    if (busy || actionBusy || !modelId || !draft.trim()) return;
    const submittedMessage = draft.trim();
    const selectionRequested = !routeEventId && !crossEventSearchPattern.test(submittedMessage) && (switchEventPattern.test(submittedMessage)
      || (!activeEventId && eventDataPattern.test(submittedMessage)));
    if (!pendingEventQuestion && selectionRequested && events.length) {
      const eventList = events.map((event, index) => `${index + 1}. ${event.name}`).join("\n");
      setMessages([...messages,
        { role: "user", content: submittedMessage },
        { role: "assistant", content: `Выберите мероприятие, с которым будем работать:\n${eventList}\n\nМожете ввести только цифру нужного пункта из списка выше.` },
      ]);
      setPendingEventQuestion(submittedMessage);
      setDraft("");
      setError("");
      requestAnimationFrame(() => input.current?.focus());
      return;
    }

    let requestEventId = routeEventId ?? activeEventId;
    let history: Message[] = [...messages, { role: "user", content: submittedMessage }];
    if (pendingEventQuestion) {
      const choice = /^\d+$/.test(submittedMessage) ? Number(submittedMessage) : 0;
      const selectedEvent = events[choice - 1];
      if (!selectedEvent) {
        setMessages([...history, { role: "assistant", content: `Введите только номер мероприятия от 1 до ${events.length}.` }]);
        setDraft("");
        setError("");
        requestAnimationFrame(() => input.current?.focus());
        return;
      }
      requestEventId = selectedEvent.id;
      history = [...history, { role: "assistant", content: `Работаю с мероприятием «${selectedEvent.name}».` }];
      setActiveEventId(selectedEvent.id);
      setPendingEventQuestion(null);
    }
    const context = history.slice(-19).map(({ role, content }) => ({ role, content }));
    while (context.length > 1 && context.reduce((size, message) => size + message.content.length, 0) > 40000) context.splice(0, 2);
    setBusy(true);
    setError("");
    setDraft("");
    setPendingMessage(submittedMessage);
    requestAnimationFrame(() => input.current?.focus());
    const controller = new AbortController();
    abort.current = controller;
    try {
      const result = await apiClient.askAssistant({
        messages: context, page: pathname, eventId: requestEventId, model: modelId,
      }, controller.signal);
      if (controller.signal.aborted) return;
      setMessages([...history, { role: "assistant", content: result.answer, sources: result.sources, actions: result.actions, usage: result.usage }]);
    } catch (err) {
      if (!controller.signal.aborted) {
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        setError(status === 429 ? "Слишком много запросов. Попробуйте через минуту."
          : status === 401 ? "Сессия истекла. Войдите в приложение повторно."
          : status === 403 ? "Нет доступа к этому мероприятию."
          : axios.isAxiosError(err) && typeof err.response?.data?.message === "string"
            ? err.response.data.message : "Не удалось отправить сообщение. Попробуйте ещё раз.");
      }
    } finally {
      setBusy(false);
      setPendingMessage("");
      abort.current = null;
      requestAnimationFrame(() => input.current?.focus());
    }
  };

  const decide = async (action: AssistantAction, confirm: boolean) => {
    if (actionBusy || busy) return;
    setActionBusy(true);
    setError("");
    let releasePlacementLock = false;
    try {
      if (confirm && action.requiresPlacementEditLock) {
        if (!action.eventId) throw new Error("Для изменения схемы не выбрано мероприятие.");
        let ownedBefore = apiClient.hasPlacementEditToken(action.eventId);
        let lock = ownedBefore ? await apiClient.heartbeatPlacementEditLock(action.eventId) : null;
        if (ownedBefore && !lock?.isOwnedByCurrentUser) {
          apiClient.setPlacementEditToken(action.eventId, null);
          ownedBefore = false;
        }
        if (!lock?.isOwnedByCurrentUser) lock = await apiClient.acquirePlacementEditLock(action.eventId);
        if (!lock.isOwnedByCurrentUser || !lock.token) {
          const editor = lock.editorName ? ` Её редактирует ${lock.editorName}.` : "";
          throw new Error(`Схема размещения сейчас недоступна.${editor} Повторите выполнение после освобождения блокировки.`);
        }
        apiClient.setPlacementEditToken(action.eventId, lock.token);
        releasePlacementLock = !ownedBefore;
      }
      const approval = await apiClient.decideAssistantAction(action.id, action.eventId, confirm);
      let result = approval;
      const requests = approval.requests?.length ? approval.requests : approval.request ? [approval.request] : [];
      if (approval.status === "approved" && requests.length) {
        const responses: unknown[] = [];
        const failures: string[] = [];
        for (let index = 0; index < requests.length; index++) {
          try {
            responses.push(await apiClient.executeAssistantRequest(action.id, requests[index], action.eventId, index, requests.length));
          } catch (err) {
            failures.push(`№${index + 1}: ${apiErrorMessage(err, "неизвестная ошибка")}`);
          }
        }
        result = requests.length === 1 && failures.length === 0
          ? { status: "completed", message: executionMessage(responses[0]) }
          : failures.length === 0
            ? { status: "completed", message: `Пакет выполнен полностью. Выполнено действий: ${responses.length}.` }
            : { status: responses.length ? "partial" : "failed", message: `Выполнено: ${responses.length} из ${requests.length}. Не выполнены действия: ${failures.join(", ")}.` };
      }
      setActionStates(current => ({ ...current, [action.id]: result }));
      setMessages(current => current.map(message => message.actions?.some(item => item.id === action.id)
        ? { ...message, content: `Результат подтверждённого действия: ${result.message}` } : message));
      if (result.status === "completed" && action.eventId) {
        try { updateEvent(await apiClient.getEvent(action.eventId)); } catch { /* The saved result remains visible if refreshing metadata fails. */ }
      }
    } catch (err) {
      const message = apiErrorMessage(err, "Не удалось проверить результат. Повторите подтверждение этой же карточки, чтобы узнать статус.");
      setError(message);
      if (axios.isAxiosError(err) && [403, 410].includes(err.response?.status ?? 0))
        setActionStates(current => ({ ...current, [action.id]: { status: "unavailable", message } }));
    } finally {
      if (releasePlacementLock && action.eventId) {
        try { await apiClient.releasePlacementEditLock(action.eventId); }
        catch { /* Lease expires automatically if release is temporarily unavailable. */ }
        finally { apiClient.setPlacementEditToken(action.eventId, null); }
      }
      setActionBusy(false);
      setConfirmAction(null);
    }
  };

  return <>
    <button ref={trigger} type="button" className="ai-mode-button" aria-haspopup="dialog" onClick={() => {
      if (routeEventId) setActiveEventId(routeEventId);
      setOpen(true);
      setModelsNoticeStep(onboardingSeen ? null : "models");
      setOnboardingSeen(true);
    }}>
      <span aria-hidden="true">✦</span> AIMode
    </button>
    {open && !modelsNoticeStep && createPortal(<Modal title="AIMode" className="ai-chat" onClose={close}
      headerActions={<button type="button" className="icon-button ai-new-chat-button" title="Новый чат" aria-label="Начать новый чат" disabled={busy || actionBusy} onClick={() => { setConfirmAction(null); setMessages([]); setActionStates({}); setPendingEventQuestion(null); setDraft(""); setError(""); input.current?.focus(); }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v13H9l-5 4V4Zm7 3v3H8v2h3v3h2v-3h3v-2h-3V7h-2Z" /></svg>
      </button>}>
      <div className="ai-model-toolbar">
        <label className="ai-model-picker" htmlFor="ai-model">
          <span>Модель</span>
          <select id="ai-model" value={modelId} disabled={!models.length} onChange={event => {
            setModelId(event.target.value);
          }}>
            {!models.length && <option value={modelId}>Загрузка моделей…</option>}
            {models.map(model => <option value={model.id} key={model.id}>
              {`${model.costRank ? `№${model.costRank} ` : ""}${model.name} — ${modelCost(model)}`}
            </option>)}
          </select>
        </label>
        <small className="ai-event-context">{activeEvent
          ? `Мероприятие: ${activeEvent.name}`
          : "Мероприятие не выбрано"}</small>
        {modelsError && <small className="ai-model-error" role="alert">{modelsError}</small>}
      </div>
      <div className="ai-chat-messages" role="log" aria-label="Диалог с AIMode" aria-live="polite">
        <div className="ai-chat-message assistant">Здравствуйте! Помогу разобраться с гостями, группами, размещением, согласованиями и другими разделами приложения. Что вы хотите сделать?</div>
        {messages.map((message, index) => <div key={index} className={`ai-chat-message ${message.role}`}><strong>{message.role === "user" ? "Вы" : "AIMode"}</strong><div>{message.content}</div>{!!message.sources?.length && <small className="ai-chat-sources">Данные: {message.sources.map(source => sourceNames[source] ?? source).join(" · ")}</small>}
          {message.usage && <small className="ai-chat-usage">Токены: вход {tokens.format(message.usage.inputTokens)} · выход {tokens.format(message.usage.outputTokens)} · всего {tokens.format(message.usage.totalTokens)}</small>}
          {message.actions?.map(action => <section className="ai-action-card" key={action.id} aria-label="Предлагаемое изменение">
            <h3>{action.title}</h3>
            {actionStates[action.id] ? <p role="status">{actionStates[action.id].message}</p> : <>
              <p>{action.compactSummary ?? "Изменение ещё не выполнено. Откройте специальное окно, проверьте данные и подтвердите действие."}</p>
              <small>Предложение действует 10 минут. Переход на другой экран не потребуется.</small>
              <div className="ai-action-buttons"><button className="primary-button ai-action-review-button" type="button" disabled={busy || actionBusy} onClick={() => setConfirmAction(action)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h3v16H5V5h3l1-2Zm1 2v2h4V5h-4Zm-2 6 2.5 2.5L16 8l1.5 1.5-7 7L6.5 12.5 8 11Z" /></svg>
                <span>Проверить и выполнить</span>
              </button></div>
            </>}
          </section>)}
        </div>)}
        {busy && <div className="ai-chat-message user"><strong>Вы</strong><div>{pendingMessage}</div></div>}
        {busy && <p role="status">AIMode готовит ответ…</p>}
        {actionBusy && <p role="status">Проверка прав и сохранение решения…</p>}
        <div ref={end} />
      </div>
      {error && <p className="ai-chat-error" role="alert">{error}</p>}
      <form className="ai-chat-form" onSubmit={e => { e.preventDefault(); void send(); }}>
        <label htmlFor="ai-question">Вопрос по приложению</label>
        <textarea id="ai-question" ref={input} value={draft} maxLength={6000} readOnly={busy || actionBusy} aria-busy={busy || actionBusy} rows={3}
          placeholder="Например: как отправить гостя на согласование?" onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
        <div className="ai-chat-actions"><small>Enter — отправить · Shift+Enter — новая строка</small>
          {busy ? <button type="button" className="secondary-button ai-chat-control ai-chat-stop" onClick={() => abort.current?.abort()}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg><span>Остановить</span>
          </button>
            : <button type="submit" className="primary-button ai-chat-control ai-chat-submit" disabled={actionBusy || !modelId || !draft.trim()}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 17 8-17 8 3-7 8-1-8-1-3-7Z" /></svg><span>Отправить</span>
            </button>}</div>
        <div className="ai-chat-token-total" aria-label="Расход токенов за текущий чат">
          <span>Токены за чат</span>
          <span>вход {tokens.format(totalUsage.inputTokens)}</span>
          <span>выход {tokens.format(totalUsage.outputTokens)}</span>
          <strong>всего {tokens.format(totalUsage.totalTokens)}</strong>
        </div>
      </form>
    </Modal>, document.body)}
    {open && modelsNoticeStep && createPortal(<div className="modal-backdrop ai-models-backdrop" role="presentation" onMouseDown={close}>
      <section className="modal-card ai-models-notice" role="dialog" aria-modal="true" aria-labelledby="ai-models-title" onMouseDown={event => event.stopPropagation()}>
        <header className="modal-header">
          <div><h2 id="ai-models-title">{modelsNoticeStep === "models" ? "Доступные модели Yandex AI Studio" : "Перед началом работы"}</h2>{modelsNoticeStep === "models" && <p className="muted">Список получен из вашего каталога Yandex в момент открытия AIMode.</p>}</div>
          <button className="modal-close-button" type="button" aria-label="Закрыть AI-режим" onClick={close}>×</button>
        </header>
        {modelsNoticeStep === "models" ? <><div className="ai-models-list">{models.map(model => <article key={model.id}>
          <div><strong>{model.costRank ? `№${model.costRank} · ` : ""}{model.name}</strong><code>{model.id}</code></div>
          <span>{compactModelCost(model)}</span>
          <small>{[model.context && `контекст ${model.context}`, model.ownedBy, model.recommendedUse].filter(Boolean).join(" · ")}</small>
        </article>)}</div><p className="ai-models-note">Модели с известной стоимостью расположены от более дешёвых к более дорогим. Для остальных цена в локальном справочнике не указана.</p></> : <div className="ai-models-explanation"><p>{routeEventId || activeEventId ? "Контекст: выбранное мероприятие и ваша ветка групп. Помощник может работать только в пределах разрешений вашей роли." : "Контекст: доступные вам мероприятия."} Сообщения и запрошенные данные передаются в Yandex AI Studio. Любое изменение подтверждается в специальном окне внутри чата и повторно проверяется обычным API. Ответы могут содержать ошибки.</p><p>Модели расположены от более дешёвых к более дорогим. Новый выбор применяется к следующему сообщению.</p></div>}
        <div className="modal-actions"><button ref={modelsNoticeButton} className="primary-button ai-models-acknowledge" type="button" onClick={() => { if (modelsNoticeStep === "models") setModelsNoticeStep("explanation"); else { setModelsNoticeStep(null); requestAnimationFrame(() => input.current?.focus()); } }}>{modelsNoticeStep === "models" ? "Далее" : "Понятно"}</button></div>
      </section>
    </div>, document.body)}
    {open && confirmAction && createPortal(<div className="modal-backdrop ai-confirm-backdrop" role="presentation"
      onMouseDown={() => { if (!actionBusy) setConfirmAction(null); }}>
      <section className="modal-card ai-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ai-confirm-title"
        aria-describedby="ai-confirm-description" onMouseDown={event => event.stopPropagation()}>
        <header className="modal-header">
          <div><h2 id="ai-confirm-title">Подтверждение действия</h2><p id="ai-confirm-description" className="muted">Проверьте, что именно изменит AIMode.</p></div>
          <button className="modal-close-button" type="button" disabled={actionBusy} onClick={() => setConfirmAction(null)} aria-label="Вернуться в чат">×</button>
        </header>
        <h3>{confirmAction.title}</h3>
        {confirmAction.items?.length
          ? <ol className="ai-confirm-items">{confirmAction.items.map((item, index) => <li key={index}>{item}</li>)}</ol>
          : confirmAction.compactSummary
          ? <p className="ai-confirm-summary">{confirmAction.compactSummary}</p>
          : <dl className="ai-confirm-changes">{confirmAction.changes.map((change, index) => <div key={`${change.field}-${index}`}>
            <dt>{change.field}</dt><dd>{change.before && <span>Сейчас: {change.before}</span>}<span>{change.before ? "После выполнения: " : ""}{change.after}</span></dd>
          </div>)}</dl>}
        <p className="ai-confirm-note">Действие выполнится прямо из чата. Приложение не будет переходить на другой экран. Перед записью сервер ещё раз проверит вашу роль и права.</p>
        <div className="modal-actions">
          <button type="button" className="secondary-button" disabled={actionBusy} onClick={() => void decide(confirmAction, false)}>Не выполнять</button>
          <button ref={confirmButton} className="primary-button" type="button" disabled={actionBusy} onClick={() => void decide(confirmAction, true)}>{actionBusy ? "Выполняю…" : "Выполнить действие"}</button>
        </div>
      </section>
    </div>, document.body)}
  </>;
}

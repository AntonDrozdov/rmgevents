# Мероприятия: создание, настройки и архитектура

Документ описывает текущее поведение функциональности мероприятий: список на дашборде, создание мероприятия, вход в его контекст и редактирование на вкладке **«Настройки»**.

Документ состоит из двух частей:

1. правила и инструкция для пользователя системы;
2. техническое описание для разработчика с отдельными разделами по frontend и backend.

Термины:

- **Login** — глобальная учётная запись, используемая для входа;
- **User / сотрудник** — профиль Login внутри конкретного мероприятия;
- **Event / мероприятие** — основная сущность мероприятия;
- **владелец** — сотрудник, записанный в `Event.OwnerId`;
- **создатель** — пользователь, создавший мероприятие; при создании для него формируется новый профиль сотрудника, который становится владельцем;
- **обложка** — запись `ImageEntity`, идентификатор которой хранится в `Event.LogoImageId`.

---

# Часть 1. Для пользователя системы

## 1. Дашборд мероприятий

После входа пользователь попадает на `/dashboard`. На дашборде отображаются только мероприятия, в которых его Login связан хотя бы с одним профилем сотрудника.

Плитка мероприятия показывает:

- обложку, если она загружена;
- стандартную иконку, если обложки нет;
- название;
- роль текущего пользователя именно в этом мероприятии;
- дату мероприятия;
- дату создания;
- ФИО создателя/владельца.

Роль не показывается в пользовательском меню на дашборде, потому что вне выбранного мероприятия у пользователя может быть несколько разных ролей. После входа в мероприятие роль снова отображается в пользовательском меню.

Нажатие на плитку:

1. загружает профиль текущего пользователя в выбранном мероприятии;
2. сохраняет выбранное мероприятие в контексте приложения и `localStorage`;
3. открывает `/events/{eventId}/guests`.

Если доступных мероприятий нет, выводится пустое состояние.

## 2. Кто может создавать и изменять мероприятия

Кнопка **«Создать мероприятие»** и вкладка **«Настройки»** доступны при наличии разрешения `create_event`.

| Роль | Доступ по умолчанию |
|---|---|
| `Administrator` | Да, стандартный администратор получает все permissions |
| `Manager` | Нет |
| `Approver` | Нет |
| Пользовательская роль | Да, если роли назначено `create_event` |

Для создания backend проверяет наличие `create_event` хотя бы в одном мероприятии пользователя, потому что у нового мероприятия ещё нет `eventId`.

Для открытия настроек, загрузки обложки и сохранения изменений разрешение проверяется строго в редактируемом мероприятии. Право в другом мероприятии не даёт доступа.

Пока профиль пользователя не загружен, вкладка не отображается. Прямой переход на `/events/{eventId}/settings` также защищён проверкой permission.

Пользователь с обязательной сменой временного пароля сначала должен изменить пароль.

## 3. Создание мероприятия

Форма открывается модальным окном на дашборде и содержит:

| Поле | Обязательное | Поведение |
|---|---:|---|
| Название | Да | Пробелы по краям удаляются backend-ом |
| Дата мероприятия | Да | Выбирается через нативный календарь браузера |

Описание и обложка при создании через текущий интерфейс не задаются. Их можно добавить позже на вкладке **«Настройки»**.

Дата по умолчанию равна текущей локальной дате пользователя. Прошедшие и будущие даты разрешены: отдельного ограничения диапазона нет.

Во время запроса кнопки формы блокируются. После успешного создания модальное окно закрывается, новое мероприятие добавляется на дашборд, выбирается текущим и открывается вкладка гостей.

## 4. Что создаётся автоматически

Создание мероприятия — это не только запись с названием и датой. Backend автоматически создаёт полный рабочий контекст:

1. мероприятие;
2. единственную корневую группу `РМГ` с квотой `500`;
3. стандартные роли;
4. связи ролей с permissions;
5. профиль создателя в новом мероприятии;
6. назначение этому профилю роли `Administrator`;
7. назначение профиля в корневую группу;
8. назначение созданного профиля владельцем мероприятия.

Стандартные роли:

| Роль | Permissions |
|---|---|
| `Administrator` | Все существующие permissions |
| `Manager` | `create_guest`, `create_group` |
| `Approver` | `approve_guest` |

Если любая операция завершается ошибкой, всё создание откатывается. Частично созданное мероприятие не должно оставаться в базе.

## 5. Владелец и создатель

Владелец хранится не как Login, а как сотрудник (`User`) внутри мероприятия.

При создании:

- backend находит один из существующих профилей создателя по его `LoginId`;
- копирует ФИО, email, телефон и meta в новый профиль;
- назначает новому профилю `Administrator` и корневую группу;
- записывает ID нового профиля в `Event.OwnerId`.

Поэтому ФИО создателя на плитке берётся из владельца мероприятия. Отдельного поля для смены владельца в интерфейсе сейчас нет.

## 6. Вкладка «Настройки»

Вкладка находится внутри выбранного мероприятия и использует общую адаптивную оболочку вкладок. Форма растягивается на всю ширину контентной области.

Доступные поля:

| Поле | Обязательное | Ограничение |
|---|---:|---|
| Название | Да | До 255 символов |
| Дата мероприятия | Да | Значение формата даты |
| Описание | Нет | До 2000 символов, показывается счётчик |
| Обложка | Нет | JPG, JPEG, PNG или SVG, до 5 МБ |

При загрузке страницы данные всегда запрашиваются с backend. Поэтому сохранённая обложка восстанавливается в превью после F5 через `LogoImageId`.

После успешного сохранения:

- показывается сообщение об успехе;
- название в шапке мероприятия обновляется без перезагрузки;
- данные плитки и выбранного мероприятия обновляются в локальном контексте;
- новая обложка появляется на плитке дашборда.

## 7. Выбор и загрузка обложки

При выборе файла frontend проверяет расширение и размер до отправки.

После выбора:

- показывается локальный предпросмотр;
- кнопка меняет оформление;
- появляется текст `✓ Изображение выбрано`;
- отображается имя файла.

При нажатии **«Сохранить»** новая обложка сначала загружается отдельным multipart-запросом. Backend возвращает числовой ID изображения, после чего этот ID отправляется в запросе обновления мероприятия.

Backend повторно проверяет:

- непустой файл;
- размер не более 5 МБ;
- допустимое расширение;
- соответствие MIME-типа расширению;
- сигнатуру JPEG или PNG;
- корректность и безопасность SVG.

Для SVG запрещены исполняемые и встраиваемые элементы, обработчики событий, `javascript:` и внешние ссылки в `href`/`src`.

Текущие ограничения жизненного цикла изображений:

- замена обложки не удаляет старую запись изображения;
- если изображение загрузилось, но последующее обновление мероприятия завершилось ошибкой, загруженная запись останется без связи;
- отдельной кнопки удаления обложки в интерфейсе нет.

## 8. Ошибки

Технические исключения backend не должны показываться пользователю. Контроллеры возвращают `400 Bad Request` с безопасным полем `message`.

Примеры ошибок:

- не указано название;
- не указана дата;
- название или описание превышает допустимую длину;
- выбранное изображение не существует;
- файл пустой, слишком большой или имеет недопустимый формат;
- SVG содержит небезопасные элементы;
- отсутствует permission `create_event` — в этом случае возвращается `403 Forbidden`.

---

# Часть 2. Для разработчика

## 1. Общая схема

```mermaid
flowchart LR
    Dashboard[DashboardPage] -->|POST /api/events| EventsController
    EventsController --> EventService
    EventService --> EventRepository
    EventService --> GroupRepository
    EventService --> RoleService
    EventService --> UserRepository
    EventRepository --> DB[(PostgreSQL)]
    GroupRepository --> DB
    RoleService --> DB
    UserRepository --> DB

    Settings[EventInformationPage] -->|GET/PUT /api/events/eventId| EventsController
    Settings -->|POST multipart cover| ImagesController
    ImagesController --> ImageService
    ImageService --> ImageRepository
    ImageRepository --> DB
```

Основные границы ответственности:

- frontend управляет формами, предварительной проверкой, состоянием и навигацией;
- API-контроллеры проверяют авторизацию, маппят контракты и скрывают технические ошибки;
- сервисы реализуют бизнес-правила;
- репозитории выполняют EF Core-запросы;
- PostgreSQL хранит мероприятия, изображения и связи.

## 2. Маршруты frontend

| Маршрут | Компонент | Защита |
|---|---|---|
| `/dashboard` | `DashboardPage` | Авторизованный пользователь |
| `/events/create` | Redirect на `/dashboard` | Отдельная страница создания больше не используется |
| `/events/{eventId}` | Redirect на `guests` | — |
| `/events/{eventId}/settings` | `EventSettingsPage` + `EventInformationPage` | `create_event` |

`ProtectedRoute` проверяет SID, необходимость смены пароля и требуемый permission. Если профиль ещё не загружен, защищённая permission-маршрутом страница не считается доступной.

## 3. Frontend: создание

Создание реализовано непосредственно в `DashboardPage`.

Состояние формы:

- `isCreateModalOpen`;
- `name`;
- `eventDate`;
- `loading`;
- `error`.

`getTodayInputValue()` корректирует текущее время на timezone offset и формирует локальное значение `YYYY-MM-DD`, чтобы дата не сдвигалась при преобразовании через ISO.

Последовательность `handleCreateEvent`:

```mermaid
sequenceDiagram
    participant U as Пользователь
    participant D as DashboardPage
    participant API as apiClient
    participant B as Backend
    participant A as AuthContext

    U->>D: Создать
    D->>API: createEvent(name, eventDate)
    API->>B: POST /api/events
    B-->>API: 201 EventDto
    API-->>D: EventDto
    D->>A: addEvent(EventOption)
    D->>A: selectEvent(EventOption)
    A->>B: GET /events/eventId/me
    D->>D: navigate(.../guests)
```

Frontend предполагает роль создателя `Administrator`, потому что это гарантируется бизнес-операцией backend.

## 4. Frontend: редактирование

`EventInformationPage` получает `eventId` из URL и при монтировании вызывает `apiClient.getEvent(eventId)`.

Локальное состояние:

- `name`, `description`, `eventDate`;
- `logoImageId` — сохранённая связь;
- `coverFile` — новый локально выбранный файл;
- `coverPreview` — URL сохранённого изображения или временный object URL;
- `loading`, `saving`, `error`, `success`.

Для локального превью используется `URL.createObjectURL`. Cleanup эффекта вызывает `URL.revokeObjectURL`, чтобы не удерживать Blob в памяти.

Сохранение выполняется в два этапа:

```mermaid
sequenceDiagram
    participant UI as EventInformationPage
    participant IC as ImagesController
    participant EC as EventsController
    participant DB as PostgreSQL
    participant AC as AuthContext

    opt Выбран новый файл
        UI->>IC: POST multipart /images/events/eventId/cover
        IC->>DB: INSERT images
        IC-->>UI: 201 { id }
    end
    UI->>EC: PUT /events/eventId с logoImageId
    EC->>DB: UPDATE events
    EC-->>UI: 200 EventDto
    UI->>AC: updateEvent(EventDto)
```

`AuthContext.updateEvent` обновляет:

- элемент массива `events`;
- `currentEvent`, если редактируется выбранное мероприятие;
- ключи `events` и `currentEvent` в `localStorage`.

При восстановлении сессии `AuthContext` запрашивает `GET /events` и обновляет дату, дату создания, создателя и `logoImageId` сохранённых `EventOption`.

## 5. Frontend: типы и API-клиент

Ключевые типы в `frontend/src/types/index.ts`:

| Тип | Назначение |
|---|---|
| `EventOption` | Компактные данные плитки и роль текущего пользователя |
| `EventDto` | Ответ списка, создания и обновления |
| `EventDetailDto` | Подробности мероприятия вместе с профилем текущего пользователя |
| `CreateEventRequest` | `name`, `eventDate`, опциональный `logoImageId` |
| `UpdateEventRequest` | `name`, `description`, `eventDate`, `logoImageId` |

Методы `apiClient`:

| Метод | HTTP |
|---|---|
| `getEvents()` | `GET /events` |
| `getEvent(eventId)` | `GET /events/{eventId}` |
| `getCurrentUserProfile(eventId)` | `GET /events/{eventId}/me` |
| `createEvent(request)` | `POST /events` |
| `updateEvent(eventId, request)` | `PUT /events/{eventId}` |
| `uploadEventCover(eventId, file)` | `POST /images/events/{eventId}/cover` |
| `getImageUrl(imageId)` | Формирует `/api/images/{imageId}` |

Axios interceptor добавляет SID как `Authorization: Bearer {sid}`.

## 6. Frontend: файлы и ответственность

| Файл | Компонент / ответственность |
|---|---|
| `frontend/src/App.tsx` | Маршруты дашборда и настроек, permission-защита |
| `frontend/src/pages/DashboardPage.tsx` | Плитки, модальная форма создания, переход в мероприятие |
| `frontend/src/pages/EventSettingsPage.tsx` | Общая оболочка вкладок, видимость «Настроек», название в шапке |
| `frontend/src/pages/EventInformationPage.tsx` | Загрузка и редактирование данных, выбор и preview обложки |
| `frontend/src/components/ProtectedRoute.tsx` | Проверка SID, временного пароля и permission |
| `frontend/src/components/Modal.tsx` | Унифицированная модалка создания |
| `frontend/src/components/UserMenu.tsx` | Контекстное отображение роли внутри мероприятия |
| `frontend/src/contexts/AuthContext.tsx` | Список мероприятий, выбранное мероприятие, профиль и `localStorage` |
| `frontend/src/services/apiClient.ts` | Axios-вызовы Events и Images API |
| `frontend/src/types/index.ts` | DTO и request-типы TypeScript |
| `frontend/src/index.css` | Плитки, полноширинная адаптивная форма, preview и состояния кнопки загрузки |

## 7. Backend API

Все пути имеют префикс `/api`.

| Метод и путь | Назначение | Защита | Ответ |
|---|---|---|---|
| `GET /events` | Мероприятия текущего Login | `[Authorize]` | `EventDto[]` |
| `GET /events/{eventId}` | Данные мероприятия и текущий профиль | `[Authorize]` + проверка участия | `EventDetailDto` |
| `GET /events/{eventId}/me` | Профиль и permissions | `[Authorize]` + проверка участия | `UserProfileDto` |
| `POST /events` | Создание мероприятия | `CanCreateEvent` в любом мероприятии | `201 EventDto` |
| `PUT /events/{eventId}` | Изменение данных | `CanCreateEvent` в указанном мероприятии | `200 EventDto` |
| `POST /images/events/{eventId}/cover` | Загрузка обложки | `CanCreateEvent` в указанном мероприятии | `201 { id }` |
| `GET /images/{id}` | Получение изображения | Публичный | Бинарный файл или `404` |

Публичный GET изображения нужен для обычного `<img src>`: браузер не добавляет SID из Axios interceptor к такому запросу.

## 8. Backend-контракты

`EventDto` содержит:

- `Id`;
- `Name`;
- `Description`;
- `EventDate`;
- `CreatedByName`;
- `LogoImageId`;
- `OwnerId`;
- `CreatedAt`;
- `IsArchived`.

`EventDetailDto` добавляет `CurrentUserProfile`.

`CreateEventRequest` не содержит описание. Хотя контракт допускает `LogoImageId`, текущая форма создания его не отправляет.

`UpdateEventRequest` содержит все редактируемые данные. `ImageUploadResponse` содержит числовой `Id` созданного изображения.

## 9. Backend: транзакция создания

`EventService.CreateEventAsync` принимает `creatorLoginId`, название, дату и опциональный ID изображения.

Перед транзакцией сервис:

- проверяет непустое название;
- проверяет дату;
- загружает профили по `LoginId`;
- выбирает профиль с максимальным `CreatedAt` как источник контактных данных.

Операции выполняются через `Database.CreateExecutionStrategy().ExecuteAsync(...)`. Пользовательская транзакция создаётся внутри execution strategy, что совместимо с `NpgsqlRetryingExecutionStrategy`.

Внутри повторяемого блока:

1. очищается `ChangeTracker`;
2. начинается транзакция;
3. создаётся Event;
4. создаётся группа `РМГ/500`;
5. создаются стандартные роли и permissions;
6. создаётся новый User создателя;
7. Event переключается на нового User как владельца;
8. транзакция фиксируется.

Первоначально `OwnerId` получает ID существующего профиля, потому что поле обязательно, а новый профиль ещё не создан. До commit владелец заменяется на профиль нового мероприятия.

При исключении транзакция откатывается. Контроллер логирует техническую причину, но возвращает frontend безопасное сообщение.

## 10. Backend: редактирование

`EventService.UpdateEventAsync` проверяет:

- название не пустое и не длиннее 255 символов;
- описание не длиннее 2000 символов;
- дата не равна `default(DateOnly)`;
- мероприятие существует;
- `LogoImageId`, если передан, существует в `images`.

Название и описание обрезаются по краям. Пустое описание сохраняется как `null`.

Владелец, дата создания и архивный статус через этот endpoint не изменяются.

`IEventService` также содержит `DeleteEventAsync`, но публичного DELETE endpoint и пользовательского интерфейса удаления мероприятия сейчас нет.

## 11. Backend: хранение и проверка изображений

`ImageEntity` хранит файл непосредственно в PostgreSQL:

| Поле | Назначение |
|---|---|
| `Id` | Числовой идентификатор |
| `FileName` | Очищенное через `Path.GetFileName` имя |
| `ContentType` | Нормализованный MIME-type |
| `Data` | `bytea` с содержимым файла |
| `AltText` | Текст по умолчанию «Обложка мероприятия» |
| `CreatedAt` | Дата загрузки |

`ImageService.SaveEventCover` нормализует формат по расширению. Для JPEG и PNG проверяются magic bytes. SVG разбирается как XML и проверяется обходом дерева.

`ImagesController.GetImage` использует числовой route constraint `{id:long}`, возвращает `Content-Disposition: inline` и поддерживает range processing.

## 12. Backend: permissions

Policy `CanCreateEvent` определяется в `WebApi/Program.cs` через `PermissionRequirement("create_event")`.

`PermissionAuthorizationHandler` работает в двух режимах:

- если в route есть `eventId`, вызывает `HasPermissionAsync(loginId, eventId, code)`;
- если `eventId` отсутствует и permission не требует группы, вызывает `HasPermissionInAnyEventAsync`.

`UserRepository.GetByLoginIdAsync` обязан загружать `Role.RolePermissions.Permission`. Без eager loading создание нового мероприятия после отдельного HTTP-запроса входа ошибочно получает `403`.

## 13. Модель данных

```mermaid
erDiagram
    LOGIN ||--o{ USER : "имеет профили"
    EVENT ||--o{ USER : "сотрудники"
    EVENT ||--o{ GROUP : "группы"
    EVENT ||--o{ ROLE : "роли"
    USER ||--o{ EVENT : "OwnerId"
    IMAGE ||--o{ EVENT : "LogoImageId"
    ROLE ||--o{ ROLE_PERMISSION : "permissions"

    EVENT {
        bigint id PK
        string name
        string description
        date event_date
        bigint logo_image_id FK
        bigint owner_id FK
        timestamptz created_at
        boolean is_archived
    }

    IMAGE {
        bigint id PK
        string file_name
        string content_type
        bytea data
        timestamptz created_at
    }
```

Связь `Event.OwnerId -> User.Id` имеет `Restrict`. Связь с изображением использует `SetNull` при удалении изображения.

## 14. Backend: файлы и ответственность

| Файл | Класс / ответственность |
|---|---|
| `Api/Controllers/EventsController.cs` | Получение, создание, обновление, DTO и безопасные ошибки |
| `Api/Controllers/ImagesController.cs` | Загрузка и выдача обложек |
| `Api/Contracts/EventContracts.cs` | Event DTO, requests, profile и ответ загрузки |
| `Api/Contracts/AuthContracts.cs` | `EventOption` в ответе входа |
| `Api/Controllers/AuthController.cs` | Возвращает доступные мероприятия и роль пользователя |
| `Application/Entities/Event.cs` | Доменная сущность мероприятия |
| `Application/Entities/ImageEntity.cs` | Доменная сущность изображения |
| `Application/Services/IEventService.cs` | Контракт операций Event |
| `Application/Services/IImageService.cs` | Контракт чтения и сохранения изображений |
| `Application/Repositories/IEventRepository.cs` | Контракт хранения Event |
| `Application/Repositories/IImageRepository.cs` | Контракт хранения ImageEntity |
| `Infrastructure/Services/EventService.cs` | Транзакция создания и правила обновления |
| `Infrastructure/Services/ImageService.cs` | Валидация форматов, сигнатур и SVG |
| `Infrastructure/Services/RoleService.cs` | Стандартные роли и permissions |
| `Infrastructure/Services/PermissionService.cs` | Проверки `create_event` |
| `Infrastructure/Repositories/EventRepository.cs` | EF Core-запросы Event и owner |
| `Infrastructure/Repositories/ImageRepository.cs` | EF Core-запросы и сохранение байтов |
| `Infrastructure/Repositories/UserRepository.cs` | Профили создателя и eager loading permissions |
| `Infrastructure/Data/Configurations/EventConfiguration.cs` | Колонки, длины, FK Owner/Image |
| `Infrastructure/Data/Configurations/ImageEntityConfiguration.cs` | Таблица `images` и `bytea` |
| `Infrastructure/Data/ApplicationDbContext.cs` | DbSet и применение configurations |
| `Infrastructure/Authorization/PermissionAuthorizationHandler.cs` | Проверка permission по route |
| `Infrastructure/DependencyInjection.cs` | Регистрация сервисов и репозиториев |
| `WebApi/Program.cs` | Authentication, policies, middleware и `MigrateAsync` при старте |
| `Infrastructure/Migrations/20260901111221_InitialCreate.cs` | Единая актуальная схема и bootstrap-данные |

## 15. Начальная миграция и bootstrap

При старте `Program.cs` вызывает `Database.MigrateAsync()`.

Если базы данных ещё нет и PostgreSQL-пользователь имеет право `CREATE DATABASE`, Npgsql создаёт базу, после чего применяется единственная миграция `20260901111221_InitialCreate`.

Миграция создаёт:

- всю актуальную схему;
- Login `admin` с паролем `admin` и `must_change_password = false`;
- bootstrap-мероприятие;
- владельца/сотрудника admin;
- корневую группу `РМГ/500`;
- пять permissions;
- роли `Administrator`, `Manager`, `Approver` и связи permissions;
- корректные значения sequences после явных seed-ID.

Из-за циклической связи `Event.OwnerId -> User.Id` внешний ключ владельца добавляется после вставки bootstrap Event и User.

## 16. Важные ограничения и точки расширения

1. **Создание и загрузка обложки не объединены.** Форма создания не принимает файл; в настройках загрузка и update выполняются двумя HTTP-запросами.
2. **Нет очистки изображений.** Нужен отдельный механизм удаления неиспользуемых `ImageEntity`.
3. **Нет смены владельца.** Для неё потребуется отдельное бизнес-правило и endpoint.
4. **Нет удаления мероприятия в API.** Метод сервиса существует, но наружу не опубликован.
5. **Нет архивации в UI.** Поле `IsArchived` возвращается в DTO, но не редактируется.
6. **Дата не имеет диапазонной проверки.** При необходимости правило следует реализовать и на frontend, и на backend.
7. **Источник профиля создателя — самый новый User по LoginId.** Если контактные данные различаются между мероприятиями, копируется профиль с максимальным `CreatedAt`.
8. **Получение изображения публичное.** Если обложки должны быть закрытыми, потребуется другой механизм доставки авторизации для `<img>`.

## 17. Проверка после изменений

Минимальный набор проверок:

1. `npm.cmd run build` во `frontend`;
2. `dotnet build --no-restore` в `corebackend`;
3. применение миграции на пустой БД;
4. вход `admin/admin`;
5. создание мероприятия и проверка `РМГ/500`, трёх ролей и владельца;
6. изменение названия, описания и даты;
7. загрузка каждого допустимого типа изображения;
8. F5 на настройках и проверка сохранённого preview;
9. проверка плитки дашборда;
10. проверка `403` для пользователя без `create_event`;
11. проверка безопасных `400` без stack trace.

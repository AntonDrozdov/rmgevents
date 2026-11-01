# Сборка и развёртывание

Backend и frontend используют один SemVer-тег из `deploy/.env`:

```text
APP_VERSION=1.5.0
```

Compose запускается с явным `--env-file deploy/.env`. Для `env_file.path` требуется Docker Compose 2.24 или новее. PostgreSQL и внешняя сеть `danetwork` должны существовать до запуска приложения.

## Настройка AIMode

Секреты Yandex AI Studio хранятся только в `deploy/.env.ai`, который исключён из Git и Docker-образов:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\setup-ai.ps1
```

Скрипт запрашивает ID каталога и API-ключ со скрытым вводом. Требуются области ключа `yc.ai.foundationModels.execute` и `yc.ai.models.viewer`. Модель в env не задаётся: пользователь выбирает её в AIMode из актуального Models API.

При переносе на сервер создайте `.env.ai` отдельно рядом с compose-файлом. Не передавайте этот файл через Git или вместе с образами.

## Полная локальная пересборка

Запускайте из корня репозитория:

```powershell
.\deploy\rebuild.ps1
.\deploy\rebuild.ps1 -Bump minor
.\deploy\rebuild.ps1 -Bump major
.\deploy\rebuild.ps1 -Bump none
```

Скрипт собирает и пересоздаёт оба контейнера, а затем сохраняет новую версию в `.env`. Предыдущие теги образов остаются доступными для отката.

## Только backend, frontend из консоли

Чтобы не запускать контейнер frontend:

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.local.yml stop frontend
docker compose --env-file deploy/.env -f deploy/docker-compose.local.yml build corebackend
docker compose --env-file deploy/.env -f deploy/docker-compose.local.yml up -d --no-deps --force-recreate corebackend
```

Frontend запускается отдельно:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Backend доступен на `http://localhost:5000`. Порт dev-сервера frontend выводит Vite; `/api` проксируется на локальный backend.

## Перенос образов на сервер

`transfer-images.cmd` получает список образов через `docker compose config --images`, передаёт их непосредственно в серверный `docker load`, копирует `docker-compose.yml` и `.env` в `/opt/rmgevents` и проверяет конфигурацию. Скрипт не запускает контейнеры и не переносит `.env.ai`.

После загрузки образов на сервере:

```sh
docker compose --env-file .env -f docker-compose.yml up -d --no-build --pull never
```

Команда завершится ошибкой, если образ нужной версии не загружен. Переменная окружения `APP_VERSION` имеет приоритет над `.env`, поэтому перед запуском убедитесь, что в shell не осталось другого значения.

## Секреты production

Значения подключения к PostgreSQL, `Jwt__Key` и `Jwt__SidKey` в compose-файле должны быть заменены production-секретами средствами среды развёртывания. Не используйте локальные значения в публичном окружении и не фиксируйте реальные секреты в Git.

## Проверка

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.local.yml ps -a
docker logs --tail 100 rmgevents-corebackend
```

Проверьте вход, список мероприятий, миграции backend и AIMode. Если frontend работает из консоли, контейнер `rmgevents-frontend` должен оставаться в состоянии `Exited`.

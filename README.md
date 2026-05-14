# Lead CRM

Рабочая MVP-версия CRM для поиска потенциальных клиентов веб-студии / frontend-разработчика.

## Что входит

- Backend API на Node.js без внешних зависимостей.
- Frontend CRM, который работает через backend API.
- Файловая база данных: `server/data/leads.json`.
- CRUD лидов.
- Dashboard и KPI.
- Фильтр "без сайта".
- Карточка клиента.
- Статусы и follow-up даты.
- CSV-импорт.
- CSV-экспорт.
- 2GIS integration endpoint.
- AI message endpoint через OpenAI API или локальный fallback.

## Запуск

```bash
npm start
```

Откройте:

```text
http://localhost:4173
```

Проверка синтаксиса:

```bash
npm run check
```

## Переменные окружения

Создайте `.env` по примеру:

```bash
cp .env.example .env
```

Поля:

```text
PORT=4173
TWO_GIS_API_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
```

Если `TWO_GIS_API_KEY` не задан, endpoint 2GIS возвращает демо-лиды, чтобы приложение сразу работало.

Если `OPENAI_API_KEY` не задан, генерация сообщений работает через локальный шаблон.

## API

```text
GET  /api/health
GET  /api/leads
POST /api/leads
GET  /api/leads/:id
PATCH /api/leads/:id
GET  /api/leads/export.csv

POST /api/integrations/2gis/search
POST /api/integrations/2gis/search-and-save

POST /api/ai/leads/:id/message
```

Пример поиска 2GIS:

```bash
curl -X POST http://localhost:4173/api/integrations/2gis/search-and-save \
  -H "Content-Type: application/json" \
  -d '{"city":"Бишкек","query":"стоматология"}'
```

Пример AI-сообщения:

```bash
curl -X POST http://localhost:4173/api/ai/leads/seed-1/message \
  -H "Content-Type: application/json" \
  -d '{"channel":"WhatsApp"}'
```

## Легальная модель

- 2GIS: использовать официальный API и соблюдать условия, лимиты и тарифы.
- Instagram: не использовать автоматический скрейпинг, обход авторизации, капч, лимитов и защиты.
- Instagram-данные в MVP добавляются вручную или через официальные способы доступа Meta.
- Массовая авторассылка не реализована. Сообщения генерируются для ручной проверки и отправки.

## Следующий production-этап

- Next.js frontend.
- NestJS backend.
- PostgreSQL + Prisma.
- Redis + BullMQ для фоновых задач.
- Website audit module: SSL, доступность, скорость, адаптивность.
- Lead scoring module на backend.
- Auth и роли пользователей.
- История контактов.
- Безопасные интеграции WhatsApp/Telegram/email.

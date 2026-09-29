# Gyanpunja Quiz

A house-wise, live quiz competition platform built with **React, Node/Express, MongoDB and Socket.io**.

Control flows one way: **Admin → Host → House Leaders.**

| Role | What they can do |
| --- | --- |
| **Admin** | Everything. Manages the question bank (add, edit, approve, import), houses, accounts, scoring rules and the round name. Overrides any score. Pauses the whole competition (kill-switch) or resets it. Watches a live activity log. |
| **Host** | Runs the live event. Queues an approved question, presents it to one house (or opens the floor to all), locks answers, judges Correct / Wrong / No answer, and moves to the next question. |
| **House Leader** | Sees the question only when it is presented to their house. Types and submits one answer while the timer runs. Sees the result and the correct answer once it is judged. |
| **Stage display** (`/display`, no login) | Read-only projector screen: question, countdown, whose turn it is, and the live scoreboard. |

## Quick start

You need Node 18+ and a running MongoDB.

```bash
npm run install:all
cp server/.env.example server/.env      # then set JWT_SECRET to a long random string
npm run seed                            # creates admin, host, 4 houses, sample questions
npm run dev:server                      # terminal 1  -> http://localhost:5000
npm run dev:client                      # terminal 2  -> http://localhost:5173
```

## Run with Docker

Install Docker Desktop, copy `.env.example` to `.env`, and set a strong secret:

```bash
cp .env.example .env
# edit .env and replace JWT_SECRET
```

Then build and start the app with MongoDB:

```bash
docker compose up --build -d
docker compose run --rm seed
```

Open `http://localhost:5000` on this computer, or `http://192.168.100.2:5000` from another device on the same network (current LAN IP from `ipconfig`). If the LAN IP changes, update the `CLIENT_ORIGIN` fallback in `docker-compose.yml` or set `CLIENT_ORIGIN` in `.env`, then recreate the app with `docker compose up --build -d`. The MongoDB data is persisted in the `mongo-data` volume. Stop the containers with `docker compose down`; add `-v` only when you also want to delete the database.

Admins can manage rounds in **Admin → Question bank**: add, rename, delete, and reorder them, then assign each question to a round. Questions can include an image or audio file (up to 15 MB each) or a media URL. Uploaded media is kept in the Docker `uploads-data` volume and is shown on the Host, house, and stage screens.

Seeded logins (**change these before a real event**, Admin → People → Change password):

| Username | Password | Role |
| --- | --- | --- |
| `admin` | `admin123` | Admin |
| `host` | `host123` | Host |
| `ruby` / `sapphire` / `emerald` / `topaz` | `<name>123` | House leader for that house |

### Production (one server)

```bash
npm run build     # builds client/dist
npm start         # Express serves the API, sockets and the built React app on PORT
```

## How one question moves through the system

```
Admin approves question
   -> Host clicks Queue           status: queued    (visible to Admin + Host only)
   -> Host clicks Present         status: active    (timer starts on the server)
        to one house, or open floor to all houses
   -> Timer ends / Host locks     status: locked
   -> Host judges                 status: evaluated (points applied, answer revealed)
   -> Host clicks Next question   status: idle      (or "Pass to another house" after a wrong answer)
```

## Design decisions worth knowing

- **The server is the referee.** The timer end is stored in MongoDB and enforced on the server, so a house leader cannot answer late by tampering with their browser. Clients only display a countdown. Answers are accepted atomically, one per house.
- **Answers never leak early.** Every screen receives its own filtered view of the game state. House leaders and the stage display never receive the reference answer until the question is judged. A queued question is visible to staff only. (Covered by `npm test` inside `server/`, which needs no database.)
- **Direct-answer questions, host judges.** There are no multiple-choice options. Houses can type an answer for the record, but the Host decides correct or wrong, since live answers are often spoken.
- **Open floor and passing.** The Host can open a question to all houses (then picks which house answered), or pass it to another house after a wrong answer.
- **Scoring rules are editable.** Points per difficulty (default 10 / 20 / 30), points lost for a wrong answer (default 0), and the default timer (default 30 s) are set in Admin → Rules. The Host can override the points on any single question.
- **Pausing.** Pausing locks a live question and blocks the Host and house leaders. The Admin keeps full control. The Host can re-present the question after resume.

## Real-time events (Socket.io)

Client → server (each takes an acknowledgement callback `{ ok, error }`):

| Event | Payload | Allowed |
| --- | --- | --- |
| `host:queue` | `{ questionId }` | Admin, Host |
| `host:clear` | – | Admin, Host |
| `host:present` | `{ mode: 'house' \| 'open', houseId?, duration? }` | Admin, Host |
| `host:lock` | – | Admin, Host |
| `host:evaluate` | `{ result: 'correct' \| 'wrong' \| 'skip', houseId?, points? }` | Admin, Host |
| `house:submit` | `{ text }` | House leader |

Server → client: `state` (role-filtered game state), `scores`, and `log` (Admin only).

## REST API

All routes need `Authorization: Bearer <token>` except login.

- `POST /api/auth/login`, `GET /api/auth/me`
- `GET/POST /api/questions`, `POST /api/questions/bulk`, `PATCH/DELETE /api/questions/:id`, `PATCH /api/questions/:id/approve` (Admin writes; the Host only sees approved questions)
- `GET/POST /api/houses`, `PATCH/DELETE /api/houses/:id`, `PATCH /api/houses/:id/score` with `{ adjustment }` or `{ setTo, reason }` (Admin)
- `GET/POST /api/users`, `PATCH/DELETE /api/users/:id` (Admin)
- `GET /api/game/state`, `PATCH /api/game/settings`, `POST /api/game/pause`, `POST /api/game/reset`, `GET /api/game/logs` (Admin)

## Project layout

```
server/
  server.js              Express + Socket.io + MongoDB entry point
  seed.js                First-run data
  models/                User, House, Question, GameState, ActivityLog
  routes/                auth, users, houses, questions, game
  middleware/auth.js     JWT + role checks
  services/game.js       Question lifecycle, timer, per-role state views
  socket/index.js        Socket auth, rooms, event handlers
client/
  src/pages/             Login, Admin, Host, HouseScreen, Display
  src/hooks/useGame.js   Socket connection + synced countdown
  src/components/ui.jsx  Scoreboard, timer ring, toasts, etc.
```

## Before you go live

- Change every seeded password and set a strong `JWT_SECRET`.
- Run a full rehearsal with a laptop for the Host, a phone per house leader, and the projector on `/display`.
- Put the app behind HTTPS if it is reachable from the internet.

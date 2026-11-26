# FreelanceFlow API

The backend for [FreelanceFlow](https://github.com/Priyankshah01/freelanceflow), a freelance marketplace where clients post jobs, freelancers send proposals, and admins manage the platform.

Built with **Node.js, Express 5, MongoDB (Mongoose), JWT and Socket.IO**.

## Features

- **Auth:** register and log in with JWT; passwords hashed with bcrypt
- **Roles:** client, freelancer and admin, each with its own permissions
- **Jobs:** create, edit, search, filter and sort projects; invite freelancers
- **Proposals:** freelancers apply; clients accept or reject; freelancers can withdraw
- **Admin:** user and project moderation, platform overview, invoices and payouts
- **Real time:** Socket.IO room per user for live notifications

## Run it locally

You need Node.js 20+ and a MongoDB database (a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster works).

```bash
npm install
cp .env.example .env      # then fill in MONGODB_URI and JWT_SECRET
npm run seed              # demo accounts + sample jobs (safe to run again)
npm run dev               # http://localhost:5000
```

Check it's running: <http://localhost:5000/api/__health>

### Demo accounts

All use the password `password123`.

| Role | Email |
|---|---|
| Client | `client@test.com` |
| Freelancer | `freelancer@test.com` |
| Admin | `admin@test.com` |

## Environment variables

| Name | Required | What it's for |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Secret used to sign login tokens |
| `JWT_EXPIRE` | No | Token lifetime (default `30d`) |
| `FRONTEND_URL` | No | Deployed frontend address allowed by CORS (`*.vercel.app` and localhost are always allowed) |
| `ALLOWED_ORIGINS` | No | Extra allowed origins, comma-separated |
| `PORT` | No | Port to listen on (default `5000`) |

## API overview

All routes are under `/api`. Routes marked 🔒 need an `Authorization: Bearer <token>` header.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, 🔒 `GET /auth/me`, 🔒 `POST /auth/logout` |
| Projects | `GET /projects` (search: `search`, filters: `category`, `budget_type`, `experience_level`, `project_size`, `timeline`, `sort`), `GET /projects/:id`, 🔒 `POST /projects`, 🔒 `PUT /projects/:id`, 🔒 `PATCH /projects/:id/status`, 🔒 `DELETE /projects/:id`, 🔒 `POST /projects/:id/invite` |
| Proposals | 🔒 `POST /proposals`, 🔒 `GET /proposals/mine`, 🔒 `GET /proposals/:id`, 🔒 `PATCH /proposals/:id/status`, 🔒 `PATCH /proposals/:id/withdraw` |
| Users | 🔒 `GET /users`, 🔒 `GET /users/profile`, 🔒 `PUT /users/profile`, 🔒 `GET /users/:id` |
| Admin | 🔒 `GET /admin/overview`, users, projects, finance (invoices and payouts) and settings under `/admin/*` |

## Deploy to Render

This repo includes a [`render.yaml`](render.yaml) blueprint.

1. In Render, choose **New → Blueprint** and pick this repository.
2. Enter `MONGODB_URI` and `FRONTEND_URL` when asked. Render generates `JWT_SECRET` for you.
3. In MongoDB Atlas → **Network Access**, allow `0.0.0.0/0` so Render can connect.
4. Run `npm run seed` once (from your computer with the same `MONGODB_URI`) to create the demo data.

> On Render's free plan the server sleeps after 15 minutes without traffic, so the first request after that takes 30–60 seconds.

## Project structure

```
controllers/   request handlers for each area
middleware/    auth (JWT), admin check, validation
models/        Mongoose schemas: User, Project, Proposal, Review, Payments
routes/        Express routers mounted under /api
scripts/       seed script for demo data
utils/         helpers and email service
server.js      app setup, CORS, Socket.IO, startup
```

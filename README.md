# Atelier — Art Studio Website

A full-stack art studio application built with React, Vite, Express, Node.js and MongoDB. Customers can browse and buy one-of-a-kind paintings, request a wall-painting date, and request custom pottery. The studio account can manage available paintings and process booking and pottery requests.

## Features

- Customer registration and login using bcrypt password hashing and JWT authentication.
- A seeded studio account with the `studio` role.
- Painting catalogue using the supplied seed data and artwork images.
- Single-purchase protection for paintings through an atomic availability update.
- Order cancellation that returns a painting to available status.
- Wall booking validation: 7–90 days ahead, 10–500 sq ft, price calculated from the supplied INR rate, and one active reservation per date.
- Booking cancellation at least three days before the date.
- Pottery requests based on supplied item and glaze options, quantity 1–12, needed-by date at least 14 days ahead.
- Customer ownership checks and studio-only administrative routes.
- Loading, empty, and error states on data-loading screens.
- Basic responsive layout.

## Requirements

- Node.js 20 or newer
- npm
- MongoDB running locally or a MongoDB Atlas database

## Project structure

- `backend/` — Express API, Mongoose models, authentication, validation, seed script.
- `frontend/` — React website.
- `seedData/` — original supplied JSON and painting images.
- `backend/seedData/seed.json` — copy used by the backend seed script.

## Setup

### 1. Configure MongoDB and backend

Open a terminal:

```bash
cd backend
npm install
```

Copy `.env.example` to `.env` and set `MONGO_URI` and `JWT_SECRET`.

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

Example local configuration:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/art_studio
JWT_SECRET=replace_with_a_long_random_secret
CLIENT_URL=http://localhost:5173
```

Start MongoDB first. Import the seed paintings and studio account:

```bash
npm run seed
```

Then start the API:

```bash
npm run dev
```

The API runs at `http://localhost:5000`. Check `http://localhost:5000/api/health`.

### 2. Configure and start the frontend

In another terminal, from the project root:

```bash
cd frontend
npm install
```

Copy `frontend/.env.example` to `frontend/.env` if you want to change the API URL. The default is `http://localhost:5000/api`.

Start the frontend:

```bash
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

### 3. Seed account

The supplied dataset contains a studio account:

- Email: `studio@artstudio.in`
- Password: `Studio@123`

The seed script hashes this password before storing it. Change the supplied password and rotate the JWT secret before any non-local use. Do not publish real credentials in the repository.

Register customer accounts through the website. Public registration always creates a `customer`; it does not allow users to choose the studio role.

## Main API routes

All API routes except `/api/health`, `/api/meta`, registration and login require a valid bearer token unless noted.

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Register customer |
| POST | `/api/auth/login` | Log in |
| GET | `/api/auth/me` | Current user |
| GET | `/api/meta` | Currency, mural rate, pottery items and glazes |
| GET | `/api/paintings` | Browse paintings |
| POST/PATCH | `/api/paintings` and `/api/paintings/:id` | Studio adds/edits an available painting |
| POST | `/api/orders` | Customer purchases a painting |
| GET | `/api/orders/my` | Customer's own orders |
| GET | `/api/orders` | Studio sees all orders |
| PATCH | `/api/orders/:id/cancel` | Customer cancels own order |
| POST | `/api/bookings` | Customer requests a wall date |
| GET | `/api/bookings/my` | Customer's own bookings |
| GET | `/api/bookings` | Studio sees all bookings |
| PATCH | `/api/bookings/:id/status` | Studio confirms/declines |
| PATCH | `/api/bookings/:id/cancel` | Customer cancels own booking |
| POST | `/api/pottery` | Customer creates a pottery request |
| GET | `/api/pottery/my` | Customer's own pottery requests |
| GET | `/api/pottery` | Studio sees all pottery requests |
| PATCH | `/api/pottery/:id` | Customer edits a request still `requested` |
| PATCH | `/api/pottery/:id/status` | Studio accepts/declines |
| PATCH | `/api/pottery/:id/cancel` | Customer cancels a request still `requested` |

## Test checklist

1. Register a customer and log in.
2. Buy an available painting.
3. Try to buy the same painting again; it should be rejected.
4. Cancel the order and confirm the painting becomes available.
5. Submit a valid wall booking and try the same date from another customer; only one reservation should succeed.
6. Check invalid wall sizes and dates.
7. Submit a pottery request, then log in as the studio and accept or decline it.
8. Try accessing studio-only routes with a customer token; the API should return 403.
9. Confirm the customer dashboard shows only the logged-in customer's records.

## Notes and limitations

- No real payment processing is included.
- Painting image uploads are not implemented; the UI uses the supplied images and a path field for newly added paintings.
- Booking dates are represented as ISO calendar dates (`YYYY-MM-DD`) and interpreted in UTC for date-range checks.
- Painting reservation uses an atomic update. Order creation is followed by a compensating availability reset if order creation fails; this is not a multi-document MongoDB transaction. For production use, run MongoDB as a replica set and wrap purchase/cancellation changes in transactions.
- Wall dates are protected by a unique reservation record. Declined and cancelled bookings release their reservation.
- The studio password is supplied by the assignment dataset for local evaluation. Change it before any deployment.

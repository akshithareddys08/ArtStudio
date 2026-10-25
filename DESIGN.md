# Design Decisions

## 1. How do login and the two roles work?

Passwords are hashed with bcrypt before storage. After login, the server returns a signed JWT, which the frontend sends in the `Authorization` header. Authentication middleware verifies the token, and role middleware restricts studio routes to the `studio` role. Customer routes query records using the authenticated customer's ID and return 404 when a record does not belong to them.

## 2. Which database did you choose, and why?

I chose MongoDB with Mongoose because the application uses JavaScript across the frontend and backend, and Mongoose provides schemas, validation and references for users, paintings, orders, bookings and pottery requests. The supplied seed JSON provides paintings, the mural rate, pottery items, glazes and the studio account.

## 3. How do you stop two people from taking the same painting or date?

The painting purchase endpoint changes a painting from `available` to `sold` using a single atomic conditional update. Only one request can update an available painting. The server then creates the order and attempts to restore availability if order creation fails. Wall bookings use a separate reservation collection with a unique index on the calendar date, so only one active reservation can hold a date. Cancelling or declining a booking releases that reservation.

## 4. What did you finish, what did you leave out, and what would you do next?

Implemented: customer registration/login, studio login, painting browsing and management, painting orders and cancellation, wall booking validation and studio decisions, pottery requests and studio decisions, ownership/role checks, and basic loading/error/empty states.

Left out: real payments, image uploads, password reset, email verification, automated test suites, and a polished production deployment. The purchase workflow uses a compensating update rather than a MongoDB transaction, so this should be strengthened before production.

Next: add automated API tests, use MongoDB transactions for purchase and cancellation workflows, improve studio password management, and add better image management.

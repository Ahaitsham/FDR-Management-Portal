# FDR-Management-Portal

Base URL: http://localhost:3000

Login stores a `token` cookie, and every later request uses it automatically.
In Postman, use the same host for all requests.

# ADMIN LOGIN (for testing)
    Email    : <ADMIN_EMAIL from .env>
    Password : <ADMIN_PASSWORD from .env>
    (Created by running: node scripts/seed.js)

# ROLES
    ADMIN       --> created by seed script only
    INSTITUTION --> self-register (needs an institution id)
    AUDITOR     --> self-register (admin must set their scope after)

# API ENDPOINTS

1. For users
    a. http://localhost:3000/api/users/register              --> POST   (Any User)
    b. http://localhost:3000/api/users/login                 --> POST   (Any User)
    c. http://localhost:3000/api/users/logout                --> POST   (Any User)
    d. http://localhost:3000/api/users/me                    --> GET    (Logged-in User)
    e. http://localhost:3000/api/users/me                    --> PATCH  (Logged-in User)
    f. http://localhost:3000/api/users/me/change-password    --> POST   (Logged-in User)
    g. http://localhost:3000/api/users                       --> POST   (Admin only)
    h. http://localhost:3000/api/users                       --> GET    (Admin only)
    i. http://localhost:3000/api/users/:id                   --> GET    (Admin only)
    j. http://localhost:3000/api/users/:id                   --> PATCH  (Admin only)
    k. http://localhost:3000/api/users/:id/reset-password    --> POST   (Admin only)

2. For institutions
    a. http://localhost:3000/api/institutions/public         --> GET    (Any User)
    b. http://localhost:3000/api/institutions                --> POST   (Admin only)
    c. http://localhost:3000/api/institutions                --> GET    (Admin, Auditor)
    d. http://localhost:3000/api/institutions/:id            --> GET    (Admin, Auditor)
    e. http://localhost:3000/api/institutions/:id            --> PATCH  (Admin only)


# FDR Management Portal

Backend API for AICTE Fixed Deposit Receipt submission, verification, renewal, and expiry tracking.

Base URL: `http://localhost:3000`

## Roles

- `ADMIN` - AICTE administrator with full access.
- `INSTITUTION` - submits and manages its own FDRs.
- `AUDITOR` - reviews FDRs in its audit scope.

Authentication uses the `token` HTTP-only cookie set by the login endpoint. All FDR and audit endpoints require login.

## User endpoints

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/api/users/register` | Public | Register an `INSTITUTION` or `AUDITOR` user. |
| POST | `/api/users/login` | Public | Login and receive the auth cookie. |
| POST | `/api/users/logout` | Public | Clear the auth cookie. |
| GET | `/api/users/me` | Logged-in user | Get the current user profile. |
| PATCH | `/api/users/me` | Logged-in user | Update current user name or phone. |
| POST | `/api/users/:id/reset-password` | Logged-in user | Reset a user's password. |
| POST | `/api/users/create` | ADMIN | Create a user. |
| GET | `/api/users` | ADMIN | List users with `page`, `limit`, and `role`. |
| GET | `/api/users/:id` | ADMIN | Get one user. |
| PATCH | `/api/users/:id` | ADMIN | Update a user. |
| POST | `/api/users/me/change-password` | ADMIN | Change the current admin password. |

## Institution endpoints

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/institutions/public` | Public | List active institutions for registration. |
| POST | `/api/institutions` | ADMIN | Create an institution. |
| GET | `/api/institutions` | ADMIN, AUDITOR | List institutions. Supports `page`, `limit`, `state`, `type`, `isActive`, and `search`. |
| GET | `/api/institutions/:id` | ADMIN, AUDITOR | Get an institution. |
| PATCH | `/api/institutions/:id` | ADMIN | Update an institution. |

## FDR endpoints

For create, update, resubmit, and renew, send `multipart/form-data` with a `document` (PDF/JPEG/PNG, maximum 5 MB) and a `data` JSON string.

```json
{
  "fdrReferenceNo": "SBI-2026-001",
  "receiptNo": "REC-001",
  "bank": { "name": "State Bank of India", "code": "SBI", "branch": "Pune" },
  "depositorName": "Demo Institute",
  "customerId": "CUST-001",
  "accountNo": "123456789012",
  "amount": 100000,
  "interestRate": 6.75,
  "tenure": { "value": 1, "unit": "YEARS" },
  "issueDate": "2026-01-01",
  "maturityDate": "2027-01-01"
}
```

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/api/fdrs` | INSTITUTION | Create and submit an FDR. Document required. |
| GET | `/api/fdrs` | ADMIN, INSTITUTION, AUDITOR | List scoped FDRs. Filters: `page`, `limit`, `status`, `expiryState`, `bank`, `institution`, `state`, `maturingWithinDays`, `q`, `assignedAuditor`, `dateFrom`, `dateTo`, `sort`, `order`. |
| GET | `/api/fdrs/stats` | ADMIN, INSTITUTION, AUDITOR | Get dashboard statistics. |
| GET | `/api/fdrs/:id` | ADMIN, INSTITUTION, AUDITOR | Get one scoped FDR. |
| GET | `/api/fdrs/:id/document` | ADMIN, INSTITUTION, AUDITOR | Download the private FDR document. |
| GET | `/api/fdrs/:id/audit-history` | ADMIN, INSTITUTION, AUDITOR | Get FDR audit history. Supports `page`, `limit`. |
| PATCH | `/api/fdrs/:id` | INSTITUTION | Edit own FDR in editable status. Document optional. |
| POST | `/api/fdrs/:id/resubmit` | INSTITUTION | Resubmit a rejected FDR. Document optional. |
| POST | `/api/fdrs/:id/renew` | INSTITUTION, ADMIN | Create linked renewal FDR. Document required. |
| DELETE | `/api/fdrs/:id` | INSTITUTION, ADMIN | Soft-delete an FDR. |

Documents are private Supabase Storage objects. Responses return document availability, MIME type, and size only; they never return storage keys or public URLs.

## Audit endpoints

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/audit/queue` | AUDITOR, ADMIN | Review queue. Filters: `page`, `limit`, `status`, `mine`, `unassigned`, `institution`, `bank`, `state`. |
| POST | `/api/audit/fdrs/:id/claim` | AUDITOR, ADMIN | Claim an unassigned submitted FDR. |
| POST | `/api/audit/fdrs/:id/assign` | ADMIN | Assign FDR to auditor. Body: `{ "auditorId": "..." }`. |
| POST | `/api/audit/fdrs/:id/approve` | Assigned AUDITOR, ADMIN | Approve FDR; all checklist values must be `true`. |
| POST | `/api/audit/fdrs/:id/reject` | Assigned AUDITOR, ADMIN | Reject FDR; needs `rejectionReason` and 10+ character `remarks`. |
| POST | `/api/audit/fdrs/:id/request-resubmission` | Assigned AUDITOR, ADMIN | Request resubmission; needs `rejectionReason` and 10+ character `remarks`. |
| GET | `/api/audit/logs` | ADMIN | List logs. Filters: `page`, `limit`, `actor`, `action`, `entityType`, `entityId`, `dateFrom`, `dateTo`. |

Approval request body:

```json
{
  "remarks": "Receipt verified with bank details.",
  "checklist": {
    "bankVerified": true,
    "amountMatches": true,
    "datesValid": true,
    "documentClear": true
  }
}
```

## Environment variables

Copy `backend/.env.example` to `backend/.env`, then set:

```env
MONGO_URI=
JWT_SECRET=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_BUCKET=fdr-documents
CRON_ENABLED=true
CRON_SCHEDULE=0 2 * * *
```

## Run

```bash
cd backend
npm install
npm run dev
```


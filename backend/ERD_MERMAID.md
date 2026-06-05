# FM ER Diagram (Core Domain)

This is a readable core ER diagram for the main operational flow.
For the complete FK list across all tables, use `backend/ERD_RELATIONS.md`.

```mermaid
erDiagram
  USERS ||--o{ COMPANIES : owns
  COMPANIES ||--o{ COMPANY_USERS : has
  COMPANIES ||--o{ ROLE_PERMISSIONS : defines
  COMPANIES ||--o{ LOCATIONS : has
  COMPANIES ||--o{ DEPARTMENTS : has
  COMPANIES ||--o{ CHECKLIST_TEMPLATES : has
  COMPANIES ||--o{ LOGSHEET_TEMPLATES : has
  COMPANIES ||--o{ SHIFTS : has

  LOCATIONS ||--o{ BUILDINGS : contains
  BUILDINGS ||--o{ FLOORS : contains
  FLOORS ||--o{ LOCATION_DEPARTMENTS : contains
  LOCATION_DEPARTMENTS ||--o{ ROOMS : contains

  COMPANIES ||--o{ ASSETS : owns
  LOCATIONS ||--o{ ASSETS : assigned
  BUILDINGS ||--o{ ASSETS : assigned
  FLOORS ||--o{ ASSETS : assigned
  DEPARTMENTS ||--o{ ASSETS : assigned
  LOCATION_DEPARTMENTS ||--o{ ASSETS : assigned
  ROOMS ||--o{ ASSETS : assigned

  ASSETS ||--o{ FLAGS : generates
  FLAGS ||--o{ WORK_ORDERS : linked
  ASSETS ||--o{ WORK_ORDERS : has
  WORK_ORDERS ||--o{ WORK_ORDER_HISTORY : history

  ASSETS ||--o{ CHECKLIST_SUBMISSIONS : submitted_for
  CHECKLIST_TEMPLATES ||--o{ CHECKLIST_TEMPLATE_QUESTIONS : has
  CHECKLIST_TEMPLATES ||--o{ CHECKLIST_ASSIGNMENTS : assigned
  CHECKLIST_ASSIGNMENTS ||--o{ CHECKLIST_SUBMISSIONS : produces
  CHECKLIST_SUBMISSIONS ||--o{ CHECKLIST_SUBMISSION_ANSWERS : includes

  ASSETS ||--o{ LOGSHEET_TEMPLATES : configured
  LOGSHEET_TEMPLATES ||--o{ LOGSHEET_SECTIONS : has
  LOGSHEET_SECTIONS ||--o{ LOGSHEET_QUESTIONS : has
  LOGSHEET_TEMPLATES ||--o{ LOGSHEET_ENTRIES : receives
  LOGSHEET_ENTRIES ||--o{ LOGSHEET_ANSWERS : includes

  COMPANY_USERS ||--o{ EMPLOYEE_SHIFTS : assigned
  SHIFTS ||--o{ EMPLOYEE_SHIFTS : maps

  COMPANIES ||--o{ SOFT_SERVICE_REQUESTS : raises
  ASSETS ||--o{ SOFT_SERVICE_REQUESTS : linked
```

## Notes

- `role_permissions` stores per-role JSON CRUD policy by module/tab.
- `company_users.permissions` can store user-level overrides.
- `company_users.module_access` stores tab visibility overrides.

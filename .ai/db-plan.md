# HealthyMeal Database Schema

## 1. Tabele

### 1.1 preference_category_enum (typ wyliczeniowy)

```sql
CREATE TYPE preference_category_enum AS ENUM (
  'lubiane',
  'nielubiane',
  'wykluczone',
  'diety'
);
```

### 1.2 action_type_enum (typ wyliczeniowy)

```sql
CREATE TYPE action_type_enum AS ENUM (
  'generate_new',
  'generate_modification'
);
```

---

### 1.3 preferences

| Kolumna    | Typ                      | Ograniczenia                                                      |
| ---------- | ------------------------ | ----------------------------------------------------------------- |
| id         | SERIAL                   | PRIMARY KEY                                                       |
| user_id    | UUID                     | NOT NULL, FOREIGN KEY REFERENCES auth.users(id) ON DELETE CASCADE |
| category   | preference_category_enum | NOT NULL                                                          |
| value      | VARCHAR(50)              | NOT NULL, CHECK (char_length(value) <= 50)                        |
| created_at | TIMESTAMPTZ              | NOT NULL DEFAULT now()                                            |

- UNIKALNE: `(user_id, category, value)`

---

### 1.4 recipes

| Kolumna           | Typ          | Ograniczenia                                                      |
| ----------------- | ------------ | ----------------------------------------------------------------- |
| id                | SERIAL       | PRIMARY KEY                                                       |
| user_id           | UUID         | NOT NULL, FOREIGN KEY REFERENCES auth.users(id) ON DELETE CASCADE |
| title             | VARCHAR(255) | NOT NULL                                                          |
| content           | TEXT         | NOT NULL, CHECK (char_length(content) <= 5000)                    |
| additional_params | TEXT         | CHECK (char_length(additional_params) <= 5000)                    |
| created_at        | TIMESTAMPTZ  | NOT NULL DEFAULT now()                                            |
| updated_at        | TIMESTAMPTZ  | NOT NULL DEFAULT now()                                            |

---

### 1.5 logs

| Kolumna                | Typ              | Ograniczenia                                                      |
| ---------------------- | ---------------- | ----------------------------------------------------------------- |
| id                     | SERIAL           | PRIMARY KEY                                                       |
| user_id                | UUID             | NOT NULL, FOREIGN KEY REFERENCES auth.users(id) ON DELETE CASCADE |
| action_type            | action_type_enum | NOT NULL                                                          |
| is_accepted            | BOOLEAN          |                                                                   |
| actual_ai_model        | TEXT             | NOT NULL                                                          |
| generate_response_time | INTEGER          | NOT NULL -- czas w milisekundach                                  |
| created_at             | TIMESTAMPTZ      | NOT NULL DEFAULT now()                                            |

---

## 2. Relacje

- **users → preferences**: 1:N przez `preferences.user_id REFERENCES auth.users(id)`
- **users → recipes**: 1:N przez `recipes.user_id REFERENCES auth.users(id)`
- **users → logs**: 1:N przez `logs.user_id REFERENCES auth.users(id)`

## 3. Indeksy

```sql
-- Preferences
CREATE INDEX idx_preferences_user_id ON preferences(user_id);

-- Recipes
CREATE INDEX idx_recipes_user_created ON recipes(user_id, created_at);

-- Logs
CREATE INDEX idx_logs_user_created ON logs(user_id, created_at);
```

## 4. Row-Level Security (RLS)

```sql
-- Włącz RLS
ALTER TABLE preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs       ENABLE ROW LEVEL SECURITY;

-- Polityka: tylko własne wiersze
CREATE POLICY user_is_owner ON preferences
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY user_is_owner ON recipes
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY user_is_owner ON logs
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

## 5. Uwagi projektowe

- **Brak tabeli users**: korzystamy z katalogu `auth.users` dostarczonego przez Supabase Auth.
- **CHECK constraints**: zapewniają zgodność z wymaganiami długości pól.

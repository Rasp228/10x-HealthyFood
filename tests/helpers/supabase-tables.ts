/**
 * Stanowa atrapa klienta Supabase z wieloma tabelami.
 *
 * Trasy i prawdziwe serwisy wykonują na niej swoje łańcuchy zapytań, a test porównuje stan tabel
 * przed operacją i po niej (`snapshot()`), osobno od statusu odpowiedzi. Uogólnia atrapę jednej
 * tabeli z bloku `DELETE /api/recipes/:id` w `tests/unit/recipes-route.test.ts` (§6.3 test-planu).
 *
 * **Atrapa nie jest bazą.** Widzi wyłącznie to, co robi kod: filtry, kolejność i rodzaj zapisu.
 * Nie zna RLS, kluczy obcych (`on delete set null`), CHECK-ów ani wartości domyślnych kolumn
 * (`created_at`, `updated_at`) - i celowo ich nie udaje, bo wtedy test dowodziłby atrapy, nie kodu.
 * Jedynym wyjątkiem jest opcjonalna deklaracja unikatu (`unique`), która odwzorowuje literał
 * ograniczenia z migracji i kończy kolizję błędem `{ code: "23505" }`, jak Postgres.
 *
 * Obsługuje dokładnie łańcuchy tras objętych zmianą `testing-protected-data-and-limits`:
 * `select` (także z `{ count: "exact" }`), `insert`, `upsert` (z `onConflict`), `update`, `delete`,
 * filtry `eq` / `is`, a do tego `order`, `range`, `limit`, `single`, `maybeSingle` i `await`.
 * Nieznana tabela albo nieobsługiwana metoda kończy się wyjątkiem, nie cichym pustym wynikiem.
 * Uwaga: wyjątek z nieobsługiwanej metody (`.or`, `.ilike`, `.in` - `TypeError`) łapie `catch`
 * trasy i zamienia w 500. Test oczekujący 500 musi więc sprawdzić też konkretny błąd przekazany
 * do `console.error`, inaczej przejdzie z niewłaściwego powodu.
 *
 * Import w testach ścieżką względną (`../helpers/supabase-tables`) - Jest nie ma aliasu `@tests`.
 */

export type Row = Record<string, unknown>;
export type TableState = Record<string, Row[]>;

/** Błąd w kształcie `PostgrestError` - tyle, ile czytają trasy (`code`, `message`). */
export interface MockPostgrestError {
  code: string;
  message: string;
  details: string | null;
  hint: string | null;
}

export interface MockQueryResult {
  data: Row | Row[] | null;
  error: MockPostgrestError | null;
  count: number | null;
}

export interface SupabaseTablesOptions {
  /** Użytkownik zwracany przez `auth.getUser()`; `null` udaje żądanie bez sesji. */
  userId: string | null;
  /** Początkowe wiersze per tabela. Kopiowane głęboko - tablice przekazane tu nie są mutowane. */
  tables: TableState;
  /**
   * Ograniczenia unikatu per tabela: lista zestawów kolumn, np.
   * `{ preferences: [["user_id", "category", "value"]] }`. Tylko jako odwzorowanie literału migracji.
   */
  unique?: Record<string, string[][]>;
}

type Operation = "select" | "insert" | "upsert" | "update" | "delete";
/** `is` zapamiętany osobno: brak kolumny w wierszu (`undefined`) to dla niego `null`, jak w bazie. */
type Filter = [column: string, value: unknown, operator: "eq" | "is"];
type OrderBy = [column: string, ascending: boolean];

const deepCopy = <T>(value: T): T => structuredClone(value);

const pgError = (code: string, message: string): MockPostgrestError => ({ code, message, details: null, hint: null });

/** Porządek wartości kolumny: liczby numerycznie, reszta jako napisy, `null` na końcu (jak w Postgresie przy ASC). */
const compareValues = (a: unknown, b: unknown): number => {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const left = String(a);
  const right = String(b);
  return left < right ? -1 : left > right ? 1 : 0;
};

/** `"*"` oddaje cały wiersz, lista kolumn po przecinku - tylko te kolumny. */
const project = (row: Row, columns: string): Row => {
  if (columns.trim() === "*") {
    return deepCopy(row);
  }

  const projected: Row = {};
  for (const column of columns.split(",").map((name) => name.trim())) {
    projected[column] = deepCopy(row[column]);
  }
  return projected;
};

export const createSupabaseTables = (options: SupabaseTablesOptions) => {
  /** Stan żywy. Klucze stałe, tablice podmieniane przy `delete` - czytaj `tables.<nazwa>` po operacji. */
  const tables: TableState = deepCopy(options.tables);
  const unique = options.unique ?? {};

  const snapshot = (): TableState => deepCopy(tables);

  const nextId = (rows: Row[]): number =>
    rows.reduce((max, row) => (typeof row.id === "number" && row.id > max ? row.id : max), 0) + 1;

  /** Pierwsza kolizja `candidate` z którymkolwiek wierszem z `others` albo `null`. */
  const findViolation = (table: string, candidate: Row, others: Row[]): string[] | null => {
    for (const columns of unique[table] ?? []) {
      if (others.some((other) => columns.every((column) => other[column] === candidate[column]))) {
        return columns;
      }
    }
    return null;
  };

  const violationError = (table: string, columns: string[]) =>
    pgError("23505", `duplicate key value violates unique constraint on ${table} (${columns.join(", ")})`);

  class QueryBuilder implements PromiseLike<MockQueryResult> {
    private operation: Operation | null = null;
    private payload: Row[] = [];
    private changes: Row = {};
    private onConflict: string[] = [];
    private readonly filters: Filter[] = [];
    private readonly orders: OrderBy[] = [];
    private returning: string | null = null;
    private countExact = false;
    private rangeBounds: [number, number] | null = null;
    private limitCount: number | null = null;
    private cardinality: "many" | "single" | "maybeSingle" = "many";

    constructor(private readonly table: string) {}

    private start(operation: Operation): this {
      if (this.operation !== null) {
        throw new Error(`Atrapa: ${operation}() po ${this.operation}() w jednym łańcuchu`);
      }
      this.operation = operation;
      return this;
    }

    /** Samodzielnie - odczyt. Po zapisie - `returning` z wybranymi kolumnami, jak w PostgREST. */
    select(columns = "*", selectOptions?: { count?: "exact" }): this {
      if (this.operation === null) {
        this.start("select");
        this.countExact = selectOptions?.count === "exact";
      }
      this.returning = columns;
      return this;
    }

    insert(values: Row | Row[]): this {
      this.payload = deepCopy(Array.isArray(values) ? values : [values]);
      return this.start("insert");
    }

    upsert(values: Row | Row[], upsertOptions?: { onConflict?: string }): this {
      this.payload = deepCopy(Array.isArray(values) ? values : [values]);
      this.onConflict = (upsertOptions?.onConflict ?? "id").split(",").map((column) => column.trim());
      return this.start("upsert");
    }

    update(changes: Row): this {
      this.changes = deepCopy(changes);
      return this.start("update");
    }

    delete(): this {
      return this.start("delete");
    }

    eq(column: string, value: unknown): this {
      this.filters.push([column, value, "eq"]);
      return this;
    }

    /**
     * `.is(kolumna, null)` - jedyne użycie w trasach. Kolumna, której wiersz atrapy w ogóle nie ma,
     * liczy się jako `null`: inaczej niekompletny seed nigdy by nie pasował, a asercja „nic się nie
     * zmieniło” byłaby pusta.
     */
    is(column: string, value: null | boolean): this {
      this.filters.push([column, value, "is"]);
      return this;
    }

    order(column: string, orderOptions?: { ascending?: boolean }): this {
      this.orders.push([column, orderOptions?.ascending ?? true]);
      return this;
    }

    range(from: number, to: number): this {
      this.rangeBounds = [from, to];
      return this;
    }

    limit(count: number): this {
      this.limitCount = count;
      return this;
    }

    single(): this {
      this.cardinality = "single";
      return this;
    }

    maybeSingle(): this {
      this.cardinality = "maybeSingle";
      return this;
    }

    then<TResult1 = MockQueryResult, TResult2 = never>(
      onfulfilled?: ((value: MockQueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): Promise<TResult1 | TResult2> {
      return new Promise<MockQueryResult>((resolve) => resolve(this.execute())).then(onfulfilled, onrejected);
    }

    /** Wiersz spełnia KAŻDY filtr - tak samo dla odczytu, `update` i `delete`. */
    private matches = (row: Row): boolean =>
      this.filters.every(([column, value, operator]) =>
        operator === "is" ? (row[column] ?? null) === value : row[column] === value
      );

    private rows(): Row[] {
      return tables[this.table];
    }

    private execute(): MockQueryResult {
      switch (this.operation) {
        case "select":
          return this.runSelect();
        case "insert":
          return this.runInsert();
        case "upsert":
          return this.runUpsert();
        case "update":
          return this.runUpdate();
        case "delete":
          return this.runDelete();
        default:
          throw new Error(`Atrapa: łańcuch na ${this.table} bez select/insert/upsert/update/delete`);
      }
    }

    private runSelect(): MockQueryResult {
      let found = this.rows().filter(this.matches);
      const count = found.length;

      if (this.orders.length > 0) {
        found = [...found].sort((a, b) => {
          for (const [column, ascending] of this.orders) {
            const order = compareValues(a[column], b[column]);
            if (order !== 0) return ascending ? order : -order;
          }
          return 0;
        });
      }

      if (this.rangeBounds !== null) {
        const [from, to] = this.rangeBounds;
        found = found.slice(from, to + 1);
      }

      if (this.limitCount !== null) {
        found = found.slice(0, this.limitCount);
      }

      return this.respond(found, this.countExact ? count : null);
    }

    private runInsert(): MockQueryResult {
      const existing = this.rows();
      const added: Row[] = [];

      for (const values of this.payload) {
        const row: Row = { ...values, id: values.id ?? nextId([...existing, ...added]) };
        const violation = findViolation(this.table, row, [...existing, ...added]);
        if (violation) {
          // Cała instrukcja się wycofuje - żaden wiersz z tej paczki nie zostaje zapisany.
          return this.fail(violationError(this.table, violation));
        }
        added.push(row);
      }

      existing.push(...added);
      return this.respond(added, null);
    }

    /**
     * Scala po kolumnach `onConflict`: istniejący wiersz dostaje nowe wartości, brak wiersza to
     * zwykły insert. Wiersz z upsertu nie dostaje `id` - jedyny upsert w kodzie (`user_settings`)
     * ma kluczem `user_id`.
     */
    private runUpsert(): MockQueryResult {
      const existing = this.rows();
      const written: Row[] = [];

      for (const values of this.payload) {
        const target = existing.find((row) => this.onConflict.every((column) => row[column] === values[column]));
        if (target) {
          Object.assign(target, values);
          written.push(target);
        } else {
          const row: Row = { ...values };
          existing.push(row);
          written.push(row);
        }
      }

      return this.respond(written, null);
    }

    private runUpdate(): MockQueryResult {
      const existing = this.rows();
      const targets = existing.filter(this.matches);
      const untouched = existing.filter((row) => !this.matches(row));
      const updated = targets.map((row) => ({ ...row, ...this.changes }));

      for (const [index, row] of updated.entries()) {
        const others = [...untouched, ...updated.filter((_, other) => other !== index)];
        const violation = findViolation(this.table, row, others);
        if (violation) {
          return this.fail(violationError(this.table, violation));
        }
      }

      targets.forEach((row, index) => Object.assign(row, updated[index]));
      return this.respond(targets, null);
    }

    private runDelete(): MockQueryResult {
      const deleted = this.rows().filter(this.matches);
      tables[this.table] = this.rows().filter((row) => !this.matches(row));
      return this.respond(deleted, null);
    }

    private fail(error: MockPostgrestError): MockQueryResult {
      return { data: null, error, count: null };
    }

    /**
     * Kształt wyniku jak w PostgREST: zapis bez `select()` oddaje `data: null`; `single()` przy
     * innej liczbie trafień niż jedno - błąd `PGRST116`; `maybeSingle()` przy zerze - `null`.
     */
    private respond(found: Row[], count: number | null): MockQueryResult {
      if (this.operation !== "select" && this.returning === null) {
        return { data: null, error: null, count };
      }

      const columns = this.returning ?? "*";
      const data = found.map((row) => project(row, columns));

      if (this.cardinality === "many") {
        return { data, error: null, count };
      }

      if (data.length === 1) {
        return { data: data[0], error: null, count };
      }

      if (data.length === 0 && this.cardinality === "maybeSingle") {
        return { data: null, error: null, count };
      }

      return this.fail(pgError("PGRST116", `JSON object requested, multiple (or no) rows returned (${data.length})`));
    }
  }

  const supabase = {
    auth: {
      getUser: async () => ({
        data: { user: options.userId === null ? null : { id: options.userId, email: `${options.userId}@example.com` } },
        error: null,
      }),
    },
    from: (table: string) => {
      if (!(table in tables)) {
        throw new Error(`Atrapa nie zna tabeli ${table}`);
      }
      return new QueryBuilder(table);
    },
  };

  return { supabase, tables, snapshot };
};

/**
 * Health Check endpoint dla testów smoke i monitoringu.
 *
 * Mówi, które wdrożenie odpowiada (`version` = 7 znaków commitu z Vercela) i czy baza żyje.
 * `/api/health` nie jest w `PUBLIC_PATHS`, więc odpowiada tylko zalogowanym.
 */

import type { APIRoute } from "astro";
import { logError } from "../../lib/utils/log";

export const prerender = false;

const HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-cache",
};

/**
 * Tożsamość wdrożenia z `process.env`, które Vercel ustawia w runtime funkcji - tak samo jak
 * `log.ts`, żeby `version` z health i `commit` z linii logu znaczyły to samo. Lokalnie zostaje
 * tryb Vite (`MODE`).
 */
function deploymentIdentity(): { version: string; environment: string } {
  return {
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local",
    environment: process.env.VERCEL_ENV || import.meta.env.MODE,
  };
}

export const GET: APIRoute = async ({ locals }) => {
  const identity = deploymentIdentity();

  // Ping bazy bez pobierania wierszy: `head` + `count`. RLS daje gościowi 0, a to nadal dowód,
  // że połączenie i PostgREST odpowiadają.
  let databaseOk = true;

  try {
    const { error } = await locals.supabase.from("recipes").select("id", { head: true, count: "exact" }).limit(1);

    if (error) {
      throw error;
    }
  } catch (error) {
    databaseOk = false;
    logError("health.database_failed", { requestId: locals.requestId, route: "health" }, error);
  }

  const healthStatus = {
    status: databaseOk ? "ok" : "error",
    timestamp: new Date().toISOString(),
    ...identity,
    requestId: locals.requestId,
    services: {
      database: databaseOk ? "ok" : "error",
    },
  };

  return new Response(JSON.stringify(healthStatus), {
    status: databaseOk ? 200 : 503,
    headers: HEADERS,
  });
};

/**
 * Health Check endpoint dla testów smoke i monitoringu
 */

import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  try {
    // Sprawdź podstawowe funkcjonalności
    const healthStatus = {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      environment: import.meta.env.MODE,
      services: {
        database: "ok", // Tutaj można dodać sprawdzenie połączenia z Supabase
        ai: "ok", // Tutaj można dodać sprawdzenie połączenia z OpenRouter
      },
    };

    return new Response(JSON.stringify(healthStatus), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    const errorStatus = {
      status: "error",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
    };

    return new Response(JSON.stringify(errorStatus), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
    });
  }
};

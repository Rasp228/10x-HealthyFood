import { defineMiddleware } from "astro:middleware";
import { supabaseClient } from "../db/supabase.client.ts";

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.supabase = supabaseClient;

  const authHeader = context.request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    // Ustaw token w kliencie Supabase
    await context.locals.supabase.auth.setSession({
      access_token: token,
      refresh_token: "",
    });
  }

  return next();
});

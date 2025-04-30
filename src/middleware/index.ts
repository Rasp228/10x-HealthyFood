import { defineMiddleware } from "astro:middleware";
import { createClient } from "@supabase/supabase-js";

export const onRequest = defineMiddleware(({ request, locals }, next) => {
  const auth = request.headers.get("authorization") ?? "";
  // każdy request ma własny client z wbudowanym headerem
  locals.supabase = createClient(import.meta.env.SUPABASE_URL, import.meta.env.SUPABASE_KEY, {
    global: { headers: { Authorization: auth } },
  });
  return next();
});

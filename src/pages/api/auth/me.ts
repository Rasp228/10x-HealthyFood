import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ locals }) => {
  const {
    data: { user },
  } = await locals.supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Nieautoryzowany dostęp" }), {
      status: 401,
    });
  }

  return new Response(
    JSON.stringify({
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
      },
    }),
    {
      status: 200,
    }
  );
};

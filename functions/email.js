export const onRequest = async (context) => {
  const { request } = context;
  const url = new URL(request.url);

  if (url.pathname.toLowerCase() === "/email" || url.pathname.toLowerCase() === "/email/") {
    return new Response(null, {
      status: 302,
      headers: { "Location": "mailto:billy@brotown.org" },
    });
  }

  return new Response("Not found", { status: 404 });
};

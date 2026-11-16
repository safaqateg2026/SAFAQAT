// SAFAQAT Google Drive administration.
// OAuth routes remain disabled until Access protection is configured.

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ service: "safaqat-drive-admin", status: "ok" });
    }

    return json({ error: "Administration is not enabled" }, 403);
  },
};

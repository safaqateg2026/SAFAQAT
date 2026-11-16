const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json({
        service: "safaqat-drive-connector",
        status: "ok",
      });
    }

    if (url.pathname === "/oauth/callback") {
      return json(
        { error: "OAuth callback is not enabled yet" },
        503
      );
    }

    return json({ error: "Not found" }, 404);
  },
};

// Google OAuth token refresh.
// Credentials are read from Cloudflare Secrets only.
export async function refreshGoogleAccessToken(env) {
  const required = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REFRESH_TOKEN",
  ];

  for (const name of required) {
    if (!env[name]) {
      throw new Error(`Missing configuration: ${name}`);
    }
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${response.status}`);
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error("Google did not return an access token");
  }

  return data.access_token;
}

// List catalog files from the authorized Google Drive folder.
export async function listCatalogFiles(env) {
  if (!env.GOOGLE_DRIVE_FOLDER_ID) {
    throw new Error("Missing Google Drive folder ID");
  }

  const token = await refreshGoogleAccessToken(env);

  const params = new URLSearchParams({
    q: `'${env.GOOGLE_DRIVE_FOLDER_ID.replace(/'/g, "\\'")}' in parents and trashed = false`,
    fields: "nextPageToken,files(id,name,mimeType,size)",
    page_size: "100",
  });

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Google Drive request failed: ${response.status}`);
  }

  return response.json();
}

// Upload a product image to the authorized catalog folder.
// This function is internal and is not exposed as a public endpoint.
export async function uploadCatalogImage(env, imageBytes, fileName, mimeType) {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

  if (!allowedTypes.includes(mimeType)) {
    throw new Error("Unsupported image type");
  }

  if (!imageBytes || imageBytes.byteLength > 5 * 1024 * 1024) {
    throw new Error("Image must be between 1 byte and 5 MB");
  }

  if (!env.GOOGLE_DRIVE_FOLDER_ID) {
    throw new Error("Missing Google Drive folder ID");
  }

  const token = await refreshGoogleAccessToken(env);

  const metadata = {
    name: fileName.replace(/[^a-zA-Z0-9._-]/g, "_"),
    mimeType,
    parents: [env.GOOGLE_DRIVE_FOLDER_ID],
  };

  const boundary = "safaqat_upload_boundary";
  const encoder = new TextEncoder();

  const body = new Blob([
    encoder.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) +
      `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
    ),
    imageBytes,
    encoder.encode(`\r\n--${boundary}--`),
  ]);

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!response.ok) {
    throw new Error(`Google Drive upload failed: ${response.status}`);
  }

  return response.json();
}

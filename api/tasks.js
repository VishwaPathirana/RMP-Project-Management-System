export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Disable caching completely for real-time consistency
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const DB_URL = "https://extendsclass.com/api/json-storage/bin/fbbbcbf";

  if (req.method === 'GET') {
    try {
      const dbRes = await fetch(DB_URL);
      if (!dbRes.ok) {
        return res.status(dbRes.status).json({ error: "Failed to read database" });
      }
      const data = await dbRes.json();
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    try {
      const body = req.body;
      let jsonPayload;
      if (typeof body === 'string') {
        try {
          jsonPayload = JSON.parse(body);
        } catch (e) {
          return res.status(400).json({ error: "Invalid JSON payload" });
        }
      } else {
        jsonPayload = body;
      }

      if (!Array.isArray(jsonPayload)) {
        return res.status(400).json({ error: "Payload must be a JSON array" });
      }

      const dbRes = await fetch(DB_URL, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(jsonPayload)
      });
      if (!dbRes.ok) {
        return res.status(dbRes.status).json({ error: "Failed to update database" });
      }
      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

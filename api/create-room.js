export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { roomName } = req.body;

  if (!roomName) {
    return res.status(400).json({ error: 'roomName is required' });
  }

  const DAILY_API_KEY = process.env.DAILY_API_KEY;
  const headers = { Authorization: `Bearer ${DAILY_API_KEY}` };
  const roomProps = {
    enable_chat: true,
    enable_screenshare: true,
    start_video_off: true,
    start_audio_off: true,
    enable_knocking: false,
    enable_prejoin_ui: false,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8, // 8 hour expiry
  };

  try {
    // 1. Check if room already exists
    const getRes = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, { headers });

    if (getRes.ok) {
      // Room exists — update its properties in place (PATCH)
      const patchRes = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: roomProps }),
      });

      if (patchRes.ok) {
        const patched = await patchRes.json();
        return res.status(200).json({ url: patched.url });
      }

      // PATCH failed — fall through to delete + recreate
      await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
        method: 'DELETE',
        headers,
      });
    }

    // 2. Room doesn't exist (404) or was just deleted — create fresh
    const createRes = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: roomName,
        properties: roomProps,
      }),
    });

    const data = await createRes.json();

    if (createRes.ok && data.url) {
      return res.status(200).json({ url: data.url });
    }

    console.error('[Daily create error]', data);
    return res.status(500).json({ error: data.info || data.error || 'Failed to create room' });

  } catch (err) {
    console.error('[create-room]', err);
    return res.status(500).json({ error: 'Server error creating room' });
  }
}
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { roomName } = req.body;

  if (!roomName) {
    return res.status(400).json({ error: 'roomName is required' });
  }

  try {
    // 1. Check if the room already exists
    const getRes = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
      headers: {
        Authorization: `Bearer ${process.env.DAILY_API_KEY}`
      }
    });

    if (getRes.ok) {
      const existing = await getRes.json();
      return res.status(200).json({ url: existing.url });
    }

    // 2. Room doesn't exist (404) — create it
    if (getRes.status === 404) {
      const createRes = await fetch('https://api.daily.co/v1/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.DAILY_API_KEY}`
        },
        body: JSON.stringify({
          name: roomName,
          properties: {
            enable_chat: true,
            enable_screenshare: true,
            start_video_off: true,
            start_audio_off: true,
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8 // 8 hour expiry
          }
        })
      });

      const data = await createRes.json();

      if (createRes.ok && data.url) {
        return res.status(200).json({ url: data.url });
      }

      console.error('[Daily create error]', data);
      return res.status(500).json({ error: data.info || data.error || 'Failed to create room' });
    }

    // Some other unexpected error checking room existence
    const errData = await getRes.json().catch(() => ({}));
    console.error('[Daily lookup error]', errData);
    return res.status(500).json({ error: errData.info || errData.error || 'Failed to check room' });

  } catch (err) {
    console.error('[create-room]', err);
    return res.status(500).json({ error: 'Server error creating room' });
  }
}
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { roomName } = req.body;

  if (!roomName) {
    return res.status(400).json({ error: 'roomName is required' });
  }

  try {
    const dailyRes = await fetch('https://api.daily.co/v1/rooms', {
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
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8, // 8 hour expiry
          // max_participants: 10
        }
      })
    });

    const data = await dailyRes.json();

    // Room created successfully
    if (dailyRes.ok && data.url) {
      return res.status(200).json({ url: data.url });
    }

    // Room already exists — that's fine, just build the URL
    if (data.error && data.error.includes('already exists')) {
      return res.status(200).json({
        url: `https://${process.env.DAILY_DOMAIN}.daily.co/${roomName}`
      });
    }

    // Something else went wrong
    console.error('[Daily API error]', data);
    return res.status(500).json({ error: data.info || data.error || 'Failed to create room' });

  } catch (err) {
    console.error('[create-room]', err);
    return res.status(500).json({ error: 'Server error creating room' });
  }
}
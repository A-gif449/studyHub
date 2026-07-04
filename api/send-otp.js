// /api/send-otp.js
// Calls Resend server-side so the API key never hits the browser
// and CORS is not an issue.

//send-otp.js//
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, name, fileName, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'email and otp are required' });
  }

  const html = `
    <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;
                background:#0D1117;color:#E6EDF3;border-radius:12px;
                overflow:hidden;border:1px solid #30363D">
      <div style="padding:24px 28px;background:#161B22;border-bottom:1px solid #30363D">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:8px;background:#21262D;
                      border:1px solid #30363D;display:flex;align-items:center;
                      justify-content:center;font-size:15px">⚛️</div>
          <span style="font-size:16px;font-weight:700;color:#E6EDF3">StudyHub</span>
        </div>
      </div>
      <div style="padding:28px">
        <h2 style="font-size:20px;font-weight:700;margin:0 0 8px;color:#E6EDF3">
          Your download code
        </h2>
        <p style="font-size:13.5px;color:#8B949E;margin:0 0 24px;line-height:1.6">
          Hi <strong style="color:#E6EDF3">${name || 'there'}</strong>,
          here is your verification code to download
          <strong style="color:#58A6FF">${fileName || 'your file'}</strong>:
        </p>
        <div style="background:#0D1117;border:1px solid #30363D;border-radius:10px;
                    padding:20px;text-align:center;margin-bottom:24px">
          <div style="font-family:monospace;font-size:36px;font-weight:700;
                      letter-spacing:10px;color:#58A6FF">${otp}</div>
          <div style="font-size:12px;color:#484F58;margin-top:8px">
            Expires in 5 minutes · Do not share this code
          </div>
        </div>
        <p style="font-size:12px;color:#484F58;line-height:1.65;margin:0">
          After entering this code, your request will be sent to the admin for approval.
          You'll be notified once the download is approved.
          If you didn't request this, ignore this email.
        </p>
      </div>
      <div style="padding:16px 28px;background:#161B22;border-top:1px solid #30363D;
                  font-size:11.5px;color:#484F58;text-align:center">
        StudyHub · Secure download verification
      </div>
    </div>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: [email],
        subject: `${otp} is your StudyHub download code`,
        html,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('[send-otp] Resend error:', err);
      return res.status(500).json({ error: err.message || 'Failed to send email' });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('[send-otp] fetch error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, name, fileName, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: 'Missing fields' });

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: `"StudyHub" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `${otp} is your StudyHub download code`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0D1117;
                    color:#E6EDF3;border-radius:12px;padding:28px;border:1px solid #30363D">
          <h2 style="color:#E6EDF3;margin:0 0 12px">Your download code</h2>
          <p style="color:#8B949E;margin:0 0 20px">
            Hi <strong style="color:#E6EDF3">${name || 'there'}</strong>,
            here is your code to download
            <strong style="color:#58A6FF">${fileName || 'your file'}</strong>:
          </p>
          <div style="background:#161B22;border:1px solid #30363D;border-radius:10px;
                      padding:24px;text-align:center;margin-bottom:20px">
            <div style="font-family:monospace;font-size:40px;font-weight:700;
                        letter-spacing:12px;color:#58A6FF">${otp}</div>
            <div style="font-size:12px;color:#484F58;margin-top:8px">
              Expires in 5 minutes · Do not share
            </div>
          </div>
          <p style="font-size:12px;color:#484F58">
            If you didn't request this, ignore this email.
          </p>
        </div>`,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[send-otp]', err);
    return res.status(500).json({ error: err.message });
  }
}
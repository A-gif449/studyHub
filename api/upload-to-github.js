export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { fileName, base64Content, commitMessage } = req.body;
  if (!fileName || !base64Content) {
    return res.status(400).json({ error: 'Missing fileName or base64Content' });
  }

  const owner  = 'A-gif449';
  const repo   = 'studyhub-files';
  const branch = 'main';
  const path   = `uploads/${Date.now()}_${fileName}`;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${process.env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: commitMessage || `Upload ${fileName}`,
          content: base64Content,
          branch
        })
      }
    );

    const data = await response.json();
    if (!response.ok) {
      return res.status(400).json({ error: data.message || 'GitHub upload failed' });
    }

    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
    return res.status(200).json({ url: rawUrl });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
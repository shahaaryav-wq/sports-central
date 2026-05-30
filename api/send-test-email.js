export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const { email, team, nextGame, nextGameTime, record, source } = request.body || {};

  if (!email || !team) {
    return response.status(400).json({ error: 'Missing email or team' });
  }

  if (!process.env.RESEND_API_KEY) {
    return response.status(500).json({ error: 'Missing RESEND_API_KEY' });
  }

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Sports Central <onboarding@resend.dev>',
      to: email,
      subject: `${team} game alert`,
      text: `Game alert for ${team}

Season record: ${record || 'Unavailable'}
Next game: ${nextGame || 'Unavailable'}${nextGameTime ? `, ${nextGameTime}` : ''}
Source: ${source || 'Sports Central'}

This is a Sports Central test alert.`
    })
  });

  const data = await resendResponse.json();

  if (!resendResponse.ok) {
    return response.status(500).json(data);
  }

  return response.status(200).json({ ok: true, data });
}

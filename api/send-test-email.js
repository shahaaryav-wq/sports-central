import { json, sendGmail } from './_shared.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return json(response, 405, { error: 'Method not allowed' });
  }

  const { email, team, nextGame, nextGameTime, record, source } = request.body || {};

  if (!email || !team) {
    return json(response, 400, { error: 'Missing email or team' });
  }

  try {
    const data = await sendGmail({
      to: email,
      subject: `${team} game alert`,
      text: `Game alert for ${team}

Season record: ${record || 'Unavailable'}
Next game: ${nextGame || 'Unavailable'}${nextGameTime ? `, ${nextGameTime}` : ''}
Source: ${source || 'Sports Central'}

This is a Sports Central test alert.`
    });
    return json(response, 200, { ok: true, data });
  } catch (error) {
    return json(response, 500, { error: error.message });
  }
}

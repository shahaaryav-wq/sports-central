import { json, supabaseFetch } from './_shared.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return json(response, 405, { error: 'Method not allowed' });
  }

  const { email, league, team, preferences = {} } = request.body || {};

  if (!email || !league || !team) {
    return json(response, 400, { error: 'Missing email, league, or team' });
  }

  try {
    const rows = await supabaseFetch(`follows?email=eq.${encodeURIComponent(email)}&league=eq.${encodeURIComponent(league)}&team=eq.${encodeURIComponent(team)}`, {
      method: 'PATCH',
      headers: {
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        final_score_emails: preferences.finalScore !== false,
        reminder_emails: Boolean(preferences.reminders),
        test_emails: preferences.testEmails !== false
      })
    });
    return json(response, 200, { ok: true, follow: rows?.[0] || null });
  } catch (error) {
    return json(response, 500, { error: error.message });
  }
}

import { json, supabaseFetch } from './_shared.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return json(response, 405, { error: 'Method not allowed' });
  }

  const { email, league, team } = request.body || {};

  if (!email || !league || !team) {
    return json(response, 400, { error: 'Missing email, league, or team' });
  }

  try {
    await supabaseFetch(`follows?email=eq.${encodeURIComponent(email)}&league=eq.${encodeURIComponent(league)}&team=eq.${encodeURIComponent(team)}`, {
      method: 'DELETE',
      headers: {
        Prefer: 'return=minimal'
      }
    });
    return json(response, 200, { ok: true });
  } catch (error) {
    return json(response, 500, { error: error.message });
  }
}

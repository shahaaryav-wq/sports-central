import { json, mlbTeamIds, supabaseFetch } from './_shared.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return json(response, 405, { error: 'Method not allowed' });
  }

  const { email, league, leagueName, team } = request.body || {};

  if (!email || !league || !team) {
    return json(response, 400, { error: 'Missing email, league, or team' });
  }

  if (league !== 'mlb') {
    return json(response, 400, { error: 'Automatic emails are currently available for MLB teams only' });
  }

  const teamId = mlbTeamIds[team];
  if (!teamId) {
    return json(response, 400, { error: 'Unknown MLB team' });
  }

  try {
    const rows = await supabaseFetch('follows?on_conflict=email,league,team', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify({
        email,
        league,
        league_name: leagueName || 'MLB',
        team,
        team_id: teamId
      })
    });

    return json(response, 200, { ok: true, follow: rows?.[0] || null });
  } catch (error) {
    return json(response, 500, { error: error.message });
  }
}

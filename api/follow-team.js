import { findEspnTeamId, json, leagueConfigs, mlbTeamIds, supabaseFetch } from './_shared.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return json(response, 405, { error: 'Method not allowed' });
  }

  const { email, league, leagueName, team } = request.body || {};

  if (!email || !league || !team) {
    return json(response, 400, { error: 'Missing email, league, or team' });
  }

  const config = leagueConfigs[league];
  if (!config) {
    return json(response, 400, { error: 'Automatic emails are not available for that league yet' });
  }

  const teamId = config.provider === 'mlb'
    ? mlbTeamIds[team]
    : await findEspnTeamId(config, team);

  if (!teamId) {
    return json(response, 400, { error: `Unknown ${config.name} team` });
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
        league_name: leagueName || config.name,
        team,
        team_id: teamId
      })
    });

    return json(response, 200, { ok: true, follow: rows?.[0] || null });
  } catch (error) {
    return json(response, 500, { error: error.message });
  }
}

import { json, sendGmail, supabaseFetch } from './_shared.js';

function dateString(date) {
  return date.toISOString().slice(0, 10);
}

function formatFinalScore(game, teamId) {
  const away = game.teams.away;
  const home = game.teams.home;
  const team = away.team.id === teamId ? away : home;
  const opponent = away.team.id === teamId ? home : away;
  const result = team.score > opponent.score ? 'won' : team.score < opponent.score ? 'lost' : 'tied';
  const location = home.team.id === teamId ? 'vs' : 'at';

  return {
    result,
    opponent: opponent.team.name,
    matchup: `${location} ${opponent.team.name}`,
    score: `${team.team.name} ${team.score}, ${opponent.team.name} ${opponent.score}`,
    status: game.status?.detailedState || 'Final',
    gamePk: game.gamePk
  };
}

function shouldSendRecap(game, follow) {
  const gameStartedAt = new Date(game.gameDate).getTime();
  const followedAt = new Date(follow.created_at).getTime();
  const ageMs = Date.now() - gameStartedAt;
  const twelveHoursMs = 12 * 60 * 60 * 1000;

  return followedAt <= gameStartedAt && ageMs <= twelveHoursMs;
}

export default async function handler(request, response) {
  if (process.env.CRON_SECRET && request.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return json(response, 401, { error: 'Unauthorized' });
  }

  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 2);
  const scheduleUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=2026&gameType=R&startDate=${dateString(start)}&endDate=${dateString(today)}&hydrate=team,linescore`;

  try {
    const follows = await supabaseFetch('follows?league=eq.mlb&select=email,team,team_id,created_at');
    const scheduleResponse = await fetch(scheduleUrl);
    const schedule = await scheduleResponse.json();

    if (!scheduleResponse.ok) {
      throw new Error('MLB schedule request failed');
    }

    let sent = 0;
    let skipped = 0;

    for (const follow of follows || []) {
      const finalGames = [];

      schedule.dates?.forEach((date) => {
        date.games?.forEach((game) => {
          const status = game.status?.detailedState || '';
          const finished = status === 'Final' || status === 'Game Over' || status.includes('Completed');
          const involved = game.teams.away.team.id === follow.team_id || game.teams.home.team.id === follow.team_id;

          if (finished && involved && shouldSendRecap(game, follow)) {
            finalGames.push(game);
          }
        });
      });

      for (const game of finalGames) {
        const existing = await supabaseFetch(`sent_game_alerts?email=eq.${encodeURIComponent(follow.email)}&team=eq.${encodeURIComponent(follow.team)}&game_pk=eq.${game.gamePk}&select=id`);
        if (existing?.length) {
          skipped += 1;
          continue;
        }

        const recap = formatFinalScore(game, follow.team_id);
        await sendGmail({
          to: follow.email,
          subject: `${follow.team} final: ${recap.score}`,
          text: `${follow.team} ${recap.result}.

Final score: ${recap.score}
Game: ${recap.matchup}
Status: ${recap.status}

Sports Central automatic final-score recap.`
        });

        await supabaseFetch('sent_game_alerts', {
          method: 'POST',
          body: JSON.stringify({
            email: follow.email,
            team: follow.team,
            game_pk: game.gamePk
          })
        });
        sent += 1;
      }
    }

    return json(response, 200, { ok: true, sent, skipped });
  } catch (error) {
    return json(response, 500, { error: error.message });
  }
}

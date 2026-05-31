import {
  dateStringCompact,
  fetchEspnScoreboard,
  json,
  leagueConfigs,
  namesMatch,
  sendGmail,
  supabaseFetch
} from './_shared.js';

function dateString(date) {
  return date.toISOString().slice(0, 10);
}

function formatMlbFinalScore(game, teamId) {
  const away = game.teams.away;
  const home = game.teams.home;
  const team = away.team.id === teamId ? away : home;
  const opponent = away.team.id === teamId ? home : away;
  const result = team.score > opponent.score ? 'won' : team.score < opponent.score ? 'lost' : 'tied';
  const location = home.team.id === teamId ? 'vs' : 'at';

  return {
    result,
    matchup: `${location} ${opponent.team.name}`,
    score: `${team.team.name} ${team.score}, ${opponent.team.name} ${opponent.score}`,
    status: game.status?.detailedState || 'Final',
    gamePk: game.gamePk,
    gameDate: game.gameDate
  };
}

function formatEspnFinalScore(event, follow) {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors || [];
  const team = competitors.find((competitor) => {
    return Number(competitor.team?.id) === Number(follow.team_id)
      || namesMatch(competitor.team?.displayName, follow.team);
  });
  const opponent = competitors.find((competitor) => competitor !== team);

  if (!team || !opponent) {
    return null;
  }

  const teamScore = Number(team.score || 0);
  const opponentScore = Number(opponent.score || 0);
  const result = teamScore > opponentScore ? 'won' : teamScore < opponentScore ? 'lost' : 'tied';
  const location = team.homeAway === 'home' ? 'vs' : 'at';

  return {
    result,
    matchup: `${location} ${opponent.team.displayName}`,
    score: `${team.team.displayName} ${teamScore}, ${opponent.team.displayName} ${opponentScore}`,
    status: event.status?.type?.description || competition?.status?.type?.description || 'Final',
    gamePk: Number(event.id),
    gameDate: event.date
  };
}

function shouldSendRecap(gameDate, follow) {
  const gameStartedAt = new Date(gameDate).getTime();
  const followedAt = new Date(follow.created_at).getTime();
  const ageMs = Date.now() - gameStartedAt;
  const thirtySixHoursMs = 36 * 60 * 60 * 1000;

  return followedAt <= gameStartedAt && ageMs <= thirtySixHoursMs;
}

async function fetchMlbRecentFinals() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 2);
  const scheduleUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=2026&gameType=R&startDate=${dateString(start)}&endDate=${dateString(today)}&hydrate=team,linescore`;
  const scheduleResponse = await fetch(scheduleUrl);
  const schedule = await scheduleResponse.json();

  if (!scheduleResponse.ok) {
    throw new Error('MLB schedule request failed');
  }

  return (schedule.dates || []).flatMap((date) => date.games || []);
}

async function fetchEspnRecentFinals(config) {
  const dates = [0, 1, 2].map((daysAgo) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date;
  });
  const eventsById = new Map();

  for (const date of dates) {
    const events = await fetchEspnScoreboard(config, date);
    events.forEach((event) => eventsById.set(event.id, event));
  }

  return [...eventsById.values()];
}

function isMlbFinalForFollow(game, follow) {
  const status = game.status?.detailedState || '';
  const finished = status === 'Final' || status === 'Game Over' || status.includes('Completed');
  const involved = game.teams.away.team.id === follow.team_id || game.teams.home.team.id === follow.team_id;

  return finished && involved && shouldSendRecap(game.gameDate, follow);
}

function isEspnFinalForFollow(event, follow) {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors || [];
  const completed = event.status?.type?.completed || competition?.status?.type?.completed;
  const involved = competitors.some((competitor) => {
    return Number(competitor.team?.id) === Number(follow.team_id)
      || namesMatch(competitor.team?.displayName, follow.team);
  });

  return completed && involved && shouldSendRecap(event.date, follow);
}

async function alreadySent(follow, gamePk) {
  const existing = await supabaseFetch(`sent_game_alerts?email=eq.${encodeURIComponent(follow.email)}&team=eq.${encodeURIComponent(follow.team)}&game_pk=eq.${gamePk}&select=id`);
  return Boolean(existing?.length);
}

async function recordSent(follow, gamePk) {
  await supabaseFetch('sent_game_alerts', {
    method: 'POST',
    body: JSON.stringify({
      email: follow.email,
      team: follow.team,
      game_pk: gamePk
    })
  });
}

async function sendRecap(follow, recap) {
  await sendGmail({
    to: follow.email,
    subject: `${follow.team} final: ${recap.score}`,
    text: `${follow.team} ${recap.result}.

Final score: ${recap.score}
Game: ${recap.matchup}
Status: ${recap.status}
League: ${follow.league_name || follow.league.toUpperCase()}

Sports Central automatic final-score recap.`
  });
}

export default async function handler(request, response) {
  if (process.env.CRON_SECRET && request.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return json(response, 401, { error: 'Unauthorized' });
  }

  try {
    const follows = await supabaseFetch('follows?select=email,league,league_name,team,team_id,created_at');
    const followsByLeague = (follows || []).reduce((groups, follow) => {
      groups[follow.league] ||= [];
      groups[follow.league].push(follow);
      return groups;
    }, {});

    let sent = 0;
    let skipped = 0;
    const errors = [];

    for (const [league, leagueFollows] of Object.entries(followsByLeague)) {
      const config = leagueConfigs[league];
      if (!config) {
        skipped += leagueFollows.length;
        continue;
      }

      try {
        const games = config.provider === 'mlb'
          ? await fetchMlbRecentFinals()
          : await fetchEspnRecentFinals(config);

        for (const follow of leagueFollows) {
          for (const game of games) {
            const isFinal = config.provider === 'mlb'
              ? isMlbFinalForFollow(game, follow)
              : isEspnFinalForFollow(game, follow);

            if (!isFinal) {
              continue;
            }

            const recap = config.provider === 'mlb'
              ? formatMlbFinalScore(game, follow.team_id)
              : formatEspnFinalScore(game, follow);

            if (!recap || Number.isNaN(recap.gamePk)) {
              skipped += 1;
              continue;
            }

            if (await alreadySent(follow, recap.gamePk)) {
              skipped += 1;
              continue;
            }

            await sendRecap(follow, recap);
            await recordSent(follow, recap.gamePk);
            sent += 1;
          }
        }
      } catch (error) {
        errors.push(`${config.name}: ${error.message}`);
      }
    }

    return json(response, 200, {
      ok: errors.length === 0,
      sent,
      skipped,
      errors
    });
  } catch (error) {
    return json(response, 500, { error: error.message });
  }
}

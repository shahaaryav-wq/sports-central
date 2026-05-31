import { json, supabaseFetch } from './_shared.js';

function requireCronSecret(request, response) {
  const providedSecret = request.headers.authorization?.replace(/^Bearer\s+/i, '') || request.query.secret;
  if (process.env.CRON_SECRET && providedSecret !== process.env.CRON_SECRET) {
    json(response, 401, { error: 'Unauthorized' });
    return false;
  }
  return true;
}

function countBy(rows, key) {
  return [...rows.reduce((counts, row) => {
    const value = row[key] || 'Unknown';
    counts.set(value, (counts.get(value) || 0) + 1);
    return counts;
  }, new Map())]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));
}

function uniqueCount(rows, key) {
  return new Set(rows.map((row) => row[key]).filter(Boolean)).size;
}

function excluded(rows, request) {
  const visitorId = String(request.query.excludeVisitorId || '');
  const email = String(request.query.excludeEmail || '').toLowerCase();

  return rows.filter((row) => {
    if (visitorId && row.visitor_id === visitorId) {
      return false;
    }
    if (email && String(row.email || '').toLowerCase() === email) {
      return false;
    }
    return true;
  });
}

function since(rows, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return rows.filter((row) => new Date(row.created_at).getTime() >= cutoff);
}

async function safeFetch(path) {
  try {
    return await supabaseFetch(path);
  } catch (error) {
    return [];
  }
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    return json(response, 405, { error: 'Method not allowed' });
  }

  if (!requireCronSecret(request, response)) {
    return;
  }

  try {
    const events = excluded(await safeFetch('app_analytics?select=*&order=created_at.desc&limit=10000'), request);
    const follows = excluded(await safeFetch('follows?select=email,league,team,created_at'), request);
    const sentAlerts = excluded(await safeFetch('sent_game_alerts?select=email,team,game_pk,sent_at&order=sent_at.desc&limit=10000'), request);
    const lastDay = since(events, 1);
    const lastWeek = since(events, 7);
    const pageViews = events.filter((row) => row.event_type === 'page_view');

    return json(response, 200, {
      ok: true,
      generatedAt: new Date().toISOString(),
      totals: {
        events: events.length,
        pageViews: pageViews.length,
        uniqueVisitors: uniqueCount(events, 'visitor_id'),
        sessions: uniqueCount(events, 'session_id'),
        eventsToday: lastDay.length,
        eventsLast7Days: lastWeek.length,
        follows: follows.length,
        followedEmails: uniqueCount(follows, 'email'),
        finalScoreEmailsSent: sentAlerts.length
      },
      topPages: countBy(pageViews, 'page'),
      topLeagues: countBy(events.filter((row) => row.league), 'league'),
      topTeams: countBy(events.filter((row) => row.team), 'team'),
      eventTypes: countBy(events, 'event_type'),
      recentEvents: events.slice(0, 12).map((row) => ({
        eventType: row.event_type,
        page: row.page,
        league: row.league,
        team: row.team,
        createdAt: row.created_at
      }))
    });
  } catch (error) {
    return json(response, 500, { error: error.message });
  }
}

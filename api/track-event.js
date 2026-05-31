import { json, supabaseFetch } from './_shared.js';

const allowedEvents = new Set([
  'page_view',
  'league_open',
  'team_open',
  'follow_saved',
  'test_email_sent',
  'recap_run_clicked'
]);

function cleanText(value, maxLength = 160) {
  return String(value || '').slice(0, maxLength);
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return json(response, 405, { error: 'Method not allowed' });
  }

  const {
    eventType = 'page_view',
    league = '',
    page = '',
    referrer = '',
    sessionId = '',
    team = '',
    visitorId = ''
  } = request.body || {};

  if (!allowedEvents.has(eventType)) {
    return json(response, 400, { error: 'Unknown analytics event' });
  }

  try {
    await supabaseFetch('app_analytics', {
      method: 'POST',
      headers: {
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        event_type: eventType,
        visitor_id: cleanText(visitorId, 80),
        session_id: cleanText(sessionId, 80),
        page: cleanText(page, 220),
        league: cleanText(league, 40),
        team: cleanText(team, 120),
        referrer: cleanText(referrer, 220),
        user_agent: cleanText(request.headers['user-agent'], 300)
      })
    });

    return json(response, 200, { ok: true });
  } catch (error) {
    return json(response, 200, { ok: false, warning: error.message });
  }
}

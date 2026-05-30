export const mlbTeamIds = {
  'Arizona Diamondbacks': 109,
  Athletics: 133,
  'Atlanta Braves': 144,
  'Baltimore Orioles': 110,
  'Boston Red Sox': 111,
  'Chicago Cubs': 112,
  'Chicago White Sox': 145,
  'Cincinnati Reds': 113,
  'Cleveland Guardians': 114,
  'Colorado Rockies': 115,
  'Detroit Tigers': 116,
  'Houston Astros': 117,
  'Kansas City Royals': 118,
  'Los Angeles Angels': 108,
  'Los Angeles Dodgers': 119,
  'Miami Marlins': 146,
  'Milwaukee Brewers': 158,
  'Minnesota Twins': 142,
  'New York Mets': 121,
  'New York Yankees': 147,
  'Philadelphia Phillies': 143,
  'Pittsburgh Pirates': 134,
  'San Diego Padres': 135,
  'San Francisco Giants': 137,
  'Seattle Mariners': 136,
  'St. Louis Cardinals': 138,
  'Tampa Bay Rays': 139,
  'Texas Rangers': 140,
  'Toronto Blue Jays': 141,
  'Washington Nationals': 120
};

export function json(response, status, body) {
  response.status(status).json(body);
}

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

export async function supabaseFetch(path, options = {}) {
  const baseUrl = requireEnv('SUPABASE_URL').replace(/\/$/, '');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.message || data?.error || 'Supabase request failed');
  }

  return data;
}

export function base64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function getGmailAccessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: requireEnv('GMAIL_CLIENT_ID'),
      client_secret: requireEnv('GMAIL_CLIENT_SECRET'),
      refresh_token: requireEnv('GMAIL_REFRESH_TOKEN'),
      grant_type: 'refresh_token'
    })
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Gmail token request failed');
  }

  return data.access_token;
}

export async function sendGmail({ to, subject, text }) {
  const from = requireEnv('GMAIL_FROM');
  const accessToken = await getGmailAccessToken();
  const mime = [
    `From: Sports Central <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    text
  ].join('\r\n');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: base64Url(mime) })
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'Gmail send failed');
  }

  return data;
}

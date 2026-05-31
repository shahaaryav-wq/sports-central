import { json, supabaseFetch } from './_shared.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    return json(response, 405, { error: 'Method not allowed' });
  }

  const email = request.query.email;

  if (!email) {
    return json(response, 400, { error: 'Missing email' });
  }

  try {
    const follows = await supabaseFetch(`follows?email=eq.${encodeURIComponent(email)}&select=*&order=created_at.desc`);
    return json(response, 200, { ok: true, follows });
  } catch (error) {
    return json(response, 500, { error: error.message });
  }
}

const KIT = 'https://api.convertkit.com/v3';

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  const { firstName, lastName, email, instagram, business, aiProblem, investment } = body;

  if (!email || !firstName) {
    return { statusCode: 400, body: JSON.stringify({ error: 'First name and email are required' }) };
  }

  const secret = process.env.KIT_API_SECRET;
  if (!secret) {
    console.error('KIT_API_SECRET not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  try {
    // 1. Create / update subscriber
    const subRes = await fetch(`${KIT}/subscribers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_secret: secret,
        email,
        first_name: firstName,
        fields: {
          last_name: lastName || '',
          instagram_handle: instagram || '',
          business: business || '',
          ai_problem: aiProblem || '',
          investment: investment || ''
        }
      })
    });

    const subData = await subRes.json();
    if (!subRes.ok) {
      console.error('subscriber error:', subData);
      throw new Error(subData.message || 'Failed to create subscriber');
    }

    // 2. Find or create the 'caio-applicant' tag
    const tagsRes = await fetch(`${KIT}/tags?api_secret=${encodeURIComponent(secret)}`);
    const tagsData = await tagsRes.json();
    let tag = (tagsData.tags || []).find(t => t.name === 'caio-applicant');

    if (!tag) {
      const createRes = await fetch(`${KIT}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_secret: secret, tag: { name: 'caio-applicant' } })
      });
      const createData = await createRes.json();
      tag = createData.tag;
    }

    // 3. Apply tag to subscriber
    if (tag?.id) {
      await fetch(`${KIT}/tags/${tag.id}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_secret: secret, email })
      });
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error('apply function error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Submission failed. Please try again.' }) };
  }
};

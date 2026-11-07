const SB = 'https://medaaoiunclooqmmjrzq.supabase.co';
const KEY = 'sb_publishable_Agv4PmjAqyrFtwYyCJTFbA_iY4ElXwv';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('Norie bot is running');
  try {
    await fetch(SB + '/rest/v1/rpc/tg_webhook', {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_hook: req.headers['x-telegram-bot-api-secret-token'] || '', p_update: req.body || {} })
    });
  } catch (e) {}
  res.status(200).send('ok');
};

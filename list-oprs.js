const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' });

  const appScriptUrl = process.env.APPS_SCRIPT_URL;
  const sharedToken = process.env.APPS_SCRIPT_SHARED_TOKEN;
  if (!appScriptUrl || !sharedToken) {
    return json(503, { error: 'Arkib belum disediakan dalam Netlify.' });
  }

  try {
    const response = await fetch(appScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list', token: sharedToken })
    });
    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (_) {
      throw new Error('Google Apps Script returned a non-JSON page. Check its deployed /exec URL and access.');
    }
    if (!response.ok || !result.ok) throw new Error(result.error || 'Could not retrieve OPR records.');

    const records = (result.records || []).map(record => ({
      id: String(record.id || record.driveFileId || ''),
      nama_warden: record.nama_warden || '',
      tarikh: record.tarikh || ''
    })).filter(record => record.id && record.tarikh);

    return json(200, { records });
  } catch (error) {
    console.error(error);
    return json(500, { error: error.message || 'Tidak dapat memuatkan arkib OPR.' });
  }
};

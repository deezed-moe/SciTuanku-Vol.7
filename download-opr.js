const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' });

  const fileId = String(event.queryStringParameters?.recordId || '');
  if (!/^[A-Za-z0-9_-]+$/.test(fileId)) return json(400, { error: 'Invalid Drive file ID.' });

  const appScriptUrl = process.env.APPS_SCRIPT_URL;
  const sharedToken = process.env.APPS_SCRIPT_SHARED_TOKEN;
  if (!appScriptUrl || !sharedToken) return json(503, { error: 'OPR download is not configured.' });

  try {
    const response = await fetch(appScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'download', token: sharedToken, fileId })
    });
    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (_) {
      throw new Error('Google Apps Script returned a non-JSON page. Check its deployed /exec URL and access.');
    }
    if (!response.ok || !result.ok || !result.pdfBase64) {
      throw new Error(result.error || 'Google Drive could not return the PDF.');
    }

    const file = Buffer.from(result.pdfBase64, 'base64');
    if (file.length > 4_400_000 || file.subarray(0, 5).toString() !== '%PDF-') {
      throw new Error('The OPR file is invalid or too large.');
    }

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="OPR-' + fileId + '.pdf"',
        'Cache-Control': 'no-store'
      },
      body: file.toString('base64')
    };
  } catch (error) {
    console.error(error);
    return json(500, { error: error.message || 'OPR download failed.' });
  }
};

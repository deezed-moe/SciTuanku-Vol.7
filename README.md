# OPR Generator — Google Sheets + Drive

This package is intentionally flat for GitHub's web upload workflow. Upload every file in this package to the repository root. The included Netlify build command then creates the `public` site folder and `netlify/functions` folder automatically.

## Netlify settings

- Base directory: blank (repository root)
- Build command and publish directory: set by the included `netlify.toml`
- Functions directory: set by the included `netlify.toml`
- Functions environment variables: `APPS_SCRIPT_URL` (Apps Script web app `/exec` URL) and `APPS_SCRIPT_SHARED_TOKEN` (same value as Apps Script `SHARED_TOKEN`)

Deploy from the GitHub repository connected to your Netlify site. Do not upload the ZIP itself as the website; extract it and upload the files inside.

## Apps Script

`Code.gs` is the Apps Script backend source. Paste it into the Google Apps Script project and deploy a new web app version if the backend code needs updating.

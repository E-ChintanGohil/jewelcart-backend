// Uploads a file to the cPanel frontend host via UAPI (HTTPS, port 2083) — the
// same method jewelcart-frontend/scripts/deploy-prod.py uses. Used to push the
// freshly-built sitemap.xml onto www.jewelcart.shop's /public_html.
//
// Credentials come from env (set only in the prod backend .env, so staging and
// local never write to the live docroot):
//   CPANEL_HOST, CPANEL_USER, CPANEL_PASS, CPANEL_PORT (default 2083)

import https from 'node:https';

function cpanelConfig() {
  const host = process.env.CPANEL_HOST;
  const user = process.env.CPANEL_USER;
  const pass = process.env.CPANEL_PASS;
  const port = parseInt(process.env.CPANEL_PORT || '2083', 10);
  return { host, user, pass, port, configured: Boolean(host && user && pass) };
}

export function isUploaderConfigured() {
  return cpanelConfig().configured;
}

// Upload a single file (given its content as a string/Buffer) into remoteDir.
// Resolves with the parsed UAPI result; rejects on transport/HTTP failure.
export function uploadFile(remoteDir, filename, content) {
  const { host, user, pass, port, configured } = cpanelConfig();
  if (!configured) {
    return Promise.reject(new Error('cPanel credentials not configured (CPANEL_HOST/USER/PASS)'));
  }

  const boundary = '----JCUploadBoundary' + Date.now();
  const pre =
    `--${boundary}\r\n` +
    'Content-Disposition: form-data; name="dir"\r\n\r\n' +
    `${remoteDir}\r\n` +
    `--${boundary}\r\n` +
    'Content-Disposition: form-data; name="overwrite"\r\n\r\n' +
    '1\r\n' +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    'Content-Type: application/octet-stream\r\n\r\n';
  const post = `\r\n--${boundary}--\r\n`;

  const body = Buffer.concat([
    Buffer.from(pre, 'utf8'),
    Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'),
    Buffer.from(post, 'utf8'),
  ]);

  const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

  const options = {
    host,
    port,
    method: 'POST',
    path: '/execute/Fileman/upload_files',
    headers: {
      Authorization: auth,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
    },
    // cPanel hosts often present a self-signed/hostname-mismatched cert on 2083.
    rejectUnauthorized: false,
    timeout: 60000,
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          return reject(new Error(`Unexpected upload response (${res.statusCode}): ${data.slice(0, 200)}`));
        }
        if (parsed.status === 1) resolve(parsed);
        else reject(new Error(`Upload rejected by cPanel: ${JSON.stringify(parsed.errors || parsed)}`));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('cPanel upload timed out')));
    req.write(body);
    req.end();
  });
}

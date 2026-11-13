// Låtsas-APNs för lokala tester av notiserna (tools/pott-test.js). cap-push skickar hit i stället för till Apple när
// den körs med --var APNS_HOST:http://127.0.0.1:8791. GET /logg ger alla notiser som kommit, DELETE /logg tömmer.
//   node tools/apns-mock.js [port]
const http = require('http');
const port = Number(process.argv[2] || 8791);
let logg = [];
http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    if (req.url === '/logg') {
      if (req.method === 'DELETE') logg = [];
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(logg));
    }
    const m = /^\/3\/device\/([0-9a-f]+)$/.exec(req.url || '');
    if (m && req.method === 'POST') {
      let data = {};
      try { data = JSON.parse(body); } catch { /* ok */ }
      logg.push({ token: m[1], title: data.aps?.alert?.title || '', text: data.aps?.alert?.body || '', hash: data.hash || '', t: Date.now() });
      res.writeHead(200);
      return res.end();
    }
    res.writeHead(404); res.end();
  });
}).listen(port, '127.0.0.1', () => console.log(`apns-mock på ${port}`));

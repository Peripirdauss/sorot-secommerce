// Simple local server for testing
const http = require('http');
const fs = require('fs');
const path = require('path');
const apiHandler = require('./api');

// Create a local server
const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

  if (req.url.startsWith('/api')) {
    // Provide Express/Vercel helper compatibility for native Node http response
    if (!res.status) {
      res.status = function(code) {
        this.statusCode = code;
        return this;
      };
    }
    if (!res.json) {
      res.json = function(data) {
        this.setHeader('Content-Type', 'application/json');
        this.end(JSON.stringify(data));
        return this;
      };
    }

    // Accumulate stream chunks into req.body if payload is present
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      let bodyData = '';
      req.on('data', chunk => {
        bodyData += chunk;
      });
      req.on('end', () => {
        try {
          req.body = bodyData ? JSON.parse(bodyData) : {};
        } catch (e) {
          req.body = bodyData;
        }
        apiHandler(req, res);
      });
    } else {
      apiHandler(req, res);
    }
  } else {
    // Serve static files from public directory
    const cleanUrl = req.url.split('?')[0];
    const filePath = path.join(__dirname, 'public', cleanUrl === '/' ? 'index.html' : cleanUrl);
    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end('File not found');
        return;
      }

      // Set content type based on file extension
      const ext = path.extname(filePath);
      let contentType = 'text/html';

      if (ext === '.js') contentType = 'text/javascript';
      if (ext === '.css') contentType = 'text/css';
      if (ext === '.svg') contentType = 'image/svg+xml';
      if (ext === '.json') contentType = 'application/json';

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

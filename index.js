// Simple local server for testing
const http = require('http');
const fs = require('fs');
const path = require('path');
const apiHandler = require('./api');

// Create a local server
const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);
  
  if (req.url.startsWith('/api')) {
    // Handle API requests
    apiHandler(req, res);
  } else {
    // Serve static files from public directory
    const filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
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
      
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 
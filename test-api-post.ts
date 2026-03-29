import http from 'http';

const data = JSON.stringify({
  name: 'Test Product',
  price: 100,
  stock: 10
});

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/inventory',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, (res) => {
  let resData = '';
  res.on('data', chunk => resData += chunk);
  res.on('end', () => console.log(res.statusCode, resData));
});

req.write(data);
req.end();

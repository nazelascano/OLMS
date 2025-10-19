const express = require('express');
const app = express();
const PORT = 5001;

console.log('Starting diagnostic server...');

app.use(express.json());

app.get('/', (req, res) => {
    console.log('GET / request received');
    res.json({ message: 'Diagnostic server working!' });
});

app.post('/test', (req, res) => {
    console.log('POST /test request received:', req.body);
    res.json({ received: req.body });
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Diagnostic server listening on ALL interfaces at port ${PORT}`);
    console.log(`Test at: http://localhost:${PORT}`);
});

server.on('error', (err) => {
    console.error('❌ Server error:', err);
});

// Keep the process alive
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully');
    server.close();
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully');
    server.close();
});

console.log('Server setup complete');
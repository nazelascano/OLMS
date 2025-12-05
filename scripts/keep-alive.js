#!/usr/bin/env node
const http = require('http');
const https = require('https');
const { URL } = require('url');

const DEFAULT_BASE = 'https://olms-backend.onrender.com';
const RAW_TARGET =
  process.env.KEEP_ALIVE_URL ||
  process.env.RENDER_BACKEND_URL ||
  process.env.REACT_APP_API_URL ||
  `${DEFAULT_BASE}/api`;

const resolveTargetUrl = (value) => {
  if (!value) {
    return `${DEFAULT_BASE}/health`;
  }

  let trimmed = String(value).trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(
      `Invalid KEEP_ALIVE_URL: "${trimmed}". Please provide a full http(s) URL.`,
    );
  }

  // If the url already includes /health, keep it; otherwise append /health.
  if (/\/health(\?|$)/i.test(trimmed)) {
    return trimmed;
  }

  // If pointing at /api, remove that suffix before appending /health.
  trimmed = trimmed.replace(/\/api\/?$/i, '');
  return `${trimmed.replace(/\/$/, '')}/health`;
};

const targetString = resolveTargetUrl(RAW_TARGET);
const targetUrl = new URL(targetString);
const intervalMs = Number(process.env.KEEP_ALIVE_INTERVAL_MS || 5 * 60 * 1000);
const requestTimeoutMs = Number(process.env.KEEP_ALIVE_TIMEOUT_MS || 10000);

const httpModule = targetUrl.protocol === 'https:' ? https : http;

const timestamp = () => new Date().toISOString();

const ping = () => {
  return new Promise((resolve) => {
    const started = Date.now();
    const request = httpModule.request(
      {
        method: 'GET',
        hostname: targetUrl.hostname,
        port: targetUrl.port || undefined,
        path: `${targetUrl.pathname}${targetUrl.search}`,
        timeout: requestTimeoutMs,
      },
      (response) => {
        // Drain the response silently
        response.on('data', () => {});
        response.on('end', () => {
          const duration = Date.now() - started;
          console.log(
            `${timestamp()}\tKEEP-ALIVE\tok\t${response.statusCode}\t${duration}ms`,
          );
          resolve(true);
        });
      },
    );

    request.on('timeout', () => {
      request.destroy(new Error('Request timeout'));
    });

    request.on('error', (error) => {
      const duration = Date.now() - started;
      console.error(
        `${timestamp()}\tKEEP-ALIVE\terror\t${error.message}\t${duration}ms`,
      );
      resolve(false);
    });

    request.end();
  });
};

console.log(
  `${timestamp()}\tKEEP-ALIVE\tstarting\turl=${targetString}\tinterval=${intervalMs}ms`,
);

const intervalId = setInterval(ping, intervalMs);
ping();

const shutdown = () => {
  clearInterval(intervalId);
  console.log(`${timestamp()}\tKEEP-ALIVE\tstopped`);
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

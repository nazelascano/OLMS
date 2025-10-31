const fs = require('fs');
const path = require('path');
let bcrypt;
try {
  // Prefer project backend's bcrypt if available
  bcrypt = require('../backend/node_modules/bcrypt');
} catch (e) {
  try {
    bcrypt = require('bcrypt');
  } catch (err) {
    console.error('bcrypt is not available. Install dependencies in backend or root.');
    process.exit(2);
  }
}

(async () => {
  try {
    const dataPath = path.join(__dirname, '../backend/data/users.json');
    const raw = fs.readFileSync(dataPath, 'utf8');
    const users = JSON.parse(raw);

    const results = [];

    for (const u of users) {
      const username = u.username || u.lrn || u.email || '(no-username)';
      const role = u.role || '(unknown)';
      const firstName = (u.firstName || '').toString();
      const stored = u.password || '';

      let expectedRaw = null;

      if (String(username).toLowerCase() === 'admin') {
        expectedRaw = 'admin123456';
      } else if (firstName && username) {
        expectedRaw = `${firstName.charAt(0)}${username}`;
      }

      let matched = false;
      let reason = '';

      const candidates = [];
      if (expectedRaw) candidates.push(expectedRaw);
      // try lowercase first char
      if (firstName) candidates.push(`${firstName.charAt(0).toLowerCase()}${username}`);
      // try using LRN if available
      if (u.lrn) candidates.push(`${firstName.charAt(0)}${u.lrn}`);
      // try username or lrn alone
      if (username) candidates.push(username);
      if (u.lrn) candidates.push(u.lrn);

      // unique candidates
      const uniq = Array.from(new Set(candidates.filter(Boolean)));

      if (!stored) {
        reason = 'no stored password';
      } else if (uniq.length === 0) {
        reason = 'no expected password rule';
      } else {
        // Try bcrypt compare if hashed
        if (/^\$2[aby]\$/.test(stored)) {
          for (const c of uniq) {
            // eslint-disable-next-line no-await-in-loop
            const ok = await bcrypt.compare(c, stored);
            if (ok) {
              matched = true;
              reason = `bcrypt match (candidate: ${c})`;
              break;
            }
          }
          if (!matched) reason = 'bcrypt mismatch (no candidate matched)';
        } else {
          // plaintext fallback
          for (const c of uniq) {
            if (c === stored) {
              matched = true;
              reason = `plain match (candidate: ${c})`;
              break;
            }
          }
          if (!matched) reason = 'plain mismatch (no candidate matched)';
        }
      }

      results.push({ username, role, candidates: uniq, matched, reason });
    }

    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    console.error('Error checking passwords:', err);
    process.exit(2);
  }
})();

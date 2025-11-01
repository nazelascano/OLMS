(async () => {
  try {
    const base = 'http://localhost:5001/api';
    // 1) login as admin
    console.log('Logging in as admin...');
    const loginRes = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernameOrEmail: 'admin', password: 'admin123456' })
    });
    const loginJson = await loginRes.json();
    if (!loginRes.ok) {
      console.error('Admin login failed:', loginJson);
      process.exit(1);
    }
    const token = loginJson.token;
    console.log('Admin token obtained');

    // 2) create new student
    const ts = Date.now();
    const lrn = `LRN${ts}`;
    const studentPayload = {
      firstName: 'Test',
      lastName: 'Student',
      studentId: `S${ts}`,
      lrn: lrn,
      grade: 'Grade 7',
      section: 'Test'
    };

    console.log('Creating student with LRN', lrn);
    const createRes = await fetch(`${base}/students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(studentPayload)
    });
    const createJson = await createRes.json();
    if (!createRes.ok) {
      console.error('Create student failed:', createJson);
      process.exit(1);
    }
    console.log('Student created:', createJson.student.username, createJson.student._id);

    // 3) attempt login with default password: first letter of firstName + username
    const username = createJson.student.username;
  // Build expected default password using same rule as server: firstInitial + surname (if present), lowercased
  const firstInitial = (studentPayload.firstName || '').charAt(0) || '';
  const surname = (studentPayload.lastName || '').toString().replace(/\s+/g, '');
  const rawPassword = (surname ? `${firstInitial}${surname}` : `${firstInitial}${username}`).toLowerCase();
    console.log('Attempting login as student', username, 'with password', rawPassword);

    const studentLoginRes = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernameOrEmail: username, password: rawPassword })
    });
    const studentLoginJson = await studentLoginRes.json();
    console.log('Student login status:', studentLoginRes.status);
    console.log('Student login response:', studentLoginJson);

    process.exit(0);
  } catch (err) {
    console.error('Error running test:', err);
    process.exit(2);
  }
})();

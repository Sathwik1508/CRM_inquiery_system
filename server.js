require('dotenv').config();

const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
    })
  : null;

const VALID_USER_TYPES = ['Parent', 'Student', 'School'];
const VALID_CATEGORIES = ['Scholarship', 'Concert', 'Admission', 'General Query'];
const VALID_STATUSES = ['new', 'in-review', 'resolved'];
const memoryStore = { admins: [], inquiries: [] };

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function memoryQuery(text, params = []) {
  const lower = text.toLowerCase();

  if (lower.includes('select * from admins where email')) {
    const email = String(params[0] || '').trim();
    const rows = memoryStore.admins.filter((admin) => admin.email === email);
    return { rows, rowCount: rows.length };
  }

  if (lower.includes('insert into admins')) {
    const record = {
      id: Date.now(),
      email: params[0],
      password_hash: params[1],
      full_name: params[2],
      created_at: new Date().toISOString(),
    };
    memoryStore.admins.push(record);
    return { rows: [record], rowCount: 1 };
  }

  if (lower.includes('insert into inquiries')) {
    const record = {
      id: Date.now(),
      name: params[0],
      email: params[1],
      phone: params[2],
      user_type: params[3],
      category: params[4],
      message: params[5],
      status: 'new',
      created_at: new Date().toISOString(),
    };
    memoryStore.inquiries.push(record);
    return { rows: [record], rowCount: 1 };
  }

  if (lower.includes('select * from inquiries')) {
    let rows = [...memoryStore.inquiries];

    const category = String(params[0] || '').trim();
    const userType = String(params[1] || '').trim();
    const search = String(params[2] || '').trim();

    if (category && category !== 'All') {
      rows = rows.filter((row) => row.category === category);
    }

    if (userType && userType !== 'All') {
      rows = rows.filter((row) => row.user_type === userType);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      rows = rows.filter((row) => row.name.toLowerCase().includes(searchLower) || row.phone.includes(search));
    }

    return { rows: rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)), rowCount: rows.length };
  }

  if (lower.includes('update inquiries set status')) {
    const newStatus = params[0];
    const inquiryId = Number(params[1]);
    const row = memoryStore.inquiries.find((entry) => entry.id === inquiryId);

    if (!row) {
      return { rows: [], rowCount: 0 };
    }

    row.status = newStatus;
    return { rows: [row], rowCount: 1 };
  }

  return { rows: [], rowCount: 0 };
}

async function queryDb(text, params = []) {
  if (!pool) {
    return memoryQuery(text, params);
  }

  return pool.query(text, params);
}

async function initDatabase() {
  if (!pool) {
    console.log('Database is not configured. Starting app in local preview mode.');
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@edtech.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    memoryStore.admins = [{
      id: 1,
      email: adminEmail,
      password_hash: passwordHash,
      full_name: 'System Admin',
      created_at: new Date().toISOString(),
    }];
    return;
  }

  await queryDb(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      email VARCHAR(150) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name VARCHAR(120) NOT NULL DEFAULT 'System Admin',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await queryDb(`
    CREATE TABLE IF NOT EXISTS inquiries (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(150) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('Parent', 'Student', 'School')),
      category VARCHAR(30) NOT NULL CHECK (category IN ('Scholarship', 'Concert', 'Admission', 'General Query')),
      message TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in-review', 'resolved')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await queryDb(`
    CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON inquiries (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_inquiries_user_type ON inquiries (user_type);
    CREATE INDEX IF NOT EXISTS idx_inquiries_category ON inquiries (category);
    CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries (status);
  `);

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@edtech.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
  const existingAdmin = await queryDb('SELECT id FROM admins WHERE email = $1', [adminEmail]);

  if (existingAdmin.rowCount === 0) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await queryDb(
      'INSERT INTO admins (email, password_hash, full_name) VALUES ($1, $2, $3)',
      [adminEmail, passwordHash, 'System Admin']
    );
    console.log(`Seeded admin account: ${adminEmail}`);
  }
}

function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ message: 'Authentication token is missing.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    database: pool ? 'configured' : 'not-configured',
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.post('/api/inquiries', async (req, res) => {
  try {
    const { name, email, phone, userType, category, message } = req.body;

    if (!name || !email || !phone || !userType || !category || !message) {
      return res.status(400).json({ message: 'Please complete all required fields.' });
    }

    if (!VALID_USER_TYPES.includes(userType)) {
      return res.status(400).json({ message: 'Invalid user type.' });
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: 'Invalid inquiry category.' });
    }

    const result = await queryDb(
      `INSERT INTO inquiries (name, email, phone, user_type, category, message, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'new')
       RETURNING *;`,
      [
        String(name).trim(),
        String(email).trim(),
        String(phone).trim(),
        userType,
        category,
        String(message).trim(),
      ]
    );

    res.status(201).json({
      message: 'Inquiry submitted successfully.',
      inquiry: result.rows[0],
    });
  } catch (error) {
    console.error('Inquiry creation error:', error);
    res.status(500).json({ message: 'Unable to save the inquiry at this time.' });
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const result = await queryDb('SELECT * FROM admins WHERE email = $1 LIMIT 1', [String(email).trim()]);
    const admin = result.rows[0];

    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const passwordMatch = await bcrypt.compare(String(password), admin.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        fullName: admin.full_name,
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    return res.json({
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        fullName: admin.full_name,
      },
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return res.status(500).json({ message: 'Login failed due to a server error.' });
  }
});

app.get('/api/admin/me', authenticateAdmin, (req, res) => {
  res.json({ admin: req.admin });
});

app.get('/api/admin/inquiries', authenticateAdmin, async (req, res) => {
  try {
    const category = String(req.query.category || '').trim();
    const userType = String(req.query.userType || '').trim();
    const search = String(req.query.search || '').trim();

    let query = 'SELECT * FROM inquiries';
    const whereClauses = [];
    const values = [];

    if (category && category !== 'All') {
      whereClauses.push(`category = $${values.length + 1}`);
      values.push(category);
    }

    if (userType && userType !== 'All') {
      whereClauses.push(`user_type = $${values.length + 1}`);
      values.push(userType);
    }

    if (search) {
      whereClauses.push(`(LOWER(name) LIKE LOWER($${values.length + 1}) OR phone LIKE $${values.length + 2})`);
      values.push(`%${search}%`, `%${search}%`);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    query += ' ORDER BY created_at DESC';

    const result = await queryDb(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Admin inquiries fetch error:', error);
    res.status(500).json({ message: 'Unable to fetch inquiries.' });
  }
});

app.put('/api/admin/inquiries/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const inquiryId = Number(req.params.id);
    const newStatus = String(req.body.status || '').trim();

    if (!Number.isInteger(inquiryId) || inquiryId <= 0) {
      return res.status(400).json({ message: 'Invalid inquiry id.' });
    }

    if (!VALID_STATUSES.includes(newStatus)) {
      return res.status(400).json({ message: 'Invalid status value.' });
    }

    const result = await queryDb(
      'UPDATE inquiries SET status = $1 WHERE id = $2 RETURNING *;',
      [newStatus, inquiryId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Inquiry not found.' });
    }

    res.json({ message: 'Inquiry status updated.', inquiry: result.rows[0] });
  } catch (error) {
    console.error('Status update error:', error);
    res.status(500).json({ message: 'Unable to update inquiry status.' });
  }
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`EdTech CRM app running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Database bootstrap failed:', error);
    process.exit(1);
  });

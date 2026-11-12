// FindIt backend: simple Express API with JSON-file storage.
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;
const SECRET = process.env.JWT_SECRET || 'findit-local-demo-secret';
const DATA = path.join(__dirname, 'data');
const UPLOADS = path.join(__dirname, 'uploads');

fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS));

// Read and write small project data files.
function readData(file, defaultData = []) {
  const filePath = path.join(DATA, file);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Error reading ${file}:`, e);
    return defaultData;
  }
}

function saveData(file, data) {
  fs.writeFileSync(path.join(DATA, file), JSON.stringify(data, null, 2));
}

const makeId = () => crypto.randomUUID();

// Save uploaded item photos with a unique filename.
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS),
  filename: (_req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname).toLowerCase())
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (allowed.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG or WEBP images are allowed.'));
    }
  }
});

function getUser(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), SECRET);
  } catch {
    return null;
  }
}

function requireLogin(req, res, next) {
  const user = getUser(req);
  if (!user) return res.status(401).json({ message: 'Please login to continue.' });
  req.user = user;
  next();
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok', message: 'FindIt API is running' }));

// Auth endpoints
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, city } = req.body;
    if (!name || !email || !password || !city) {
      return res.status(400).json({ message: 'Please fill all fields.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }
    const users = readData('users.json');
    if (users.some(user => user.email === email.toLowerCase().trim())) {
      return res.status(409).json({ message: 'Email is already registered.' });
    }
    const user = {
      id: makeId(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: await bcrypt.hash(password, 10),
      city: city.trim(),
      createdAt: new Date().toISOString()
    };
    users.push(user);
    saveData('users.json', users);
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, city: user.city }, SECRET, { expiresIn: '7d' });
    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, city: user.city }
    });
  } catch (err) {
    res.status(500).json({ message: 'Could not create account: ' + err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide both email and password.' });
    }
    const user = readData('users.json').find(item => item.email === String(email).toLowerCase().trim());
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Incorrect email or password.' });
    }
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, city: user.city }, SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, city: user.city }
    });
  } catch (err) {
    res.status(500).json({ message: 'Login failed: ' + err.message });
  }
});

// Items endpoints
app.get('/api/items', (req, res) => {
  try {
    let items = readData('items.json');
    const { search, city, type, category } = req.query;
    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      items = items.filter(item =>
        [item.title, item.description, item.location, item.city, item.category].filter(Boolean).join(' ').toLowerCase().includes(term)
      );
    }
    if (city && city !== 'All') {
      items = items.filter(item => item.city && item.city.toLowerCase() === city.toLowerCase());
    }
    if (type && type !== 'All') {
      items = items.filter(item => item.type === type);
    }
    if (category && category !== 'All') {
      items = items.filter(item => item.category === category);
    }
    items.sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load items: ' + err.message });
  }
});

app.get('/api/items/:id', (req, res) => {
  const items = readData('items.json');
  const item = items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ message: 'Item not found.' });
  res.json(item);
});

app.post('/api/items', requireLogin, upload.single('image'), (req, res) => {
  try {
    const { title, category, type, description, city, location, date } = req.body;
    if (!title || !category || !type || !description || !city || !location || !date) {
      return res.status(400).json({ message: 'Please fill all required fields.' });
    }
    if (!['Lost', 'Found'].includes(type)) {
      return res.status(400).json({ message: 'Choose Lost or Found.' });
    }
    const item = {
      id: makeId(),
      title: title.trim(),
      category: category.trim(),
      type,
      description: description.trim(),
      city: city.trim(),
      location: location.trim(),
      date,
      image: req.file ? `/uploads/${req.file.filename}` : '',
      status: 'Open',
      createdBy: req.user.name,
      userId: req.user.id,
      createdAt: new Date().toISOString()
    };
    const items = readData('items.json');
    items.push(item);
    saveData('items.json', items);
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ message: 'Could not create item report: ' + err.message });
  }
});

app.delete('/api/items/:id', requireLogin, (req, res) => {
  try {
    let items = readData('items.json');
    const item = items.find(i => i.id === req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found.' });
    if (item.userId && item.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this item.' });
    }
    items = items.filter(i => i.id !== req.params.id);
    saveData('items.json', items);
    res.json({ message: 'Item deleted successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Could not delete item: ' + err.message });
  }
});

// Claims endpoints
app.post('/api/claims', requireLogin, (req, res) => {
  try {
    const { itemId, message } = req.body;
    if (!itemId) return res.status(400).json({ message: 'Item ID is required.' });
    const items = readData('items.json');
    const item = items.find(entry => entry.id === itemId);
    if (!item) return res.status(404).json({ message: 'Item not found.' });
    if (item.userId && item.userId === req.user.id) {
      return res.status(400).json({ message: 'You cannot claim your own post.' });
    }
    const claims = readData('claims.json');
    if (claims.some(claim => claim.itemId === itemId && claim.userId === req.user.id)) {
      return res.status(409).json({ message: 'You have already submitted a claim for this item.' });
    }
    const newClaim = {
      id: makeId(),
      itemId,
      itemTitle: item.title,
      itemType: item.type,
      itemOwnerId: item.userId || '',
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      message: message || '',
      status: 'Pending',
      createdAt: new Date().toISOString()
    };
    claims.push(newClaim);
    saveData('claims.json', claims);
    res.status(201).json({ message: 'Claim request sent successfully!', claim: newClaim });
  } catch (err) {
    res.status(500).json({ message: 'Could not send claim request: ' + err.message });
  }
});

app.get('/api/my-posts', requireLogin, (req, res) => {
  const items = readData('items.json');
  res.json(items.filter(item => item.userId === req.user.id));
});

app.get('/api/my-claims', requireLogin, (req, res) => {
  const claims = readData('claims.json');
  res.json(claims.filter(claim => claim.userId === req.user.id));
});

app.get('/api/received-claims', requireLogin, (req, res) => {
  const items = readData('items.json');
  const myItemIds = new Set(items.filter(item => item.userId === req.user.id).map(item => item.id));
  const claims = readData('claims.json');
  res.json(claims.filter(claim => myItemIds.has(claim.itemId) || claim.itemOwnerId === req.user.id));
});

app.patch('/api/claims/:id', requireLogin, (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['Approved', 'Rejected', 'Pending'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status.' });
    }
    const claims = readData('claims.json');
    const claim = claims.find(c => c.id === req.params.id);
    if (!claim) return res.status(404).json({ message: 'Claim not found.' });

    const items = readData('items.json');
    const item = items.find(i => i.id === claim.itemId);
    if (item && item.userId && item.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to manage claims for this item.' });
    }

    claim.status = status;
    saveData('claims.json', claims);

    if (status === 'Approved' && item) {
      item.status = 'Returned';
      saveData('items.json', items);
    }

    res.json({ message: `Claim marked as ${status}.`, claim });
  } catch (err) {
    res.status(500).json({ message: 'Could not update claim status: ' + err.message });
  }
});

// Community stats
app.get('/api/stats', (_req, res) => {
  const items = readData('items.json');
  res.json({
    total: items.length,
    lost: items.filter(item => item.type === 'Lost').length,
    found: items.filter(item => item.type === 'Found').length,
    returned: items.filter(item => item.status === 'Returned').length
  });
});

// Error handling middleware
app.use((err, _req, res, _next) => {
  console.error('API Error:', err);
  res.status(400).json({ message: err.message || 'Something went wrong.' });
});

app.listen(PORT, () => console.log(`FindIt server running at http://localhost:${PORT}`));

import React, { useEffect, useMemo, useState } from 'react';

// Use relative /api if proxied by Vite, or explicit localhost backend
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const CATEGORIES = [
  'Electronics',
  'Wallet',
  'Keys',
  'Documents',
  'Bag',
  'Bottle',
  'Clothing',
  'Other'
];

function App() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ total: 0, lost: 0, found: 0, returned: 0 });
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('All');
  const [type, setType] = useState('All');
  const [category, setCategory] = useState('All');
  const [page, setPage] = useState('home'); // 'home' | 'post' | 'auth' | 'dashboard'
  const [selectedItem, setSelectedItem] = useState(null); // For Item Details Modal
  const [dashboardTab, setDashboardTab] = useState('posts'); // 'posts' | 'claims' | 'received'

  // User & Auth state
  const [token, setToken] = useState(() => localStorage.getItem('finditToken') || '');
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('finditUser');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', city: 'Delhi' });

  // Notifications
  const [notice, setNotice] = useState({ text: '', type: 'info' }); // type: 'info' | 'error' | 'success'

  // Post form state
  const [post, setPost] = useState({
    title: '',
    category: 'Electronics',
    type: 'Found',
    description: '',
    city: 'Delhi',
    location: '',
    date: new Date().toISOString().slice(0, 10)
  });
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  // Claim state
  const [claimModalItem, setClaimModalItem] = useState(null);
  const [claimMessage, setClaimMessage] = useState('');

  // Dashboard state
  const [myPosts, setMyPosts] = useState([]);
  const [myClaims, setMyClaims] = useState([]);
  const [receivedClaims, setReceivedClaims] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [serverOnline, setServerOnline] = useState(true);

  function showNotice(text, type = 'info') {
    setNotice({ text, type });
  }

  function clearNotice() {
    setNotice({ text: '', type: 'info' });
  }

  // Unified API request helper with defensive error handling
  async function request(endpoint, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (!(options.body instanceof FormData) && options.body) {
      headers['Content-Type'] = 'application/json';
    }

    let response;
    try {
      response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
      setServerOnline(true);
    } catch (err) {
      setServerOnline(false);
      throw new Error(`Cannot connect to backend server (${BACKEND_BASE}). Please ensure the server is running on port 5000.`);
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(`Server returned non-JSON response (${response.status} ${response.statusText})`);
    }

    if (!response.ok) {
      throw new Error(data.message || `Request failed with status ${response.status}`);
    }
    return data;
  }

  // Load items & stats from server
  async function loadItems() {
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set('search', search.trim());
      if (city !== 'All') query.set('city', city);
      if (type !== 'All') query.set('type', type);
      if (category !== 'All') query.set('category', category);

      const data = await request(`/items?${query.toString()}`);
      setItems(Array.isArray(data) ? data : []);

      const statsData = await request('/stats');
      if (statsData) {
        setStats({
          total: statsData.total || 0,
          lost: statsData.lost || 0,
          found: statsData.found || 0,
          returned: statsData.returned || 0
        });
      }
    } catch (error) {
      showNotice(error.message, 'error');
    }
  }

  useEffect(() => {
    loadItems();
  }, [search, city, type, category]);

  // Load dashboard activity
  async function loadDashboard() {
    if (!token) return;
    try {
      const [posts, claims, received] = await Promise.all([
        request('/my-posts').catch(() => []),
        request('/my-claims').catch(() => []),
        request('/received-claims').catch(() => [])
      ]);
      setMyPosts(Array.isArray(posts) ? posts : []);
      setMyClaims(Array.isArray(claims) ? claims : []);
      setReceivedClaims(Array.isArray(received) ? received : []);
    } catch (error) {
      showNotice(error.message, 'error');
    }
  }

  useEffect(() => {
    if (token && page === 'dashboard') {
      loadDashboard();
    }
  }, [token, page]);

  // Handle Photo selection with preview
  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        showNotice('Photo file size exceeds 5MB limit.', 'error');
        return;
      }
      setPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result);
      reader.readAsDataURL(file);
    } else {
      setPhoto(null);
      setPhotoPreview(null);
    }
  }

  // Auth submission (Login or Register)
  async function submitAuth(event) {
    event.preventDefault();
    clearNotice();
    try {
      const endpoint = authMode === 'login' ? '/login' : '/register';
      const result = await request(endpoint, {
        method: 'POST',
        body: JSON.stringify(authForm)
      });
      setToken(result.token);
      setUser(result.user);
      localStorage.setItem('finditToken', result.token);
      localStorage.setItem('finditUser', JSON.stringify(result.user));
      showNotice(`Welcome back, ${result.user?.name || 'User'}!`, 'success');
      setPage('home');
      setAuthForm({ name: '', email: '', password: '', city: 'Delhi' });
    } catch (error) {
      showNotice(error.message, 'error');
    }
  }

  function logout() {
    setToken('');
    setUser(null);
    localStorage.removeItem('finditToken');
    localStorage.removeItem('finditUser');
    setPage('home');
    showNotice('You have been logged out successfully.', 'info');
  }

  // Publish new item report
  async function submitPost(event) {
    event.preventDefault();
    clearNotice();
    try {
      const body = new FormData();
      Object.entries(post).forEach(([key, value]) => body.append(key, value));
      if (photo) body.append('image', photo);

      await request('/items', { method: 'POST', body });
      showNotice('Your item report has been published successfully!', 'success');
      setPage('home');
      setPhoto(null);
      setPhotoPreview(null);
      setPost({
        title: '',
        category: 'Electronics',
        type: 'Found',
        description: '',
        city: user?.city || 'Delhi',
        location: '',
        date: new Date().toISOString().slice(0, 10)
      });
      loadItems();
    } catch (error) {
      showNotice(error.message, 'error');
    }
  }

  // Send Claim request
  async function handleSendClaim(e) {
    e?.preventDefault?.();
    if (!claimModalItem) return;
    clearNotice();
    try {
      const result = await request('/claims', {
        method: 'POST',
        body: JSON.stringify({ itemId: claimModalItem.id, message: claimMessage.trim() })
      });
      showNotice(result.message || 'Claim request sent successfully!', 'success');
      setClaimModalItem(null);
      setClaimMessage('');
      if (selectedItem && selectedItem.id === claimModalItem.id) {
        setSelectedItem(null);
      }
    } catch (error) {
      showNotice(error.message, 'error');
    }
  }

  // Handle claim status update by post author (Approve / Reject)
  async function handleUpdateClaimStatus(claimId, status) {
    try {
      const result = await request(`/claims/${claimId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      showNotice(result.message || `Claim status updated to ${status}.`, 'success');
      loadDashboard();
      loadItems();
    } catch (error) {
      showNotice(error.message, 'error');
    }
  }

  // Delete an item posted by the user
  async function handleDeleteItem(itemId) {
    if (!window.confirm('Are you sure you want to delete this listing?')) return;
    try {
      const result = await request(`/items/${itemId}`, { method: 'DELETE' });
      showNotice(result.message || 'Item deleted.', 'info');
      loadDashboard();
      loadItems();
    } catch (error) {
      showNotice(error.message, 'error');
    }
  }

  // Build unique cities list safely
  const cities = useMemo(() => {
    const list = ['All'];
    const set = new Set();
    items.forEach(item => {
      if (item && item.city && item.city.trim()) set.add(item.city.trim());
    });
    return [...list, ...Array.from(set)];
  }, [items]);

  // Helper for category placeholder icon
  function getCategoryIcon(cat) {
    switch (cat) {
      case 'Electronics': return '💻';
      case 'Wallet': return '👛';
      case 'Keys': return '🔑';
      case 'Documents': return '📄';
      case 'Bag': return '🎒';
      case 'Bottle': return '🍶';
      case 'Clothing': return '👕';
      default: return '📦';
    }
  }

  // Format image URL
  function getImageUrl(imgPath) {
    if (!imgPath) return '';
    if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) return imgPath;
    return `${BACKEND_BASE}${imgPath.startsWith('/') ? '' : '/'}${imgPath}`;
  }

  return (
    <div className="app-shell">
      {/* Top Navigation */}
      <header className="topbar">
        <a className="brand" href="#home" onClick={(e) => { e.preventDefault(); setPage('home'); }}>
          <span className="brand-icon">⌕</span> Find<span>It</span>
          <span className="brand-badge">Lost &amp; Found</span>
        </a>

        <div className="mobile-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          ☰
        </div>

        <nav className={`main-nav ${mobileMenuOpen ? 'open' : ''}`}>
          <button
            className={page === 'home' ? 'nav-active' : ''}
            onClick={() => { setPage('home'); setMobileMenuOpen(false); }}
          >
            Explore Listings
          </button>
          <button
            className={page === 'post' ? 'nav-active' : ''}
            onClick={() => {
              if (token) {
                setPage('post');
              } else {
                setAuthMode('login');
                setPage('auth');
              }
              setMobileMenuOpen(false);
            }}
          >
            ＋ Report an Item
          </button>
          {token && (
            <button
              className={page === 'dashboard' ? 'nav-active' : ''}
              onClick={() => { setPage('dashboard'); setMobileMenuOpen(false); }}
            >
              My Activity
            </button>
          )}
        </nav>

        <div className="account">
          {user ? (
            <>
              <span className="user-name">Hi, {user.name ? user.name.split(' ')[0] : 'User'}</span>
              <button className="outline-btn" onClick={logout}>Log out</button>
            </>
          ) : (
            <button
              className="primary small"
              onClick={() => { setPage('auth'); setAuthMode('login'); }}
            >
              Login / Sign up
            </button>
          )}
        </div>
      </header>

      {/* Global Notice Bar */}
      {notice.text && (
        <div className={`notice notice-${notice.type}`} role="status">
          <span>{notice.text}</span>
          <button onClick={clearNotice} aria-label="Dismiss notice">×</button>
        </div>
      )}

      {/* Backend Status Warning when offline */}
      {!serverOnline && (
        <div className="offline-banner">
          ⚠️ <strong>Backend Offline:</strong> The Express server at <code>http://localhost:5000</code> is currently not reachable. You can still explore the frontend, but real-time data and actions require running <code>npm run server</code>.
        </div>
      )}

      {/* PAGE: HOME / EXPLORE */}
      {page === 'home' && (
        <>
          {/* Hero Section */}
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow"><span className="pulse" /> COMMUNITY POWERED · SAFE &amp; DIRECT</div>
              <h1>Lost something?<br /><em>Let's bring it back.</em></h1>
              <p>
                FindIt connects students and local communities to report lost belongings, share found items, and safely reunite people with what matters.
              </p>
              <div className="hero-actions">
                <button
                  className="primary"
                  onClick={() => (token ? setPage('post') : setPage('auth'))}
                >
                  ＋ Report an Item
                </button>
                <button
                  className="text-btn"
                  onClick={() => document.getElementById('listings')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  Browse listings <span>↘</span>
                </button>
              </div>
              <div className="hero-note">
                <span>✳</span> Built for college demonstration by <strong>Vinnet Dahiya</strong>
              </div>
            </div>

            <div className="hero-art">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="art-card card-back">
                <span>FOUND ITEM</span>
                <b>Every item has a way home.</b>
              </div>
              <div className="art-card card-front">
                <div className="wallet">▰</div>
                <span className="tag">FOUND · ROHINI</span>
                <h3>Someone found<br />your something.</h3>
                <div className="art-line" />
                <small>One community. Countless connections.</small>
              </div>
              <div className="spark spark-a">✳</div>
              <div className="spark spark-b">✦</div>
            </div>
          </section>

          {/* Stats Bar */}
          <section className="stats">
            <div>
              <strong>{stats?.total ?? 0}</strong>
              <span>Total Reports</span>
            </div>
            <div>
              <strong>{stats?.lost ?? 0}</strong>
              <span>Items Lost</span>
            </div>
            <div>
              <strong>{stats?.found ?? 0}</strong>
              <span>Items Found</span>
            </div>
            <div>
              <strong>{stats?.returned ?? 0}</strong>
              <span>Items Returned</span>
            </div>
          </section>

          {/* Listings Board */}
          <main id="listings" className="content">
            <div className="section-heading">
              <div>
                <div className="eyebrow">THE COMMUNITY BOARD</div>
                <h2>Recent listings<span>.</span></h2>
                <p>Browse reported lost and found items. Click any item to view complete details or claim it.</p>
              </div>
              <button
                className="primary"
                onClick={() => (token ? setPage('post') : setPage('auth'))}
              >
                ＋ Add a Listing
              </button>
            </div>

            {/* Filter Bar: Keyword search, City, Type, Category */}
            <div className="filters">
              <div className="search-box">
                <span>⌕</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search item, place or keyword..."
                />
              </div>

              <select
                aria-label="Filter by City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              >
                {cities.map((value) => (
                  <option key={value} value={value}>
                    {value === 'All' ? 'All Cities' : value}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by Type"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="All">All Types</option>
                <option value="Lost">Lost</option>
                <option value="Found">Found</option>
              </select>

              <select
                aria-label="Filter by Category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="All">All Categories</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              {(search || city !== 'All' || type !== 'All' || category !== 'All') && (
                <button
                  className="outline-btn reset-btn"
                  onClick={() => {
                    setSearch('');
                    setCity('All');
                    setType('All');
                    setCategory('All');
                  }}
                >
                  Reset
                </button>
              )}
            </div>

            {/* Item Grid */}
            <div className="item-grid">
              {items.map((item) => (
                <article
                  className="item-card"
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                >
                  <div className="item-image">
                    {item.image ? (
                      <img src={getImageUrl(item.image)} alt={item.title} loading="lazy" />
                    ) : (
                      <div className="image-placeholder">
                        <span className="placeholder-icon">{getCategoryIcon(item.category)}</span>
                        <small>{item.category}</small>
                      </div>
                    )}
                    <span className={`status ${item.type?.toLowerCase() || 'found'}`}>
                      {item.type}
                    </span>
                    {item.status === 'Returned' && (
                      <span className="status-returned">Returned</span>
                    )}
                  </div>

                  <div className="item-info">
                    <div className="item-meta">
                      <span>{item.category}</span>
                      <span>·</span>
                      <span>{item.date ? new Date(item.date).toLocaleDateString('en-IN') : 'Recent'}</span>
                    </div>

                    <h3>{item.title}</h3>
                    <p>{item.description}</p>

                    <div className="location">
                      📍 {item.location}, {item.city}
                    </div>

                    <div className="item-footer">
                      <span>By {item.createdBy || 'Community'}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!token) {
                            setPage('auth');
                          } else {
                            setClaimModalItem(item);
                            setClaimMessage('');
                          }
                        }}
                      >
                        {item.type === 'Found' ? 'Claim item ↗' : 'I found this ↗'}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {items.length === 0 && (
              <div className="empty">
                <div className="empty-icon">⌕</div>
                <h3>No listings found</h3>
                <p>Try adjusting your search query or reset your city and category filters.</p>
                <button
                  className="outline-btn"
                  style={{ marginTop: '15px' }}
                  onClick={() => {
                    setSearch('');
                    setCity('All');
                    setType('All');
                    setCategory('All');
                  }}
                >
                  Clear all filters
                </button>
              </div>
            )}
          </main>
        </>
      )}

      {/* PAGE: AUTH (Login & Register) */}
      {page === 'auth' && (
        <main className="form-page">
          <div className="form-intro">
            <div className="eyebrow">COMMUNITY ACCESS</div>
            <h1>{authMode === 'login' ? 'Good to see you again.' : 'Be part of the circle.'}</h1>
            <p>
              Sign in to report lost or found items, send verified claim requests, and track your activity.
            </p>
          </div>

          <form className="panel-form" onSubmit={submitAuth}>
            <div className="tabs">
              <button
                type="button"
                className={authMode === 'login' ? 'selected' : ''}
                onClick={() => setAuthMode('login')}
              >
                Login
              </button>
              <button
                type="button"
                className={authMode === 'register' ? 'selected' : ''}
                onClick={() => setAuthMode('register')}
              >
                Create Account
              </button>
            </div>

            {authMode === 'register' && (
              <label>
                Full name
                <input
                  required
                  value={authForm.name}
                  onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                  placeholder="e.g. Vinnet Dahiya"
                />
              </label>
            )}

            <label>
              Email address
              <input
                required
                type="email"
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                placeholder="you@example.com"
              />
            </label>

            <label>
              Password
              <input
                required
                type="password"
                minLength="6"
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                placeholder="At least 6 characters"
              />
            </label>

            {authMode === 'register' && (
              <label>
                Your city
                <input
                  required
                  value={authForm.city}
                  onChange={(e) => setAuthForm({ ...authForm, city: e.target.value })}
                  placeholder="e.g. Delhi"
                />
              </label>
            )}

            <button className="primary full" type="submit">
              {authMode === 'login' ? 'Login to FindIt →' : 'Create My Account →'}
            </button>
            <p className="form-foot">
              FindIt is an academic project designed for simple, direct lost &amp; found management.
            </p>
          </form>
        </main>
      )}

      {/* PAGE: POST ITEM */}
      {page === 'post' && (
        <main className="form-page wide">
          <div className="form-intro">
            <div className="eyebrow">HELP REUNITE AN ITEM</div>
            <h1>Share an item report<span>.</span></h1>
            <p>
              Give the community enough details to help identify the item. Tip: keep one private identifying detail (e.g. wallpaper or serial number) for claim verification.
            </p>
          </div>

          <form className="panel-form post-form" onSubmit={submitPost}>
            <div className="two-col">
              <label>
                I am reporting
                <select
                  value={post.type}
                  onChange={(e) => setPost({ ...post, type: e.target.value })}
                >
                  <option value="Found">I Found an Item</option>
                  <option value="Lost">I Lost an Item</option>
                </select>
              </label>

              <label>
                Category
                <select
                  value={post.category}
                  onChange={(e) => setPost({ ...post, category: e.target.value })}
                >
                  {CATEGORIES.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              Item title
              <input
                required
                value={post.title}
                onChange={(e) => setPost({ ...post, title: e.target.value })}
                placeholder="e.g. Black Leather Titan Wallet or White AirPods Case"
              />
            </label>

            <label>
              Description &amp; Key Details
              <textarea
                required
                rows="4"
                value={post.description}
                onChange={(e) => setPost({ ...post, description: e.target.value })}
                placeholder="Describe color, brand, condition, where it was spotted or lost..."
              />
            </label>

            <div className="two-col">
              <label>
                City
                <input
                  required
                  value={post.city}
                  onChange={(e) => setPost({ ...post, city: e.target.value })}
                  placeholder="e.g. Delhi"
                />
              </label>

              <label>
                Area / Specific location
                <input
                  required
                  value={post.location}
                  onChange={(e) => setPost({ ...post, location: e.target.value })}
                  placeholder="e.g. College Canteen, Rohini Sector 16"
                />
              </label>
            </div>

            <div className="two-col">
              <label>
                Date
                <input
                  required
                  type="date"
                  value={post.date}
                  onChange={(e) => setPost({ ...post, date: e.target.value })}
                />
              </label>

              <label>
                Photo (optional)
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/jpg"
                  onChange={handlePhotoChange}
                />
                <small>JPG, PNG or WEBP · Max 5 MB</small>
              </label>
            </div>

            {photoPreview && (
              <div className="preview-container">
                <span className="preview-label">Image Preview:</span>
                <img src={photoPreview} alt="Preview" className="photo-preview" />
              </div>
            )}

            <button className="primary full" type="submit">
              Publish Report →
            </button>
          </form>
        </main>
      )}

      {/* PAGE: DASHBOARD (My Activity) */}
      {page === 'dashboard' && (
        <main className="content dashboard">
          <div className="section-heading">
            <div>
              <div className="eyebrow">YOUR PERSONAL SPACE</div>
              <h2>My activity<span>.</span></h2>
              <p>Keep track of items you reported, claims you submitted, and claims from other users on your posts.</p>
            </div>
            <button className="primary" onClick={() => setPage('post')}>
              ＋ Report an Item
            </button>
          </div>

          <div className="dashboard-tabs">
            <button
              className={dashboardTab === 'posts' ? 'active' : ''}
              onClick={() => setDashboardTab('posts')}
            >
              My Reported Items ({myPosts.length})
            </button>
            <button
              className={dashboardTab === 'claims' ? 'active' : ''}
              onClick={() => setDashboardTab('claims')}
            >
              My Submitted Claims ({myClaims.length})
            </button>
            <button
              className={dashboardTab === 'received' ? 'active' : ''}
              onClick={() => setDashboardTab('received')}
            >
              Claims Received on My Items ({receivedClaims.length})
            </button>
          </div>

          {/* TAB 1: My Posts */}
          {dashboardTab === 'posts' && (
            <div className="dash-section">
              {myPosts.length > 0 ? (
                <div className="dash-list">
                  {myPosts.map((item) => (
                    <div className="dash-card" key={item.id}>
                      <div className="dash-card-info">
                        <div className="item-meta">
                          <span className={`status-badge ${item.type?.toLowerCase()}`}>{item.type}</span>
                          <span>·</span>
                          <span>{item.category}</span>
                          <span>·</span>
                          <span>{item.city} ({item.location})</span>
                        </div>
                        <h4>{item.title}</h4>
                        <p>{item.description}</p>
                        <small>Reported on: {new Date(item.date).toLocaleDateString('en-IN')}</small>
                      </div>
                      <div className="dash-card-actions">
                        <span className={`status-pill status-${(item.status || 'open').toLowerCase()}`}>
                          Status: {item.status || 'Open'}
                        </span>
                        <button
                          className="outline-btn delete-btn"
                          onClick={() => handleDeleteItem(item.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted empty-dash">You haven't reported any lost or found items yet.</p>
              )}
            </div>
          )}

          {/* TAB 2: My Claims */}
          {dashboardTab === 'claims' && (
            <div className="dash-section">
              {myClaims.length > 0 ? (
                <div className="dash-list">
                  {myClaims.map((claim) => (
                    <div className="dash-card" key={claim.id}>
                      <div className="dash-card-info">
                        <div className="item-meta">
                          <span>Claim for: <strong>{claim.itemTitle}</strong></span>
                        </div>
                        <p className="claim-msg">Your note: "{claim.message || 'No additional details provided.'}"</p>
                        <small>Submitted: {new Date(claim.createdAt).toLocaleDateString('en-IN')}</small>
                      </div>
                      <div className="dash-card-actions">
                        <span className={`status-pill status-${(claim.status || 'pending').toLowerCase()}`}>
                          {claim.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted empty-dash">You haven't submitted any claim requests yet.</p>
              )}
            </div>
          )}

          {/* TAB 3: Received Claims */}
          {dashboardTab === 'received' && (
            <div className="dash-section">
              {receivedClaims.length > 0 ? (
                <div className="dash-list">
                  {receivedClaims.map((claim) => (
                    <div className="dash-card" key={claim.id}>
                      <div className="dash-card-info">
                        <div className="item-meta">
                          <span>Item: <strong>{claim.itemTitle}</strong></span>
                          <span>·</span>
                          <span>Claimed by: <strong>{claim.userName}</strong> ({claim.userEmail})</span>
                        </div>
                        <p className="claim-msg">Claim verification note: "{claim.message || 'No note provided.'}"</p>
                        <small>Date: {new Date(claim.createdAt).toLocaleDateString('en-IN')}</small>
                      </div>
                      <div className="dash-card-actions">
                        <span className={`status-pill status-${(claim.status || 'pending').toLowerCase()}`}>
                          {claim.status}
                        </span>
                        {claim.status === 'Pending' && (
                          <div className="action-btns">
                            <button
                              className="btn-approve"
                              onClick={() => handleUpdateClaimStatus(claim.id, 'Approved')}
                            >
                              ✓ Approve
                            </button>
                            <button
                              className="btn-reject"
                              onClick={() => handleUpdateClaimStatus(claim.id, 'Rejected')}
                            >
                              ✗ Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted empty-dash">No one has submitted a claim for your listings yet.</p>
              )}
            </div>
          )}
        </main>
      )}

      {/* MODAL: ITEM DETAILS */}
      {selectedItem && (
        <div className="modal-backdrop" onClick={() => setSelectedItem(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setSelectedItem(null)}
              aria-label="Close"
            >
              ×
            </button>

            <div className="modal-header">
              <span className={`status ${selectedItem.type?.toLowerCase()}`}>
                {selectedItem.type}
              </span>
              <span className="modal-category">{selectedItem.category}</span>
              {selectedItem.status === 'Returned' && (
                <span className="status-returned">Returned / Resolved</span>
              )}
            </div>

            {selectedItem.image ? (
              <div className="modal-image">
                <img src={getImageUrl(selectedItem.image)} alt={selectedItem.title} />
              </div>
            ) : (
              <div className="modal-image-placeholder">
                <span className="placeholder-icon">{getCategoryIcon(selectedItem.category)}</span>
                <span>No photo attached</span>
              </div>
            )}

            <div className="modal-body">
              <h2>{selectedItem.title}</h2>
              <div className="modal-meta-grid">
                <div><strong>City:</strong> {selectedItem.city}</div>
                <div><strong>Location:</strong> {selectedItem.location}</div>
                <div><strong>Date:</strong> {new Date(selectedItem.date).toLocaleDateString('en-IN')}</div>
                <div><strong>Reported By:</strong> {selectedItem.createdBy || 'Community Member'}</div>
              </div>

              <div className="modal-desc">
                <h4>Description:</h4>
                <p>{selectedItem.description}</p>
              </div>

              {/* Claim Action within Modal */}
              <div className="modal-claim-box">
                {user && selectedItem.userId === user.id ? (
                  <p className="owner-badge">ℹ️ You posted this listing.</p>
                ) : (
                  <>
                    <h4>Is this yours or did you find it?</h4>
                    <p>Send a claim request to the reporter with your verification details.</p>
                    <button
                      className="primary full"
                      onClick={() => {
                        if (!token) {
                          setSelectedItem(null);
                          setPage('auth');
                        } else {
                          setClaimModalItem(selectedItem);
                          setClaimMessage('');
                        }
                      }}
                    >
                      {selectedItem.type === 'Found' ? 'Claim This Item →' : 'I Found This Item →'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SUBMIT CLAIM */}
      {claimModalItem && (
        <div className="modal-backdrop" onClick={() => setClaimModalItem(null)}>
          <div className="modal-card modal-claim-dialog" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setClaimModalItem(null)}
              aria-label="Close"
            >
              ×
            </button>

            <div className="eyebrow">VERIFY &amp; CLAIM</div>
            <h2>Claim: {claimModalItem.title}</h2>
            <p className="claim-sub">
              Reporting for {claimModalItem.type === 'Found' ? 'found item' : 'lost item'} in {claimModalItem.city} ({claimModalItem.location}).
            </p>

            <form onSubmit={handleSendClaim}>
              <label>
                Proof of ownership or recovery details:
                <textarea
                  required
                  rows="4"
                  value={claimMessage}
                  onChange={(e) => setClaimMessage(e.target.value)}
                  placeholder="Describe unique identifying marks, contents, where/when you lost or found it, or your contact number..."
                />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="outline-btn"
                  onClick={() => setClaimModalItem(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary">
                  Submit Claim Request →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer>
        <div className="footer-brand">
          Find<span>It</span>
        </div>
        <p>
          FindIt – Lost &amp; Found Management System · Helping lost things find their way home.
        </p>
        <div className="footer-credits">
          © 2026 FindIt · Project by <strong>Vinnet Dahiya</strong>
        </div>
      </footer>
    </div>
  );
}

export default App;

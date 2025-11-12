const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // Serve your static files

// Initialize SQLite database
const db = new sqlite3.Database('./qrcodes.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    
    // Create table if it doesn't exist
    db.run(`
      CREATE TABLE IF NOT EXISTS qr_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        short_code TEXT UNIQUE NOT NULL,
        original_url TEXT NOT NULL,
        scan_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_scanned DATETIME
      )
    `, (err) => {
      if (err) {
        console.error('Error creating table:', err);
      }
    });
  }
});

// Generate a unique short code
function generateShortCode() {
  return crypto.randomBytes(4).toString('hex'); // 8 character code
}

// API: Create a trackable QR code
app.post('/api/create-qr', (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  const shortCode = generateShortCode();
  
  db.run(
    'INSERT INTO qr_codes (short_code, original_url) VALUES (?, ?)',
    [shortCode, url],
    function(err) {
      if (err) {
        console.error('Error inserting QR code:', err);
        return res.status(500).json({ error: 'Failed to create QR code' });
      }
      
      // Return the redirect URL that should be encoded in the QR code
      const redirectUrl = `${req.protocol}://${req.get('host')}/r/${shortCode}`;
      
      res.json({
        success: true,
        shortCode: shortCode,
        redirectUrl: redirectUrl,
        originalUrl: url,
        trackingUrl: `${req.protocol}://${req.get('host')}/api/stats/${shortCode}`
      });
    }
  );
});

// Redirect endpoint - this is what the QR code points to
app.get('/r/:shortCode', (req, res) => {
  const { shortCode } = req.params;
  
  db.get(
    'SELECT * FROM qr_codes WHERE short_code = ?',
    [shortCode],
    (err, row) => {
      if (err) {
        console.error('Error fetching QR code:', err);
        return res.status(500).send('Server error');
      }
      
      if (!row) {
        return res.status(404).send('QR code not found');
      }
      
      // Increment scan count
      db.run(
        'UPDATE qr_codes SET scan_count = scan_count + 1, last_scanned = CURRENT_TIMESTAMP WHERE short_code = ?',
        [shortCode],
        (err) => {
          if (err) {
            console.error('Error updating scan count:', err);
          }
        }
      );
      
      // Redirect to the original URL
      res.redirect(row.original_url);
    }
  );
});

// API: Get stats for a specific QR code
app.get('/api/stats/:shortCode', (req, res) => {
  const { shortCode } = req.params;
  
  db.get(
    'SELECT * FROM qr_codes WHERE short_code = ?',
    [shortCode],
    (err, row) => {
      if (err) {
        console.error('Error fetching stats:', err);
        return res.status(500).json({ error: 'Server error' });
      }
      
      if (!row) {
        return res.status(404).json({ error: 'QR code not found' });
      }
      
      res.json({
        shortCode: row.short_code,
        originalUrl: row.original_url,
        scanCount: row.scan_count,
        createdAt: row.created_at,
        lastScanned: row.last_scanned
      });
    }
  );
});

// API: Get all QR codes (for dashboard)
app.get('/api/all-qr-codes', (req, res) => {
  db.all(
    'SELECT * FROM qr_codes ORDER BY created_at DESC',
    [],
    (err, rows) => {
      if (err) {
        console.error('Error fetching all QR codes:', err);
        return res.status(500).json({ error: 'Server error' });
      }
      
      res.json(rows);
    }
  );
});

// API: Delete a QR code
app.delete('/api/delete-qr/:shortCode', (req, res) => {
  const { shortCode } = req.params;
  
  db.run(
    'DELETE FROM qr_codes WHERE short_code = ?',
    [shortCode],
    function(err) {
      if (err) {
        console.error('Error deleting QR code:', err);
        return res.status(500).json({ error: 'Server error' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'QR code not found' });
      }
      
      res.json({ success: true, message: 'QR code deleted' });
    }
  );
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`QR Code tracking server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('Database connection closed');
    }
    process.exit(0);
  });
});
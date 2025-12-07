const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const fs = require('fs').promises;
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8003;
const BASE_URL = process.env.BASE_URL || 'http://localhost:8003';

// Persistent storage using JSON files
const DATA_DIR = path.join(__dirname, 'data');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');

// In-memory storage for new system
const rooms = new Map(); // roomId -> { id, name, hostUsername, hostLoginHash, participants: [{username, passwordHash, encryptedAssignment}], status: 'open'|'started', createdAt }

// Load data from files on startup
async function loadData() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    
    const roomsData = await fs.readFile(ROOMS_FILE, 'utf8').catch(() => '{}');
    
    let roomsObj = {};
    try {
      roomsObj = JSON.parse(roomsData);
    } catch (e) {
      console.error('Corrupted rooms.json, starting fresh');
    }
    
    Object.entries(roomsObj).forEach(([key, value]) => rooms.set(key, value));
    
    console.log('Data loaded successfully');
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

// Save data to files with atomic writes and backup
let saveInProgress = false;
async function saveData() {
  if (saveInProgress) {
    console.log('Save already in progress, skipping');
    return;
  }
  
  saveInProgress = true;
  try {
    // Create backup before overwriting
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(DATA_DIR, 'backups');
    await fs.mkdir(backupDir, { recursive: true });
    
    // Backup existing file if it exists
    try {
      const data = await fs.readFile(ROOMS_FILE, 'utf8');
      await fs.writeFile(path.join(backupDir, `rooms.json.${timestamp}.backup`), data);
    } catch (e) {
      // File doesn't exist, skip backup
    }
    
    // Write new data atomically
    const roomsData = JSON.stringify(Object.fromEntries(rooms), null, 2);
    await fs.writeFile(ROOMS_FILE, roomsData);
    
    console.log('Data saved successfully');
  } catch (error) {
    console.error('Error saving data:', error);
  } finally {
    saveInProgress = false;
  }
}

// Hash password using SHA-256
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Verify password
function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

// Validation helpers
function sanitizeString(str, maxLength = 100) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLength).replace(/[<>"'&]/g, '');
}

function validateUsername(username) {
  const sanitized = sanitizeString(username, 50);
  if (!sanitized || sanitized.length < 2) {
    throw new Error('Username must be at least 2 characters');
  }
  return sanitized;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 4) {
    throw new Error('Password must be at least 4 characters');
  }
  return password;
}

function validateRoomName(name) {
  const sanitized = sanitizeString(name, 100);
  if (!sanitized || sanitized.length < 1) {
    throw new Error('Room name cannot be empty');
  }
  return sanitized;
}

// Rate limiting (simple in-memory)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;

function isRateLimited(clientId) {
  const now = Date.now();
  const requests = rateLimitMap.get(clientId) || [];
  const recentRequests = requests.filter(time => now - time < RATE_LIMIT_WINDOW);
  
  if (recentRequests.length >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }
  
  recentRequests.push(now);
  rateLimitMap.set(clientId, recentRequests);
  return false;
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Create a new room
app.post('/api/rooms', async (req, res) => {
  try {
    const clientId = req.ip || req.connection.remoteAddress;
    if (isRateLimited(clientId)) {
      return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
    }

    const { name, hostUsername, hostPassword, autoJoinHost } = req.body;
    
    if (!name || !hostUsername || !hostPassword) {
      return res.status(400).json({ error: 'Room name, host username, and password are required' });
    }

    // Validate inputs
    const sanitizedName = validateRoomName(name);
    const sanitizedUsername = validateUsername(hostUsername);
    validatePassword(hostPassword);

    const roomId = uuidv4();
    const hostLoginHash = hashPassword(sanitizedUsername + hostPassword);
    
    const room = {
      id: roomId,
      name: sanitizedName,
      hostUsername: sanitizedUsername,
      hostLoginHash: hostLoginHash,
      participants: [],
      status: 'open',
      createdAt: new Date().toISOString()
    };

    // Auto-join host if requested
    if (autoJoinHost) {
      const hostPasswordHash = hashPassword(hostPassword);
      room.participants.push({
        username: sanitizedUsername,
        passwordHash: hostPasswordHash,
        encryptedAssignment: null
      });
    }

    rooms.set(roomId, room);
    await saveData();
    
    res.json({ 
      roomId,
      roomUrl: `${BASE_URL}/room/${roomId}`,
      room: {
        id: room.id,
        name: room.name,
        hostUsername: room.hostUsername,
        participantCount: room.participants.length,
        status: room.status
      }
    });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(400).json({ error: error.message || 'Invalid request data' });
  }
});

// Get room info (public - for join page)
app.get('/api/rooms/:id', (req, res) => {
  const room = rooms.get(req.params.id);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  res.json({
    id: room.id,
    name: room.name,
    participantCount: room.participants.length,
    status: room.status
  });
});

// Register participant in room
app.post('/api/rooms/:id/register', async (req, res) => {
  try {
    const clientId = req.ip || req.connection.remoteAddress;
    if (isRateLimited(clientId)) {
      return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
    }

    const { username, password } = req.body;
    const roomId = req.params.id;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const room = rooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (room.status === 'started') {
      return res.status(400).json({ error: 'Room has already started. Registration is closed.' });
    }

    // Validate inputs
    const sanitizedUsername = validateUsername(username);
    validatePassword(password);

    // Check if this is the host trying to log in
    const hostLoginHash = hashPassword(sanitizedUsername + password);
    if (hostLoginHash === room.hostLoginHash) {
      return res.json({
        success: true,
        isHost: true,
        message: 'Host authenticated successfully',
        username: sanitizedUsername,
        roomDetails: {
          id: room.id,
          name: room.name,
          hostUsername: room.hostUsername,
          participants: room.participants.map(p => ({ username: p.username })),
          status: room.status
        }
      });
    }

    // Check if username already exists
    const existingParticipant = room.participants.find(p => p.username === sanitizedUsername);
    if (existingParticipant) {
      if (!verifyPassword(password, existingParticipant.passwordHash)) {
        return res.status(401).json({ error: 'Invalid password for this username' });
      }
      
      return res.json({ 
        success: true,
        alreadyRegistered: true,
        isHost: false,
        message: 'Signed in successfully',
        username: sanitizedUsername,
        roomDetails: {
          id: room.id,
          name: room.name,
          participants: room.participants.map(p => ({ username: p.username })),
          status: room.status
        }
      });
    }

    const passwordHash = hashPassword(password);
    room.participants.push({
      username: sanitizedUsername,
      passwordHash: passwordHash,
      encryptedAssignment: null
    });

    await saveData();
    
    res.json({ 
      success: true,
      alreadyRegistered: false,
      isHost: false,
      message: 'Registered successfully',
      username: sanitizedUsername
    });
  } catch (error) {
    console.error('Error registering participant:', error);
    res.status(400).json({ error: error.message || 'Invalid request data' });
  }
});

// Host authentication and get room details
app.post('/api/rooms/:id/host-auth', (req, res) => {
  try {
    const { username, password } = req.body;
    const roomId = req.params.id;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const room = rooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const loginHash = hashPassword(username + password);
    if (loginHash !== room.hostLoginHash) {
      return res.status(401).json({ error: 'Invalid host credentials' });
    }

    res.json({
      id: room.id,
      name: room.name,
      hostUsername: room.hostUsername,
      participants: room.participants.map(p => ({
        username: p.username,
        hasAssignment: !!p.encryptedAssignment
      })),
      status: room.status,
      createdAt: room.createdAt
    });
  } catch (error) {
    console.error('Error authenticating host:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove participant (host only)
app.post('/api/rooms/:id/remove-participant', async (req, res) => {
  try {
    const { hostUsername, hostPassword, username } = req.body;
    const roomId = req.params.id;
    
    if (!hostUsername || !hostPassword || !username) {
      return res.status(400).json({ error: 'Host username, password and participant username are required' });
    }

    const room = rooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const loginHash = hashPassword(hostUsername + hostPassword);
    if (loginHash !== room.hostLoginHash) {
      return res.status(401).json({ error: 'Invalid host credentials' });
    }

    if (room.status === 'started') {
      return res.status(400).json({ error: 'Cannot remove participants after room has started' });
    }

    const initialCount = room.participants.length;
    room.participants = room.participants.filter(p => p.username !== username);
    
    if (room.participants.length === initialCount) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    await saveData();
    
    res.json({ 
      success: true,
      message: 'Participant removed',
      participants: room.participants.map(p => ({ username: p.username }))
    });
  } catch (error) {
    console.error('Error removing participant:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start room and generate assignments (host only)
app.post('/api/rooms/:id/start', async (req, res) => {
  try {
    const { hostUsername, hostPassword, encryptedAssignments } = req.body;
    const roomId = req.params.id;
    
    if (!hostUsername || !hostPassword || !encryptedAssignments) {
      return res.status(400).json({ error: 'Host username, password and encrypted assignments are required' });
    }

    const room = rooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const loginHash = hashPassword(hostUsername + hostPassword);
    if (loginHash !== room.hostLoginHash) {
      return res.status(401).json({ error: 'Invalid host credentials' });
    }

    if (room.status === 'started') {
      return res.status(400).json({ error: 'Room has already started' });
    }

    if (room.participants.length < 2) {
      return res.status(400).json({ error: 'At least 2 participants are required' });
    }

    encryptedAssignments.forEach(({ username, encryptedAssignment }) => {
      const participant = room.participants.find(p => p.username === username);
      if (participant) {
        participant.encryptedAssignment = encryptedAssignment;
      }
    });

    room.status = 'started';
    await saveData();
    
    res.json({ 
      success: true,
      message: 'Room started successfully',
      status: room.status
    });
  } catch (error) {
    console.error('Error starting room:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Participant login and get assignment
app.post('/api/rooms/:id/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const roomId = req.params.id;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const room = rooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const participant = room.participants.find(p => p.username === username);
    if (!participant) {
      return res.status(404).json({ error: 'User not found in this room' });
    }

    if (!verifyPassword(password, participant.passwordHash)) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    if (room.status !== 'started') {
      return res.status(400).json({ 
        error: 'Room has not started yet',
        roomStatus: room.status
      });
    }

    res.json({
      success: true,
      username: participant.username,
      roomName: room.name,
      encryptedAssignment: participant.encryptedAssignment
    });
  } catch (error) {
    console.error('Error logging in participant:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve room page
app.get('/room/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Secret Santa app running on http://0.0.0.0:${PORT}`);
  await loadData();
});

const express = require('express');
const { Server } = require('socket.io');
const https = require('https');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

//twilio
const twilio = require('twilio')
require('dotenv').config()
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID,process.env.TWILIO_AUTH_TOKEN)

let token=null;
async function createTokens() {
  try {
    token= await twilioClient.tokens.create({ttl:3600});
    console.log('Full token object:', token);
    return token;
  } catch (err) {
    console.error('Error creating token:', err);
  }
}
// createTokens()
const app = express();


// Load mkcert-generated certs
const options = {
  key: fs.readFileSync(path.join(__dirname, 'localhost+1-key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'localhost+1.pem'))
};

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json())

// Route to index.html
app.get('/', async (req, res) => {
    // res.sendFile(path.join(__dirname, 'views', 'index.html'));
    res.render('index.ejs',{urls1:process.env.urls1,urls2:process.env.urls2,urls3:process.env.urls3,urls4:process.env.urls4,username:process.env.user_name,credential:process.env.credential});
});

app.get("/get-ice-token", async (req, res) => {
  try {
    if(!token)
    {     const configuration=await createTokens()
          function normalizeIceServers(configuration) {
            return (configuration.iceServers || []).map(s => ({
              urls: s.urls || s.url,
              username: s.username || configuration.username,
              credential: s.credential || s.password || configuration.password
            })).filter(s => !!s.urls);
          }
          
          const iceServers = normalizeIceServers(configuration);

          // Build full RTCConfiguration (you can tune these)
          token = {
            iceServers,
            iceTransportPolicy: 'all',     // use 'relay' only for TURN-forced testing
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
            sdpSemantics: 'unified-plan',
            iceCandidatePoolSize: 0
          };
    }
    console.log(token);
    res.json(token); // send JSON back to frontend
  } catch (err) {
    res.status(500).json({ error: "failed to create token" });
  }
});

// Create HTTPS server
const server = https.createServer(options, app);

// Attach Socket.IO
const io = new Server(server,{cors:{
    origin:"*"
}});

// map creation
// const map = new Map()
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('join-room',(roomId)=>{
    console.log(socket.id,"joined",roomId);
    socket.join(roomId);

    const clients = Array.from(io.sockets.adapter.rooms.get(roomId) || [])
    console.log(clients)

    // tell the new joinee about existing clients inside the same room
    socket.emit('existing-users', clients);

    //existing clients get notified about the new client
    socket.broadcast.to(roomId).emit('user-joined', socket.id, roomId);
  })
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });

  socket.on('offer',({to,from,sdp})=>{
    io.to(to).emit('offer',{from,sdp});
  })

  socket.on('answer',({to,from,sdp})=>{
    io.to(to).emit('answer',{from,sdp});
  })

  socket.on('ice-candidate', ({to,from,candidate})=>{
    io.to(to).emit('ice-candidate',{from,candidate})
  })

  socket.on('message',message=>socket.broadcast.emit('message',message))
});

// Start server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running at https://localhost:${PORT}`);
});

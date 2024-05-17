const express = require("express");
const app = express();
const port = 3000;
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const http = require("http");

const server = http.createServer(app);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
  cors({
    origin: (origin, callback) => callback(null, true),
    credentials: true,
  })
);
app.use(express.json());

const io = require("socket.io")(server, {
  cors: {
    origin: (origin, callback) => callback(null, true),
    methods: ["GET", "POST"],
    transports: ["websocket", "polling"],

    credentials: true,
  },
  allowEIO3: true,
});

const connectString =
  "mongodb+srv://Shubham:mango1298@solution.pwqcbfl.mongodb.net/sc?retryWrites=true&w=majority";
// const connectString = "mongodb://localhost/sc";

mongoose.connect(connectString, {});

// Define Note schema
const ccpSchema = new mongoose.Schema({
  title: String,
  content: String,
});

// Define Note schema for notes it should only have string
const noteSchema = new mongoose.Schema({
  content: String,
});

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
});

const groupChatSchema = new mongoose.Schema({
  message: String,
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  time: { type: Date, default: Date.now },
});

const discussionSchema = new mongoose.Schema({
  topic: String,
  messages: [
    {
      content: String,
      sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
  ],
});

const Ccp = mongoose.model("ccp", ccpSchema);
const Note = mongoose.model("note", noteSchema);
const User = mongoose.model("User", userSchema);
const GroupChat = mongoose.model("GroupChat", groupChatSchema);
const Discussion = mongoose.model("Discussion", discussionSchema);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/ccp", async (req, res) => {
  try {
    const ccps = await Ccp.find();
    res.json(ccps);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error", error });
  }
});

app.post("/ccp", async (req, res) => {
  try {
    const { title, content } = req.body;
    const newCcp = new Ccp({ title, content });
    await newCcp.save();
    res.json(newCcp);
  } catch (error) {
    console.log("ERROR in post /ccp", error);
    res.status(500).json({ message: "Internal Server Error", error });
  }
});

app.get("/notes", async (req, res) => {
  try {
    const notes = await Note.find();
    const content = [];
    notes.forEach((note) => {
      content.push(note.content);
    });
    res.json(content);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error", error });
  }
});

app.post("/notes", async (req, res) => {
  try {
    const { content } = req.body;
    const newNote = new Note({ content });
    await newNote.save();
    res.json(newNote);
  } catch (error) {
    console.log("ERROR in post /notes", error);
    res.status(500).json({ message: "Internal Server Error", error });
  }
});

app.post("/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    res.json({ message: "User registered successfully", _id: newUser._id });
  } catch (error) {
    console.log("ERROR in post /signup", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    res.json({ _id: user._id });
  } catch (error) {
    console.log("ERROR in post /login", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/groupchat", async (req, res) => {
  const { message, userId } = req.body;

  if (!message || !userId) {
    return res.status(400).send("Missing fields");
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send("User not found");
    }

    let groupChat = new GroupChat({ message, sender: user._id });
    await groupChat.save();

    // Populate the 'sender' field with the user document
    groupChat = await GroupChat.findById(groupChat._id).populate("sender");

    res.status(201).send(groupChat);
  } catch (error) {
    console.log("ERROR in post /groupchat", error);
    res.status(500).send("Server error");
  }
});

app.get("/groupchat", async (req, res) => {
  try {
    const groupChats = await GroupChat.find().populate("sender");
    res.status(200).send(groupChats);
  } catch (error) {
    console.log("ERROR in get /groupchat", error);
    res.status(500).send("Server error");
  }
});

app.post("/discussion", async (req, res) => {
  const { topic } = req.body;

  const discussion = new Discussion({
    topic,
    messages: [],
  });

  try {
    await discussion.save();
    res.status(201).json(discussion);
  } catch (error) {
    console.log("ERROR in post /discussion", error);
    res.status(400).json({ message: error.message });
  }
});

// API to add a message to a discussion
app.post("/discussion/:id/message", async (req, res) => {
  const { id } = req.params;
  const { content, sender } = req.body;

  console.log("id", id);
  try {
    const discussion = await Discussion.findById(id);
    if (!discussion) {
      return res.status(404).json({ message: "Discussion not found" });
    }

    discussion.messages.push({ content, sender });
    console.log(discussion);
    await discussion.save();

    res.status(201).json(discussion);
  } catch (error) {
    console.log("ERROR in post /discussion/:id/message", error);
    res.status(400).json({ message: error.message });
  }
});

// API to get all discussions
app.get("/discussion", async (req, res) => {
  try {
    const discussions = await Discussion.find().populate("messages.sender");
    res.status(200).json(discussions);
  } catch (error) {
    console.log("ERROR in get /discussion", error);
    res.status(400).json({ message: error.message });
  }
});

io.on("connection", (socket) => {
  console.log("New client connected");

  socket.on("groupchat", async (data) => {
    const { message, userId } = data;

    if (!message || !userId) {
      return socket.emit("error", "Missing fields");
    }

    try {
      const user = await User.findById(userId);
      if (!user) {
        return socket.emit("error", "User not found");
      }

      let groupChat = new GroupChat({ message, sender: user._id });
      await groupChat.save();

      groupChat = await GroupChat.findById(groupChat._id).populate("sender");

      io.emit("groupchat", groupChat);
    } catch (error) {
      console.log("ERROR in groupchat", error);
      socket.emit("error", "Server error");
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

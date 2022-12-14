import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import joi from "joi";
import dayjs from "dayjs";
import pkg from "mongodb";
const { MongoClient, ObjectId } = pkg;

const app = express();

//configs
dotenv.config();
app.use(express.json());
app.use(cors());

setInterval(removeInactive, 15000);

//schemas
const participantsSchema = joi.object({
  name: joi.string().alphanum().required(),
  lastStatus: joi.number().required(),
});

const messagesSchema = joi.object({
  from: joi.string().required(),
  to: joi.string().required(),
  text: joi.string().required(),
  type: joi.any().valid("message", "private_message").required(),
  time: joi.string().required(),
});

const mongoClient = new MongoClient(process.env.MONGO_URI);

mongoClient.connect().then(() => console.log("conectado"));
mongoClient.connect().catch((err) => console.log(err));

let db = mongoClient.db("UOL");
let collectionPartipants = db.collection("participants");
let collectionMessages = db.collection("messages");

app.post("/participants", async (req, res) => {
  const { name } = req.body;
  const participant = {
    name,
    lastStatus: Date.now(),
  };

  const { error } = participantsSchema.validate(participant, {
    abortEarly: false,
  });

  if (error) {
    const errors = error.details.map((detail) => detail.message);
    res.send(errors);
    return;
  }

  const alreadySignUp = await collectionPartipants.findOne({ name: name });
  if (alreadySignUp) {
    res.status(409).send("Participante já existe");
    return;
  }

  try {
    await collectionPartipants.insertOne(participant);
    await collectionMessages.insertOne({
      from: name,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: dayjs(Date.now()).format("HH:mm:ss"),
    });
    res.sendStatus(201);
  } catch (err) {
    res.sendStatus(422);
  }
});

app.get("/participants", async (req, res) => {
  try {
    const findParticipants = await collectionPartipants.find().toArray();
    res.send(findParticipants);
  } catch (err) {
    res.sendStatus(err);
  }
});

app.post("/messages", async (req, res) => {
  const { to, text, type } = req.body;
  const { user } = req.headers;

  try {
    const alreadySignUp = await collectionPartipants.findOne({ name: user });
    if (!alreadySignUp) {
      res.status(422).send({ message: "Usuário não registrado" });
      return;
    }

    const message = {
      from: user,
      to,
      text,
      type,
      time: dayjs(Date.now()).format("HH:mm:ss"),
    };
    const { error } = messagesSchema.validate(message, { abortEarly: false });
    if (error) {
      const errors = error.details.map((detail) => detail.message);
      res.status(422).send(errors);
      return;
    }

    const response = await collectionMessages.insertOne(message);
    res.sendStatus(201);
  } catch (err) {
    res.sendStatus(422);
  }
});

app.get("/messages", async (req, res) => {
  const limit = parseInt(req.query.limit);
  const { user } = req.headers;
  try {
    const findMessageForOneUser = await collectionPartipants.findOne({
      name: user,
    });
    if (!findMessageForOneUser) {
      res.status(422).send({ message: "Usuário não registrado" });
      return;
    }
    let findMessages = await collectionMessages.find().toArray();
    if (limit) {
      const limitedMessages = [];
      for (let i = findMessages.length - 1; i >= 0; i--) {
        if (limitedMessages.length < limit) {
          if (
            findMessages[i].from === findMessageForOneUser.name ||
            findMessages[i].to === "Todos" ||
            findMessages[i].to === findMessageForOneUser.name
          ) {
            limitedMessages.unshift(findMessages[i]);
          }
        }
      }
      findMessages = limitedMessages;
    } else {
      findMessages = findMessages.filter((m, i) => {
        if (
          findMessages[i].from === findMessageForOneUser.name ||
          findMessages[i].to === "Todos" ||
          findMessages[i].to === findMessageForOneUser.name
        ) {
          return true;
        } else {
          return false;
        }
      });
    }
    res.send(findMessages);
  } catch (err) {
    res.sendStatus(500);
  }
});

app.post("/status", async (req, res) => {
  const { user } = req.headers;
  try {
    const findParticipant = await collectionPartipants.findOne({ name: user });
    if (!findParticipant) {
      res.sendStatus(404);
      return;
    }
    await collectionPartipants.updateOne(
      {
        name: user,
      },
      {
        $set: {
          lastStatus: Date.now(),
        },
      }
    );
    res.sendStatus(200);
    return;
  } catch (err) {
    res.status(404).send("erro");
  }
});

function removeInactive() {
  const findParticipants = collectionPartipants.find().toArray();

  findParticipants.then((p) => {
    p.forEach((u) => {
      const connected = (Date.now() - u.lastStatus) / 1000;
      if (connected > 10) {
        collectionPartipants.deleteOne({ name: u.name });
        collectionMessages.insertOne({
          from: u.name,
          to: "Todos",
          text: "sai da sala...",
          type: "status",
          time: dayjs(Date.now()).format("HH:mm:ss"),
        });
      }
    });
  });
  findParticipants.catch((err) => {
    console.log(err.status);
  });
}

app.delete("/messages/:id", async (req, res) => {
  const { id } = req.params;
  const { user } = req.headers;
  try {
    const message = await collectionMessages.findOne({ _id: ObjectId(id) });
    if (user !== message.from) {
      res.sendStatus(401);
    }
    if (!message) {
      res.sendStatus(404);
    }

    await collectionMessages.deleteOne({ _id: ObjectId(id) });
    res.status(200).send("Apagado");
  } catch (err) {
    res.sendStatus(500);
  }
});

app.put("/messages/:id", async (req, res) => {
  const { id } = req.params;
  const { user } = req.headers;
  try {
    const message = await collectionMessages.findOne({ _id: ObjectId(id) });
    if (user !== message.from) {
      res.sendStatus(401);
    }
    if (!message) {
      res.sendStatus(404);
    }

    await collectionMessages.updateOne(
      { _id: ObjectId(id) },
      { $set: req.body }
    );
    res.status(200).send("Apagado");
  } catch (err) {
    res.sendStatus(422);
  }
});

app.listen(process.env.PORT, () =>
  console.log(`Server running in port: ${process.env.PORT}`)
);

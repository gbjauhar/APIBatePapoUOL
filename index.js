import express from "express";
import dotenv from "dotenv";
import pkg from "mongodb";
const {MongoClient} = pkg
import joi from "joi"

const participantsSchema = joi.object({
    name: joi.string().required()
})

const app = express();
dotenv.config()
app.use(express.json());

const mongoClient = new MongoClient(process.env.MONGO_URI);

mongoClient.connect().then(() => console.log("conectado"));
mongoClient.connect().catch((err) => console.log(err))


let db = mongoClient.db("UOL")
let collectionPartipants = db.collection("participants")

app.post("/participants", async (req,res) => {
    const { name } = req.body

    const validation = participantsSchema.validate(req.body, { abortEarly: false })

    if(validation.error){
        const errors = validation.error.details.map((detail) => detail.message)
        res.send(errors)
        return
    }

    try{
       const response = await collectionPartipants.insertOne({name, lastStatus: Date.now()})
        res.status(201).send("ok")
        console.log(response)
    } catch (err){
        res.status(422).send(err)
    }

})



app.listen(process.env.PORT, () => console.log(`Server running in port: ${process.env.PORT}`))
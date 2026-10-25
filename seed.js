import dns from 'node:dns';

dns.setServers(['1.1.1.1', '8.8.8.8']);
import "dotenv/config";
import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "node:url";
import { User, Painting } from "./models.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(fs.readFileSync(path.join(here, "seedData", "seed.json"), "utf8"));

try {
  await mongoose.connect(process.env.MONGO_URI);
  for (const item of seed.paintings) {
    await Painting.findOneAndUpdate(
      { seedId: item.id },
      { $set: {
        seedId: item.id, title: item.title, artist: item.artist,
        description: item.description, price: item.price,
        imageUrl: item.imageUrl.replace(/^images\//, "/images/"),
        status: item.status
      } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  const studioEmail = seed.studioAccount.email.toLowerCase();
  await User.findOneAndUpdate(
    { email: studioEmail },
    { $set: {
      name: "Art Studio",
      email: studioEmail,
      passwordHash: await bcrypt.hash(seed.studioAccount.password, 12),
      role: "studio"
    } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log(`Seed complete: ${seed.paintings.length} paintings and studio account configured.`);
  console.log(`Studio login: ${studioEmail} / ${seed.studioAccount.password}`);
  console.log("Change the supplied studio password before using this app beyond local evaluation.");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}

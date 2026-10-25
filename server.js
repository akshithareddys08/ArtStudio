import dns from 'node:dns';

dns.setServers(['1.1.1.1', '8.8.8.8']);
import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { User, Painting, Order, Booking, PotteryRequest, Reservation } from "./models.js";
import { authenticate, allowRoles, ownRecord } from "./middleware.js";
import seed from "./seedData/seed.json" with { type: "json" };

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.get("/api/meta", (_req, res) => res.json({
  currency: seed.currency,
  potteryItems: seed.potteryItems,
  glazes: seed.glazes,
  mural: seed.mural
}));

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name?.trim() || !email?.trim() || !password || password.length < 8) {
      return res.status(400).json({ message: "Name, valid email and password of at least 8 characters are required" });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (await User.exists({ email: normalizedEmail })) return res.status(409).json({ message: "An account with this email already exists" });
    const user = await User.create({
      name: name.trim(), email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 12), role: "customer"
    });
    return res.status(201).json({ message: "Account created", user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "An account with this email already exists" });
    return res.status(500).json({ message: "Could not register account" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(String(req.body.password || ""), user.passwordHash))) {
      return res.status(401).json({ message: "Email or password is incorrect" });
    }
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "8h" });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch {
    res.status(500).json({ message: "Could not log in" });
  }
});

app.get("/api/auth/me", authenticate, (req, res) => res.json({ user: req.user }));

app.get("/api/paintings", authenticate, async (_req, res) => {
  try { res.json(await Painting.find().sort({ createdAt: -1 })); }
  catch { res.status(500).json({ message: "Could not load paintings" }); }
});

app.post("/api/paintings", authenticate, allowRoles("studio"), async (req, res) => {
  try {
    const { title, artist, description = "", price, imageUrl = "" } = req.body;
    if (!title?.trim() || !artist?.trim() || !Number.isFinite(Number(price)) || Number(price) < 0) {
      return res.status(400).json({ message: "Title, artist and a valid non-negative price are required" });
    }
    const painting = await Painting.create({ title: title.trim(), artist: artist.trim(), description, price: Number(price), imageUrl, status: "available" });
    res.status(201).json(painting);
  } catch { res.status(500).json({ message: "Could not add painting" }); }
});

app.patch("/api/paintings/:id", authenticate, allowRoles("studio"), async (req, res) => {
  try {
    const painting = await Painting.findOneAndUpdate(
      { _id: req.params.id, status: "available" },
      { $set: Object.fromEntries(["title", "artist", "description", "price", "imageUrl"].filter(k => req.body[k] !== undefined).map(k => [k, req.body[k]])) },
      { new: true, runValidators: true }
    );
    if (!painting) return res.status(404).json({ message: "Available painting not found" });
    res.json(painting);
  } catch { res.status(400).json({ message: "Invalid painting details" }); }
});

app.post("/api/orders", authenticate, allowRoles("customer"), async (req, res) => {
  const { paintingId } = req.body;
  if (!paintingId) return res.status(400).json({ message: "paintingId is required" });
  let painting;
  try {
    painting = await Painting.findOneAndUpdate(
      { _id: paintingId, status: "available" },
      { $set: { status: "sold" } }, { new: true }
    );
    if (!painting) return res.status(409).json({ message: "This painting is no longer available" });
    const order = await Order.create({
      customer: req.user.id, painting: painting.id,
      paintingTitle: painting.title, price: painting.price, status: "placed"
    });
    return res.status(201).json({ message: "Order placed successfully", order });
  } catch (error) {
    if (painting) await Painting.updateOne({ _id: painting.id, status: "sold" }, { $set: { status: "available" } }).catch(() => {});
    return res.status(500).json({ message: "Could not place order" });
  }
});

app.get("/api/orders/my", authenticate, allowRoles("customer"), async (req, res) => {
  try { res.json(await Order.find({ customer: req.user.id }).sort({ createdAt: -1 })); }
  catch { res.status(500).json({ message: "Could not load orders" }); }
});
app.get("/api/orders", authenticate, allowRoles("studio"), async (_req, res) => {
  try { res.json(await Order.find().populate("customer", "name email").sort({ createdAt: -1 })); }
  catch { res.status(500).json({ message: "Could not load orders" }); }
});
app.patch("/api/orders/:id/cancel", authenticate, allowRoles("customer"), async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, customer: req.user.id });
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status !== "placed") return res.status(400).json({ message: "Only placed orders can be cancelled" });
    order.status = "cancelled";
    await order.save();
    await Painting.updateOne({ _id: order.painting, status: "sold" }, { $set: { status: "available" } });
    res.json({ message: "Order cancelled; painting is available again", order });
  } catch { res.status(400).json({ message: "Could not cancel order" }); }
});

function dayOffset(dateString) {
  const target = new Date(`${dateString}T00:00:00.000Z`);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.round((target - today) / 86400000);
}
function validDateString(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

app.post("/api/bookings", authenticate, allowRoles("customer"), async (req, res) => {
  try {
    const { date, wallSize, address } = req.body;
    const size = Number(wallSize);
    if (!validDateString(date) || dayOffset(date) < 7 || dayOffset(date) > 90) {
      return res.status(400).json({ message: "Choose a valid date between 7 and 90 days from today" });
    }
    if (!Number.isFinite(size) || size < 10 || size > 500) return res.status(400).json({ message: "Wall size must be between 10 and 500 sq ft" });
    if (typeof address !== "string" || !address.trim()) return res.status(400).json({ message: "Address is required" });
    const ratePerSqFt = Number(seed.mural.ratePerSqFt);
    const booking = await Booking.create({
      customer: req.user.id, date, wallSize: size, address: address.trim(),
      ratePerSqFt, price: size * ratePerSqFt, status: "requested"
    });
    try {
      await Reservation.create({ date, booking: booking.id });
    } catch (e) {
      await Booking.deleteOne({ _id: booking.id });
      if (e.code === 11000) return res.status(409).json({ message: "That date has already been booked" });
      throw e;
    }
    res.status(201).json({ message: "Booking request submitted", booking });
  } catch { res.status(500).json({ message: "Could not create booking" }); }
});

app.get("/api/bookings/my", authenticate, allowRoles("customer"), async (req, res) => {
  try { res.json(await Booking.find({ customer: req.user.id }).sort({ date: 1 })); }
  catch { res.status(500).json({ message: "Could not load bookings" }); }
});
app.get("/api/bookings", authenticate, allowRoles("studio"), async (_req, res) => {
  try { res.json(await Booking.find().populate("customer", "name email").sort({ date: 1 })); }
  catch { res.status(500).json({ message: "Could not load bookings" }); }
});
app.patch("/api/bookings/:id/status", authenticate, allowRoles("studio"), async (req, res) => {
  const { status } = req.body;
  if (!["confirmed", "declined"].includes(status)) return res.status(400).json({ message: "Status must be confirmed or declined" });
  try {
    const booking = await Booking.findOneAndUpdate(
      { _id: req.params.id, status: "requested" }, { $set: { status } }, { new: true }
    );
    if (!booking) return res.status(404).json({ message: "Requested booking not found" });
    if (status === "declined") await Reservation.deleteOne({ booking: booking.id });
    res.json({ message: `Booking ${status}`, booking });
  } catch { res.status(400).json({ message: "Could not update booking" }); }
});
app.patch("/api/bookings/:id/cancel", authenticate, allowRoles("customer"), async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, customer: req.user.id });
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (!["requested", "confirmed"].includes(booking.status)) return res.status(400).json({ message: "This booking cannot be cancelled" });
    if (dayOffset(booking.date) < 3) return res.status(400).json({ message: "Bookings can only be cancelled at least 3 days before the date" });
    booking.status = "cancelled";
    await booking.save();
    await Reservation.deleteOne({ booking: booking.id });
    res.json({ message: "Booking cancelled", booking });
  } catch { res.status(400).json({ message: "Could not cancel booking" }); }
});

app.post("/api/pottery", authenticate, allowRoles("customer"), async (req, res) => {
  try {
    const { itemId, glazeId, quantity, neededBy } = req.body;
    const item = seed.potteryItems.find(x => x.id === itemId);
    const glaze = seed.glazes.find(x => x.id === glazeId);
    const qty = Number(quantity);
    if (!item || !glaze) return res.status(400).json({ message: "Choose a valid pottery item and glaze" });
    if (!Number.isInteger(qty) || qty < 1 || qty > 12) return res.status(400).json({ message: "Quantity must be between 1 and 12" });
    if (!validDateString(neededBy) || dayOffset(neededBy) < 14) return res.status(400).json({ message: "Needed-by date must be at least 14 days away" });
    const request = await PotteryRequest.create({
      customer: req.user.id, itemId, itemName: item.name, glazeId,
      glazeName: glaze.name, quantity: qty, neededBy, status: "requested"
    });
    res.status(201).json({ message: "Pottery request submitted", request });
  } catch { res.status(500).json({ message: "Could not submit pottery request" }); }
});
app.get("/api/pottery/my", authenticate, allowRoles("customer"), async (req, res) => {
  try { res.json(await PotteryRequest.find({ customer: req.user.id }).sort({ createdAt: -1 })); }
  catch { res.status(500).json({ message: "Could not load pottery requests" }); }
});
app.get("/api/pottery", authenticate, allowRoles("studio"), async (_req, res) => {
  try { res.json(await PotteryRequest.find().populate("customer", "name email").sort({ createdAt: -1 })); }
  catch { res.status(500).json({ message: "Could not load pottery requests" }); }
});
app.patch("/api/pottery/:id", authenticate, allowRoles("customer"), async (req, res) => {
  try {
    const request = await PotteryRequest.findOne({ _id: req.params.id, customer: req.user.id });
    if (!request) return res.status(404).json({ message: "Pottery request not found" });
    if (request.status !== "requested") return res.status(400).json({ message: "Only requested pottery items can be edited" });
    const itemId = req.body.itemId ?? request.itemId;
    const glazeId = req.body.glazeId ?? request.glazeId;
    const qty = req.body.quantity === undefined ? request.quantity : Number(req.body.quantity);
    const neededBy = req.body.neededBy ?? request.neededBy;
    const item = seed.potteryItems.find(x => x.id === itemId);
    const glaze = seed.glazes.find(x => x.id === glazeId);
    if (!item || !glaze || !Number.isInteger(qty) || qty < 1 || qty > 12 || !validDateString(neededBy) || dayOffset(neededBy) < 14) {
      return res.status(400).json({ message: "Check item, glaze, quantity and needed-by date" });
    }
    Object.assign(request, { itemId, itemName: item.name, glazeId, glazeName: glaze.name, quantity: qty, neededBy });
    await request.save();
    res.json({ message: "Pottery request updated", request });
  } catch { res.status(400).json({ message: "Could not update pottery request" }); }
});
app.patch("/api/pottery/:id/status", authenticate, allowRoles("studio"), async (req, res) => {
  const { status } = req.body;
  if (!["accepted", "declined"].includes(status)) return res.status(400).json({ message: "Status must be accepted or declined" });
  try {
    const request = await PotteryRequest.findOneAndUpdate(
      { _id: req.params.id, status: "requested" }, { $set: { status } }, { new: true }
    );
    if (!request) return res.status(404).json({ message: "Requested pottery item not found" });
    res.json({ message: `Pottery request ${status}`, request });
  } catch { res.status(400).json({ message: "Could not update pottery request" }); }
});
app.patch("/api/pottery/:id/cancel", authenticate, allowRoles("customer"), async (req, res) => {
  try {
    const request = await PotteryRequest.findOne({ _id: req.params.id, customer: req.user.id });
    if (!request) return res.status(404).json({ message: "Pottery request not found" });
    if (request.status !== "requested") return res.status(400).json({ message: "Only requested pottery items can be cancelled" });
    request.status = "cancelled";
    await request.save();
    res.json({ message: "Pottery request cancelled", request });
  } catch { res.status(400).json({ message: "Could not cancel pottery request" }); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Unexpected server error" });
});

const port = Number(process.env.PORT || 5000);
if (!process.env.MONGO_URI || !process.env.JWT_SECRET) {
  console.error("Set MONGO_URI and JWT_SECRET in backend/.env before starting.");
  process.exit(1);
}
try {
  await mongoose.connect(process.env.MONGO_URI);
  await Reservation.syncIndexes();
  app.listen(port, () => console.log(`Art Studio API running on http://localhost:${port}`));
} catch (error) {
  console.error("Database connection failed:", error.message);
  process.exit(1);
}

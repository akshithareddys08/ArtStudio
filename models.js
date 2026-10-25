import mongoose from "mongoose";

const { Schema, model } = mongoose;

const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["customer", "studio"], default: "customer" }
}, { timestamps: true });

const paintingSchema = new Schema({
  seedId: { type: String, unique: true, sparse: true },
  title: { type: String, required: true },
  artist: { type: String, required: true },
  description: { type: String, default: "" },
  price: { type: Number, required: true, min: 0 },
  imageUrl: { type: String, default: "" },
  status: { type: String, enum: ["available", "sold"], default: "available" }
}, { timestamps: true });

const orderSchema = new Schema({
  customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
  painting: { type: Schema.Types.ObjectId, ref: "Painting", required: true },
  paintingTitle: { type: String, required: true },
  price: { type: Number, required: true },
  status: { type: String, enum: ["placed", "cancelled"], default: "placed" }
}, { timestamps: true });

const bookingSchema = new Schema({
  customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
  date: { type: String, required: true },
  wallSize: { type: Number, required: true, min: 10, max: 500 },
  address: { type: String, required: true, trim: true },
  ratePerSqFt: { type: Number, required: true },
  price: { type: Number, required: true },
  status: { type: String, enum: ["requested", "confirmed", "declined", "cancelled"], default: "requested" }
}, { timestamps: true });

const potteryRequestSchema = new Schema({
  customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
  itemId: { type: String, required: true },
  itemName: { type: String, required: true },
  glazeId: { type: String, required: true },
  glazeName: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1, max: 12 },
  neededBy: { type: String, required: true },
  status: { type: String, enum: ["requested", "accepted", "declined", "cancelled"], default: "requested" }
}, { timestamps: true });

export const User = model("User", userSchema);
export const Painting = model("Painting", paintingSchema);
export const Order = model("Order", orderSchema);
export const Booking = model("Booking", bookingSchema);
export const PotteryRequest = model("PotteryRequest", potteryRequestSchema);
const reservationSchema = new Schema({
  date: { type: String, required: true, unique: true },
  booking: { type: Schema.Types.ObjectId, ref: "Booking", required: true, unique: true }
}, { timestamps: true });
export const Reservation = model("Reservation", reservationSchema);

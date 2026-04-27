import mongoose, { Schema, type InferSchemaType } from "mongoose";

const locationSchema = new Schema(
  {
    imei: { type: String, required: true, trim: true },
    /** @deprecated legacy field; prefer `mobile` */
    sim: { type: String, default: "", trim: true },
    mobile: { type: String, default: "", trim: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    city: { type: String, default: "" },
    ip: { type: String, default: "" },
    accuracy: { type: Number },
    timestamp: { type: Date, default: Date.now },
    userAgent: { type: String, default: "" },
  },
  { versionKey: false },
);

export type LocationDoc = InferSchemaType<typeof locationSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Location =
  mongoose.models.Location ??
  mongoose.model("Location", locationSchema);

export default Location;

import mongoose, { Schema } from "mongoose";

export interface ICounter {
  _id: string;
  sequence_value: number;
}

const CounterSchema: Schema = new Schema({
  _id: { type: String, required: true },
  sequence_value: { type: Number, default: 0 }
});

export const CounterModel = mongoose.model<ICounter>("Counter", CounterSchema);

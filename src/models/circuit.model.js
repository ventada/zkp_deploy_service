"use strict";

import mongoose from "mongoose";

const ArtifactSchema = new mongoose.Schema(
  {
    wasm: { type: String },
    zkey: { type: String },
    vkey: { type: String },
    verifier: { type: String },
    deployment: {
      address: { type: String },
      chainId: { type: Number },
      txHash: { type: String },
      blockNumber: { type: Number },
      network: { type: String },
    },
  },
  { _id: false }
);

const CircuitSchema = new mongoose.Schema(
  {
    circuit_hash: { type: String, required: true, unique: true, index: true },
    template: { type: String, required: true, index: true },
    params: { type: mongoose.Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ["pending", "ready", "failed"],
      default: "pending",
      index: true,
    },
    artifacts: { type: ArtifactSchema, default: null },
    error: { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const Circuit =
  mongoose.models.Circuit || mongoose.model("Circuit", CircuitSchema);

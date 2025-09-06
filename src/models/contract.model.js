import mongoose from "mongoose";

const contractSchema = new mongoose.Schema(
  {
    circuitId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    sourceUrl: {
      type: String,
    },
    artifacts: {
      wasm: {
        type: String,
        default: "",
      },
      zkey: {
        type: String,
        default: "",
      },
      vkey: {
        type: String,
        default: "",
      },
      verifier: {
        type: String,
        default: "",
      },
    },
    constructorArgs: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    status: {
      type: String,
      enum: ["pending", "deployed", "failed"],
      default: "pending",
    },
    contractAddress: {
      type: String,
      default: null,
    },
    txHash: {
      type: String,
      default: null,
    },
    error: {
      type: String,
      default: null,
    },
    deployedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
contractSchema.index({ status: 1, createdAt: -1 });

const Contract = mongoose.model("Contract", contractSchema);

export default Contract;

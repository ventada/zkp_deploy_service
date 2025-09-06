import deployQueue from "./deploy.queue.js";
import DeployService from "../services/deploy.service.js";
import mongoose from "mongoose";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

// Initialize deployment service
const deployService = new DeployService();

// Process deployment jobs
deployQueue.process("deploy-contract", async (job) => {
  const { circuitId, jobType, contractAddress } = job.data;

  console.log(
    `Processing deployment job for circuitId: ${circuitId}, jobType: ${
      jobType || "default"
    }`
  );

  try {
    // Update job progress
    await job.progress(10);

    let result;

    // Check if this is a verify contract deployment
    if (jobType === "deploy-verify-contract") {
      console.log(
        `Processing VerifyAtBlockChain deployment with groth16VerifierAddress: ${contractAddress}`
      );
      result = await deployService.deployVerifyAtBlockChainContract(
        circuitId,
        contractAddress
      );
    } else {
      // Regular contract deployment
      result = await deployService.deployContractByCircuitId(circuitId);
    }

    // Update job progress to 100%
    await job.progress(100);

    console.log(`Deployment job completed for circuitId: ${circuitId}`);

    return {
      success: true,
      circuitId,
      result,
    };
  } catch (error) {
    console.error(
      `Deployment job failed for circuitId: ${circuitId}:`,
      error.message
    );

    // Update job progress to indicate failure
    await job.progress(0);

    throw error;
  }
});

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  console.log(`Received ${signal}. Starting graceful shutdown...`);

  try {
    // Close the queue
    await deployQueue.close();
    console.log("Queue closed");

    // Close MongoDB connection
    await mongoose.connection.close();
    console.log("MongoDB connection closed");

    // Cleanup deployment service
    await deployService.cleanup();
    console.log("Deployment service cleaned up");

    process.exit(0);
  } catch (error) {
    console.error("Error during graceful shutdown:", error);
    process.exit(1);
  }
};

// Handle process signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown("unhandledRejection");
});

// Start the worker
const startWorker = async () => {
  try {
    console.log("Starting deployment worker...");

    // Connect to MongoDB
    await connectDB();

    console.log("Deployment worker started successfully");
    console.log("Waiting for jobs...");
  } catch (error) {
    console.error("Error starting worker:", error);
    process.exit(1);
  }
};

// Start the worker if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("ruuned?");

  startWorker();
} else {
  console.log("run without meta.url");

  startWorker();
}

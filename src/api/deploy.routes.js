import express from "express";
import {
  addDeploymentJob,
  getJobStatus,
  getQueueStats,
} from "../queue/deploy.queue.js";
import Contract from "../models/contract.model.js";
import { Circuit } from "../models/circuit.model.js";
import DeployService from "../services/deploy.service.js";
const router = express.Router();

// POST /deploy - Enqueue a deployment job
router.post("/deploy", async (req, res) => {
  try {
    const { circuitId } = req.body;

    // Validate input
    if (!circuitId) {
      return res.status(400).json({
        success: false,
        error: "circuitId is required",
      });
    }

    // Check if contract exists in MongoDB
    const circuit = await Circuit.findOne({ _id: circuitId });
    if (!circuit) {
      return res.status(404).json({
        success: false,
        error: `Contract with circuitId ${circuitId} not found`,
      });
    }

    const contract = await Contract.findOne({ circuitId });

    if (!contract) {
      // Create a new contract document if it doesn't exist
      await Contract.create({
        circuitId,
        name: circuit.template, // or use another field if appropriate
        sourceUrl: "", // You may want to fill this with a real URL if available
        artifacts: {
          wasm: circuit.artifacts?.wasm || "",
          zkey: circuit.artifacts?.zkey || "",
          vkey: circuit.artifacts?.vkey || "",
          verifier: circuit.artifacts?.verifier || "",
        },
        constructorArgs: [],
        status: "pending",
      });
    }

    if (contract) {
      // Check if contract is already being processed or deployed
      if (contract.status === "pending") {
        return res.status(409).json({
          success: false,
          error: `Contract with circuitId ${circuitId} is already being processed`,
        });
      }

      if (contract.status === "deployed") {
        return res.status(409).json({
          success: false,
          error: `Contract with circuitId ${circuitId} is already deployed at ${contract.contractAddress}`,
        });
      }
    }

    // Add job to queue
    const jobResult = await addDeploymentJob(circuitId);

    res.status(200).json({
      success: true,
      message: "Deployment job queued successfully",
      data: jobResult,
    });
  } catch (error) {
    console.error("Error in /deploy endpoint:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

// GET /deploy/status/:jobId - Get job status
router.get("/deploy/status/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: "jobId is required",
      });
    }

    const jobStatus = await getJobStatus(jobId);

    res.status(200).json({
      success: true,
      data: jobStatus,
    });
  } catch (error) {
    console.error("Error in /deploy/status endpoint:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

// GET /deploy/contract/:circuitId - Get contract status
router.get("/deploy/contract/:circuitId", async (req, res) => {
  try {
    const { circuitId } = req.params;

    if (!circuitId) {
      return res.status(400).json({
        success: false,
        error: "circuitId is required",
      });
    }

    const contract = await Contract.findOne({ circuitId });

    if (!contract) {
      return res.status(404).json({
        success: false,
        error: `Contract with circuitId ${circuitId} not found`,
      });
    }

    res.status(200).json({
      success: true,
      data: contract,
    });
  } catch (error) {
    console.error("Error in /deploy/contract endpoint:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

// GET /deploy/queue/stats - Get queue statistics
router.get("/deploy/queue/stats", async (req, res) => {
  try {
    const stats = await getQueueStats();

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Error in /deploy/queue/stats endpoint:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

// GET /deploy/contracts - List all contracts
router.get("/deploy/contracts", async (req, res) => {
  try {
    const { status, limit = 50, page = 1 } = req.query;

    const query = {};
    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const contracts = await Contract.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Contract.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        contracts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error("Error in /deploy/contracts endpoint:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

// POST /deploy/contracts - Create a new contract (for testing)
router.post("/deploy/contracts", async (req, res) => {
  try {
    const {
      circuitId,
      name,
      sourceUrl,
      artifacts,
      constructorArgs = [],
    } = req.body;

    // Validate required fields
    if (!circuitId || !name) {
      return res.status(400).json({
        success: false,
        error: "circuitId and name are required",
      });
    }

    // Validate artifacts if provided
    if (artifacts) {
      if (
        !artifacts.wasm ||
        !artifacts.zkey ||
        !artifacts.vkey ||
        !artifacts.verifier
      ) {
        return res.status(400).json({
          success: false,
          error: "artifacts must include wasm, zkey, vkey, and verifier fields",
        });
      }
    } else if (!sourceUrl) {
      return res.status(400).json({
        success: false,
        error: "Either artifacts or sourceUrl is required",
      });
    }

    // Check if contract already exists
    const existingContract = await Contract.findOne({ circuitId });
    if (existingContract) {
      return res.status(409).json({
        success: false,
        error: `Contract with circuitId ${circuitId} already exists`,
      });
    }

    // Create new contract
    const contractData = {
      circuitId,
      name,
      constructorArgs,
      status: "pending",
    };

    // Add artifacts if provided
    if (artifacts) {
      contractData.artifacts = artifacts;
    }

    // Add sourceUrl if provided (for fallback)
    if (sourceUrl) {
      contractData.sourceUrl = sourceUrl;
    }

    const contract = new Contract(contractData);
    await contract.save();

    res.status(201).json({
      success: true,
      message: "Contract created successfully",
      data: contract,
    });
  } catch (error) {
    console.error("Error in /deploy/contracts endpoint:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

router.get("/deploy/contracts/list", async (req, res) => {
  const deployService = new DeployService();
  try {
    const contracts = await deployService.getListOfContracts();
    res.status(200).json({
      success: true,
      data: contracts,
    });
  } catch (error) {
    console.error("Error in /deploy/contracts/list endpoint:", error);
  }
});

// POST /deploy/verify-contract - Deploy VerifyAtBlockChain contract
router.post("/deploy/verify-contract", async (req, res) => {
  try {
    const { contractAddress } = req.body;

    // Validate input
    if (!contractAddress) {
      return res.status(400).json({
        success: false,
        error: "contractAddress is required",
      });
    }

    // Validate Ethereum address format
    if (!contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        success: false,
        error: "Invalid Ethereum address format",
      });
    }

    // Create a unique identifier for this verify contract deployment
    const verifyContractId = `verify-${contractAddress.toLowerCase()}-${Date.now()}`;

    // Create a new contract document for the VerifyAtBlockChain contract
    await Contract.create({
      circuitId: verifyContractId,
      name: "VerifyAtBlockChain",
      sourceUrl: "", // We'll use embedded source code
      artifacts: {
        wasm: "", // Not applicable for this contract
        zkey: "", // Not applicable for this contract
        vkey: "", // Not applicable for this contract
        verifier: "embedded", // Use embedded source code
      },
      constructorArgs: [contractAddress],
      status: "pending",
    });

    // Add job to queue with a special job type
    const jobResult = await addDeploymentJob(verifyContractId, {
      jobType: "deploy-verify-contract",
      contractAddress,
    });

    res.status(200).json({
      success: true,
      message: "VerifyAtBlockChain deployment job queued successfully",
      data: {
        ...jobResult,
        contractAddress,
        verifyContractId,
      },
    });
  } catch (error) {
    console.error("Error in /deploy/verify-contract endpoint:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

export default router;

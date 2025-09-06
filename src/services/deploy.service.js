import { ethers } from "ethers";
import solc from "solc";
import axios from "axios";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import Contract from "../models/contract.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DeployService {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
    this.tempDir = path.join(__dirname, "../../temp");

    // Initialize S3 client
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION,
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true, // Required for some S3-compatible services
    });

    // Ensure temp directory exists
    fs.ensureDirSync(this.tempDir);
  }

  async downloadContractFromS3(s3Key, circuitId) {
    try {
      console.log(`Downloading contract from S3: ${s3Key}`);

      const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: s3Key,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new Error("No content received from S3");
      }

      // Convert stream to string
      const contractContent = await response.Body.transformToString();

      const fileName = `${circuitId}.sol`;
      const filePath = path.join(this.tempDir, fileName);

      await fs.writeFile(filePath, contractContent);
      console.log(`Contract downloaded to: ${filePath}`);

      return filePath;
    } catch (error) {
      console.error("Error downloading contract from S3:", error.message);
      throw new Error(`Failed to download contract from S3: ${error.message}`);
    }
  }

  async downloadContract(sourceUrl, circuitId) {
    try {
      console.log(`Downloading contract from: ${sourceUrl}`);

      const response = await axios.get(sourceUrl);
      const contractContent = response.data;

      const fileName = `${circuitId}.sol`;
      const filePath = path.join(this.tempDir, fileName);

      await fs.writeFile(filePath, contractContent);
      console.log(`Contract downloaded to: ${filePath}`);

      return filePath;
    } catch (error) {
      console.error("Error downloading contract:", error.message);
      throw new Error(`Failed to download contract: ${error.message}`);
    }
  }

  async compileContract(filePath, expectedContractName = null) {
    try {
      console.log(`Compiling contract from: ${filePath}`);
      if (expectedContractName) {
        console.log(`Expected contract name: ${expectedContractName}`);
      }

      const source = await fs.readFile(filePath, "utf8");

      const input = {
        language: "Solidity",
        sources: {
          [path.basename(filePath)]: {
            content: source,
          },
        },
        settings: {
          outputSelection: {
            "*": {
              "*": ["*"],
            },
          },
        },
      };

      const output = JSON.parse(solc.compile(JSON.stringify(input)));

      if (output.errors) {
        const errors = output.errors.filter(
          (error) => error.severity === "error"
        );
        if (errors.length > 0) {
          throw new Error(
            `Compilation errors: ${errors
              .map((e) => e.formattedMessage)
              .join(", ")}`
          );
        }
      }

      const contracts = output.contracts[path.basename(filePath)];

      if (!contracts || Object.keys(contracts).length === 0) {
        throw new Error("No contracts found in compiled output");
      }

      // Log available contracts for debugging
      const availableContracts = Object.keys(contracts);
      console.log(
        "Available contracts in compiled output:",
        availableContracts
      );

      let contract;
      let contractName;

      if (expectedContractName && contracts[expectedContractName]) {
        // Use the expected contract name if it exists
        contract = contracts[expectedContractName];
        contractName = expectedContractName;
        console.log(`Using expected contract name: ${contractName}`);
      } else {
        // Auto-detect the first contract
        contractName = availableContracts[0];
        contract = contracts[contractName];
        console.log(`Auto-detected contract name: ${contractName}`);

        if (expectedContractName) {
          console.log(
            `Warning: Expected contract '${expectedContractName}' not found, using '${contractName}' instead`
          );
        }
      }

      if (!contract) {
        throw new Error(
          `No valid contract found. Available contracts: ${availableContracts.join(
            ", "
          )}`
        );
      }

      console.log(`Contract compiled successfully: ${contractName}`);

      return {
        bytecode: contract.evm.bytecode.object,
        abi: contract.abi,
        contractName: contractName, // Return the actual contract name
      };
    } catch (error) {
      console.error("Error compiling contract:", error.message);
      throw new Error(`Compilation failed: ${error.message}`);
    }
  }

  async deployContract(bytecode, abi, constructorArgs = []) {
    try {
      console.log("Deploying contract...");

      const factory = new ethers.ContractFactory(abi, bytecode, this.wallet);

      const contract = await factory.deploy(...constructorArgs);
      await contract.waitForDeployment();

      const contractAddress = await contract.getAddress();
      const txHash = contract.deploymentTransaction().hash;

      console.log(`Contract deployed successfully at: ${contractAddress}`);
      console.log(`Transaction hash: ${txHash}`);

      return {
        contractAddress,
        txHash,
      };
    } catch (error) {
      console.error("Error deploying contract:", error.message);
      throw new Error(`Deployment failed: ${error.message}`);
    }
  }

  async deployContractByCircuitId(circuitId) {
    let tempFilePath = null;

    try {
      // Fetch contract metadata from MongoDB
      const contract = await Contract.findOne({ circuitId });

      if (!contract) {
        throw new Error(`Contract with circuitId ${circuitId} not found`);
      }

      console.log(`Starting deployment for circuitId: ${circuitId}`);

      // Update status to pending
      await Contract.findByIdAndUpdate(contract._id, {
        status: "pending",
        error: null,
      });

      // Download contract from S3 using artifacts.verifier
      if (contract.artifacts && contract.artifacts.verifier) {
        tempFilePath = await this.downloadContractFromS3(
          contract.artifacts.verifier,
          circuitId
        );
      } else {
        // Fallback to sourceUrl if artifacts not available
        tempFilePath = await this.downloadContract(
          contract.sourceUrl,
          circuitId
        );
      }

      // Compile contract (pass contract.name as expected name, but allow auto-detection)
      const { bytecode, abi, contractName } = await this.compileContract(
        tempFilePath,
        contract.name
      );

      // Deploy contract
      const { contractAddress, txHash } = await this.deployContract(
        bytecode,
        abi,
        contract.constructorArgs
      );

      // Update MongoDB with success and the actual contract name
      await Contract.findByIdAndUpdate(contract._id, {
        status: "deployed",
        contractAddress,
        txHash,
        deployedAt: new Date(),
        error: null,
        name: contractName, // Update with the actual contract name
      });

      console.log(
        `Deployment completed successfully for circuitId: ${circuitId}`
      );

      return {
        circuitId,
        status: "deployed",
        contractAddress,
        txHash,
        contractName,
      };
    } catch (error) {
      console.error(
        `Deployment failed for circuitId ${circuitId}:`,
        error.message
      );

      // Update MongoDB with error
      await Contract.findOneAndUpdate(
        { circuitId },
        {
          status: "failed",
          error: error.message,
        }
      );

      throw error;
    } finally {
      // Clean up temporary file
      if (tempFilePath && (await fs.pathExists(tempFilePath))) {
        await fs.remove(tempFilePath);
        console.log("Temporary file cleaned up");
      }
    }
  }

  async cleanup() {
    try {
      await fs.emptyDir(this.tempDir);
      console.log("Temp directory cleaned up");
    } catch (error) {
      console.error("Error cleaning up temp directory:", error.message);
    }
  }

  async getListOfContracts() {
    try {
      const contracts = await Contract.find({});
      return contracts;
    } catch (error) {
      console.error("Error getting list of contracts:", error.message);
    }
  }

  async deployVerifyAtBlockChainContract(circuitId, groth16VerifierAddress) {
    let tempFilePath = null;

    try {
      // Fetch contract metadata from MongoDB
      const contract = await Contract.findOne({ circuitId });

      if (!contract) {
        throw new Error(`Contract with circuitId ${circuitId} not found`);
      }

      console.log(
        `Starting VerifyAtBlockChain deployment for circuitId: ${circuitId}`
      );
      console.log(`Groth16Verifier address: ${groth16VerifierAddress}`);

      // Update status to pending
      await Contract.findByIdAndUpdate(contract._id, {
        status: "pending",
        error: null,
      });

      // Create the VerifyAtBlockChain contract source code
      const contractSource = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

/// @notice Interface for Groth16 Verifier
interface IGroth16Verifier {
    function verifyProof(
        uint[2] calldata _pA,        // G1 proof element A
        uint[2][2] calldata _pB,     // G2 proof element B
        uint[2] calldata _pC,        // G1 proof element C
        uint[1] calldata _pubSignals // Public inputs (fixed length = 1 here)
    ) external view returns (bool);
}

contract VerifyAtBlockChain {
    address public s_groth16VerifierAddress;

    event ProofResult(bool result);

    constructor(address groth16VerifierAddress) {
        s_groth16VerifierAddress = groth16VerifierAddress;
    }

    /// @notice Submit a Groth16 proof to the verifier contract
    /// @dev Passes proof data (A, B, C) and public inputs to verifier
    function submitProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[1] calldata _pubSignals
    ) public returns (bool) {
        bool result = IGroth16Verifier(s_groth16VerifierAddress).verifyProof(
            _pA,
            _pB,
            _pC,
            _pubSignals
        );
        emit ProofResult(result);
        return result;
    }
}`;

      // Write contract to temporary file
      const fileName = `${circuitId}.sol`;
      tempFilePath = path.join(this.tempDir, fileName);
      await fs.writeFile(tempFilePath, contractSource);
      console.log(`VerifyAtBlockChain contract written to: ${tempFilePath}`);

      // Compile contract
      const { bytecode, abi, contractName } = await this.compileContract(
        tempFilePath,
        "VerifyAtBlockChain"
      );

      // Deploy contract with the groth16VerifierAddress as constructor argument
      const { contractAddress, txHash } = await this.deployContract(
        bytecode,
        abi,
        [groth16VerifierAddress]
      );

      // Update MongoDB with success
      await Contract.findByIdAndUpdate(contract._id, {
        status: "deployed",
        contractAddress,
        txHash,
        deployedAt: new Date(),
        error: null,
        name: contractName,
      });

      console.log(
        `VerifyAtBlockChain deployment completed successfully for circuitId: ${circuitId}`
      );

      return {
        circuitId,
        status: "deployed",
        contractAddress,
        txHash,
        contractName,
        groth16VerifierAddress,
      };
    } catch (error) {
      console.error(
        `VerifyAtBlockChain deployment failed for circuitId ${circuitId}:`,
        error.message
      );

      // Update MongoDB with error
      await Contract.findOneAndUpdate(
        { circuitId },
        {
          status: "failed",
          error: error.message,
        }
      );

      throw error;
    } finally {
      // Clean up temporary file
      if (tempFilePath && (await fs.pathExists(tempFilePath))) {
        await fs.remove(tempFilePath);
        console.log("Temporary VerifyAtBlockChain file cleaned up");
      }
    }
  }
}

export default DeployService;

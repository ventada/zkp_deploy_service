import axios from "axios";

const API_BASE = "http://localhost:3000/api";

// Test configuration with artifacts
const testContract = {
  circuitId: "test_circuit_001",
  name: "Verifier",
  artifacts: {
    wasm: "circuits/689eed072cea46605b56eaf9/circuit.wasm",
    zkey: "circuits/689eed072cea46605b56eaf9/circuit_final.zkey",
    vkey: "circuits/689eed072cea46605b56eaf9/verification_key.json",
    verifier: "circuits/689eed072cea46605b56eaf9/verifier.sol",
  },
  constructorArgs: [],
};

async function testAPI() {
  try {
    console.log("🚀 Testing Smart Contract Deployment API\n");

    // 1. Create a test contract
    console.log("1. Creating test contract...");
    const createResponse = await axios.post(
      `${API_BASE}/deploy/contracts`,
      testContract
    );
    console.log("✅ Contract created:", createResponse.data.data.circuitId);
    console.log("");

    // 2. Deploy the contract
    console.log("2. Deploying contract...");
    const deployResponse = await axios.post(`${API_BASE}/deploy`, {
      circuitId: testContract.circuitId,
    });
    const jobId = deployResponse.data.data.jobId;
    console.log("✅ Deployment job queued. Job ID:", jobId);
    console.log("");

    // 3. Check job status
    console.log("3. Checking job status...");
    let jobStatus;
    let attempts = 0;
    const maxAttempts = 30; // Wait up to 30 seconds

    while (attempts < maxAttempts) {
      const statusResponse = await axios.get(
        `${API_BASE}/deploy/status/${jobId}`
      );
      jobStatus = statusResponse.data.data;

      console.log(
        `   Status: ${jobStatus.status} (attempt ${
          attempts + 1
        }/${maxAttempts})`
      );

      if (jobStatus.status === "completed" || jobStatus.status === "failed") {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
      attempts++;
    }

    if (jobStatus.status === "completed") {
      console.log("✅ Job completed successfully!");
      console.log("   Result:", jobStatus.data.result);
    } else if (jobStatus.status === "failed") {
      console.log("❌ Job failed");
      console.log("   Error:", jobStatus.failedReason);
    } else {
      console.log("⏰ Job still running after timeout");
    }
    console.log("");

    // 4. Get contract status
    console.log("4. Getting contract status...");
    const contractResponse = await axios.get(
      `${API_BASE}/deploy/contract/${testContract.circuitId}`
    );
    const contract = contractResponse.data.data;
    console.log("✅ Contract status:", contract.status);
    if (contract.contractAddress) {
      console.log("   Contract Address:", contract.contractAddress);
      console.log("   Transaction Hash:", contract.txHash);
    }
    console.log("");

    // 5. Get queue statistics
    console.log("5. Getting queue statistics...");
    const statsResponse = await axios.get(`${API_BASE}/deploy/queue/stats`);
    const stats = statsResponse.data.data;
    console.log("✅ Queue stats:", stats);
    console.log("");

    // 6. List contracts
    console.log("6. Listing contracts...");
    const contractsResponse = await axios.get(
      `${API_BASE}/deploy/contracts?limit=5`
    );
    const contracts = contractsResponse.data.data;
    console.log("✅ Found", contracts.pagination.total, "contracts");
    console.log("   Recent contracts:");
    contracts.contracts.slice(0, 3).forEach((contract) => {
      console.log(
        `   - ${contract.circuitId}: ${contract.status} (${contract.name})`
      );
    });
  } catch (error) {
    console.error("❌ Test failed:", error.response?.data || error.message);

    if (error.response?.status === 404) {
      console.log("\n💡 Make sure the API server is running: npm start");
    }

    if (error.code === "ECONNREFUSED") {
      console.log("\n💡 Make sure the API server is running on port 3000");
    }
  }
}

// Health check function
async function healthCheck() {
  try {
    const response = await axios.get("http://localhost:3000/health");
    console.log("✅ API Health Check:", response.data.message);
    return true;
  } catch (error) {
    console.log("❌ API Health Check Failed:", error.message);
    return false;
  }
}

// Run tests
async function runTests() {
  console.log("🔍 Checking API health...\n");

  const isHealthy = await healthCheck();
  if (!isHealthy) {
    console.log("❌ API is not available. Please start the server first:");
    console.log("   npm start");
    console.log("\n   And in another terminal, start the worker:");
    console.log("   npm run worker");
    return;
  }

  await testAPI();
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}

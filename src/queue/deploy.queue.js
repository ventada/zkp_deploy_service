import Queue from "bull";

// Create the deployment queue
// const deployQueue = new Queue("contract-deployment", process.env.REDIS_URL, {
const deployQueue = new Queue("contract-deployment", "redis://localhost:7070", {
  defaultJobOptions: {
    attempts: 3, // Retry failed jobs up to 3 times
    backoff: {
      type: "exponential",
      delay: 2000, // Start with 2 seconds delay
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50, // Keep last 50 failed jobs
  },
});

// Queue event handlers
deployQueue.on("error", (error) => {
  console.error("Queue error:", error);
});

deployQueue.on("failed", (job, error) => {
  console.error(`Job ${job.id} failed:`, error.message);
});

deployQueue.on("completed", (job, result) => {
  console.log(`Job ${job.id} completed successfully:`, result);
});

deployQueue.on("stalled", (job) => {
  console.warn(`Job ${job.id} stalled`);
});

// Function to add deployment job to queue
export const addDeploymentJob = async (circuitId, options = {}) => {
  try {
    // Extract job-specific data from options
    const { jobType, contractAddress, priority, delay, ...jobOptions } =
      options;

    const jobData = {
      circuitId,
      timestamp: Date.now(),
    };

    // Add additional data for specific job types
    if (jobType) {
      jobData.jobType = jobType;
    }

    if (contractAddress) {
      jobData.contractAddress = contractAddress;
    }

    const job = await deployQueue.add("deploy-contract", jobData, {
      priority: priority || 0,
      delay: delay || 0,
      ...jobOptions,
    });

    console.log(
      `Deployment job added to queue for circuitId: ${circuitId}, Job ID: ${
        job.id
      }, jobType: ${jobType || "default"}`
    );

    return {
      jobId: job.id,
      circuitId,
      status: "queued",
    };
  } catch (error) {
    console.error("Error adding job to queue:", error);
    throw error;
  }
};

// Function to get job status
export const getJobStatus = async (jobId) => {
  try {
    const job = await deployQueue.getJob(jobId);

    if (!job) {
      return { status: "not_found" };
    }

    const state = await job.getState();
    const progress = job._progress;
    const data = job.data;

    return {
      jobId,
      status: state,
      progress,
      data,
      timestamp: job.timestamp,
    };
  } catch (error) {
    console.error("Error getting job status:", error);
    throw error;
  }
};

// Function to get queue statistics
export const getQueueStats = async () => {
  try {
    const waiting = await deployQueue.getWaiting();
    const active = await deployQueue.getActive();
    const completed = await deployQueue.getCompleted();
    const failed = await deployQueue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length,
    };
  } catch (error) {
    console.error("Error getting queue stats:", error);
    throw error;
  }
};

// Function to clean up completed/failed jobs
export const cleanQueue = async () => {
  try {
    await deployQueue.clean(24 * 60 * 60 * 1000, "completed"); // Clean jobs older than 24 hours
    await deployQueue.clean(24 * 60 * 60 * 1000, "failed");
    console.log("Queue cleaned up");
  } catch (error) {
    console.error("Error cleaning queue:", error);
    throw error;
  }
};

export default deployQueue;

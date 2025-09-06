# Smart Contract Deployment Service

A Node.js Express application for deploying smart contracts using Bull queue, MongoDB, and ethers.js with S3 integration for contract artifacts.

## Features

- 🚀 **Express API** with RESTful endpoints
- 🔄 **Bull Queue** for job management with Redis backend
- 🗄️ **MongoDB** for contract metadata storage
- ☁️ **AWS S3 Integration** for downloading contract artifacts
- ⛓️ **Smart Contract Deployment** using ethers.js and solc
- 🔒 **Security** with helmet and CORS protection
- 📊 **Job Monitoring** and status tracking
- 🔄 **Automatic Retries** for failed deployments

## Project Structure

```
src/
├── api/
│   └── deploy.routes.js      # API routes for deployment
├── queue/
│   ├── deploy.queue.js       # Bull queue configuration
│   └── deploy.worker.js      # Job processing worker
├── models/
│   └── contract.model.js     # MongoDB Contract model
├── services/
│   └── deploy.service.js     # Contract deployment logic
├── app.js                    # Express app configuration
└── server.js                 # Server entry point
```

## Prerequisites

- Node.js (v16 or higher)
- MongoDB
- Redis
- AWS S3 bucket with contract artifacts
- A blockchain RPC endpoint (Polygon, Ethereum, etc.)
- A wallet private key for contract deployment

## Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd deploy-contract
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp env.example .env
   ```

   Edit `.env` with your configuration:

   ```env
   MONGO_URI=mongodb://localhost:27017/contract-deployer
   REDIS_URL=redis://localhost:6379
   S3_BUCKET=your-s3-bucket-name
   AWS_REGION=us-east-1
   S3_ENDPOINT=https://s3.amazonaws.com
   AWS_ACCESS_KEY_ID=your_aws_access_key_id
   AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
   RPC_URL=https://polygon-rpc.com
   PRIVATE_KEY=your_private_key_here
   ```

4. **Start MongoDB and Redis**

   ```bash
   # MongoDB (if running locally)
   mongod

   # Redis (if running locally)
   redis-server
   ```

## Usage

### Starting the Services

1. **Start the API server**

   ```bash
   npm start
   # or for development with auto-reload
   npm run dev
   ```

2. **Start the worker** (in a separate terminal)
   ```bash
   npm run worker
   ```

### API Endpoints

#### 1. Deploy a Contract

```http
POST /api/deploy
Content-Type: application/json

{
  "circuitId": "circuit_123"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Deployment job queued successfully",
  "data": {
    "jobId": "123",
    "circuitId": "circuit_123",
    "status": "queued"
  }
}
```

#### 2. Check Job Status

```http
GET /api/deploy/status/:jobId
```

#### 3. Get Contract Status

```http
GET /api/deploy/contract/:circuitId
```

#### 4. Queue Statistics

```http
GET /api/deploy/queue/stats
```

#### 5. List All Contracts

```http
GET /api/deploy/contracts?status=deployed&page=1&limit=10
```

#### 6. Create Contract (for testing)

```http
POST /api/deploy/contracts
Content-Type: application/json

{
  "circuitId": "circuit_123",
  "name": "Verifier",
  "artifacts": {
    "wasm": "circuits/689eed072cea46605b56eaf9/circuit.wasm",
    "zkey": "circuits/689eed072cea46605b56eaf9/circuit_final.zkey",
    "vkey": "circuits/689eed072cea46605b56eaf9/verification_key.json",
    "verifier": "circuits/689eed072cea46605b56eaf9/verifier.sol"
  },
  "constructorArgs": []
}
```

#### 7. Health Check

```http
GET /health
```

## Contract Deployment Flow

1. **API receives deployment request** with `circuitId`
2. **Validates contract exists** in MongoDB
3. **Enqueues job** in Bull queue
4. **Worker processes job**:
   - Downloads contract verifier from S3 using `artifacts.verifier`
   - Compiles using solc
   - Deploys using ethers.js
   - Updates MongoDB with results
5. **Returns deployment status** to client

## MongoDB Schema

```javascript
{
  circuitId: String,        // Unique identifier
  name: String,            // Contract name
  sourceUrl: String,       // Contract source URL (fallback)
  artifacts: {             // S3 artifact paths
    wasm: String,          // Circuit WASM file path
    zkey: String,          // Circuit ZKey file path
    vkey: String,          // Verification key file path
    verifier: String       // Verifier contract file path
  },
  constructorArgs: Array,  // Constructor arguments
  status: String,          // "pending" | "deployed" | "failed"
  contractAddress: String, // Deployed contract address
  txHash: String,          // Deployment transaction hash
  error: String,           // Error message if failed
  deployedAt: Date,        // Deployment timestamp
  createdAt: Date,         // Record creation time
  updatedAt: Date          // Record update time
}
```

## S3 Integration

The application downloads contract artifacts from AWS S3:

- **Primary**: Uses `artifacts.verifier` path to download the verifier contract
- **Fallback**: Uses `sourceUrl` if artifacts are not available
- **Configuration**: Requires AWS credentials and S3 bucket configuration

### S3 Bucket Structure

```
your-s3-bucket/
├── circuits/
│   └── 689eed072cea46605b56eaf9/
│       ├── circuit.wasm
│       ├── circuit_final.zkey
│       ├── verification_key.json
│       └── verifier.sol
```

## Error Handling

The application includes comprehensive error handling:

- **Validation errors** for invalid input
- **Database connection errors** with graceful fallbacks
- **S3 download errors** with detailed messages
- **Contract compilation errors** with detailed messages
- **Deployment failures** with retry logic
- **Queue job failures** with exponential backoff

## Security Considerations

- ✅ **Helmet.js** for security headers
- ✅ **CORS** configuration
- ✅ **Input validation** on all endpoints
- ✅ **Environment variables** for sensitive data
- ✅ **AWS IAM** for S3 access control
- ⚠️ **Never commit private keys** to version control
- ⚠️ **Use test networks** for development

## Development

### Running Tests

```bash
npm test
```

### Code Structure

- **ES Modules** for modern JavaScript
- **Async/await** for clean asynchronous code
- **Error boundaries** for robust error handling
- **Logging** for debugging and monitoring

### Adding New Features

1. Add new routes in `src/api/`
2. Create services in `src/services/`
3. Update models in `src/models/`
4. Add queue jobs in `src/queue/`

## Production Deployment

1. **Set production environment variables**
2. **Use production MongoDB and Redis instances**
3. **Configure proper CORS origins**
4. **Set up monitoring and logging**
5. **Use PM2 or similar for process management**
6. **Configure AWS IAM roles for S3 access**

## Troubleshooting

### Common Issues

1. **MongoDB Connection Failed**

   - Check `MONGO_URI` in `.env`
   - Ensure MongoDB is running

2. **Redis Connection Failed**

   - Check `REDIS_URL` in `.env`
   - Ensure Redis is running

3. **S3 Download Failed**

   - Verify AWS credentials in `.env`
   - Check S3 bucket and file paths
   - Ensure IAM permissions for S3 access

4. **Contract Deployment Failed**

   - Verify `PRIVATE_KEY` has sufficient funds
   - Check `RPC_URL` is accessible
   - Ensure contract artifacts exist in S3

5. **Worker Not Processing Jobs**
   - Ensure worker is running: `npm run worker`
   - Check Redis connection
   - Verify MongoDB connection

## License

ISC

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request
# zkp_deploy_service

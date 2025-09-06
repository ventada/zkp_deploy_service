import DeployService from "./src/services/deploy.service.js";

const t = async () => {
  const deployService = new DeployService();
  try {
    const contracts = await deployService.getListOfContracts();
    console.log(contracts);
  } catch (error) {
    console.error("Error in /deploy/contracts/list endpoint:", error);
  }
};

t();

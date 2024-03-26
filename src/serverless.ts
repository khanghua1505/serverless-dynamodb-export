import Serverless from 'serverless';

let sls: Serverless;

export const setServerless = (serverless: Serverless) => {
  sls = serverless;
};

export const useServerless = () => {
  return sls!;
};

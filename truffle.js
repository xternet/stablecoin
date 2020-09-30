const HDWalletProvider = require("@truffle/hdwallet-provider");
require('dotenv').config();

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*"
    },
    ropsten: {
      provider: () => {
        return new HDWalletProvider(process.env.PRIVATE_KEY, `https://ropsten.infura.io/v3/${process.env.INFURA_API_KEY}`)
      },
      gas: 4800000,
      gasPrice: 100000000000,
      network_id: 3
    }
  },
  compilers: {
    solc: {
      version: "^0.6.0",
    }
  }
}

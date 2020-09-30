const Stablecoin = artifacts.require("./Stablecoin.sol");

module.exports = function(deployer) {
	deployer.deploy(Stablecoin, '0x8468b2bDCE073A157E560AA4D9CcF6dB1DB98507');
}
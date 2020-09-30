const ether = n => {
  return new web3.utils.BN(
    web3.utils.toWei(n.toString(), 'ether')
  )
}

const tokens = n => ether(n)

const calcPrice = () => {
  const convert0 = 10**9
  const convert1 = 10**17
  const TS = 1577836800

  TN = Math.round((new Date()).getTime()/1000).toString()
  TD = TN-TS
  ethUsd = '20000000000'
  scUsd = (parseInt((1+(TD/convert0))*convert0)).toString()
  scWei = (convert1*((scUsd)/ethUsd)).toString()
  weiSc = parseInt(tokens(1)/scWei).toString()

  return weiSc;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

module.exports = {
  ether,
  tokens,
  calcPrice,
  ZERO_ADDRESS,
}
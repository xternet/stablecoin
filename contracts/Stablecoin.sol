// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@chainlink/contracts/src/v0.6/interfaces/HistoricAggregatorInterface.sol";

/** Stablecoin.

  * Token starts with value 1 USD
  * Token price is increasing by 0.000000001 USD/s (3.16% APY).
  * Users can buy&sell tokens from contract, for predetermined price.
  
  * If user wants to sell tokens, but contract does not have enough Ether, then user must:
    - wait for vault fill,
    - wait for ETH/USD price increase,
    - sell with different method (exchange, P2P).

  * T0d0: Integrate with YF aggregator for final collateral.
*/

contract Stablecoin {
  using SafeMath for uint;

  string private constant _name = 'Stablecoin';
  string public constant symbol = 'SC';
  uint8 public constant decimals = 18;
  uint public totalSupply;

  mapping(address => uint256) private _balanceOf;                // Token balance of specific address 
  mapping(address => mapping(address => uint)) public allowance; // Allow someone to spend specific amount of own tokens

  uint constant convert0 = 10**9;  // Convert for USD decimals
  uint constant convert1 = 10**17; // Sync with Chainlink Oracles ETH/USD result
  uint constant convert2 = 10**18; // Convert for Wei
  uint32 constant TS = 1577836800; // Timestamp Start (1/1/2020), moment when 1 token = 1 USD

  uint private TD;    // TD (Time Difference) = TN (Timestamp Now, moment of buying) - TS
  uint public ethUsd; // Ethereum in USD
  uint public scUsd;  // Token in USD
  uint public scWei;  // Token in Wei
  uint public weiSc;  // Wei in token

  HistoricAggregatorInterface internal ref; // Store ChainLink contract into variable

  /** Events:
    * Approval      - Someone gets approvement to spend tokens
    * Price         - New price is calculated
    * Received      - Contract received funds
    * TokensBurn    - When tokens are sold&removed
    * TokensMint    - When token are purchased&created
    * Transfer      - When tokens are transfered
    * TransferEther - When tokens are sold and Ether is sended
    * Purchase      - When tokens were purchased
    * Sale          - When tokens were sold
  */

  event Approval(address indexed owner, address indexed spender, uint amount);
  event Price(uint ethUsd, uint scUsd, uint scWei, uint weiSc, uint time);
  event Received(address indexed sender, uint amount);
  event TokensBurn(address indexed from, uint amount); 
  event TokensMint(address indexed merchant, address indexed beneficiary, uint amount); 

  event Transfer(address indexed sender, address indexed recipient, uint amount);
  event TransferEther(address indexed sender, address indexed recipient, uint amount);

  event Purchase(
    address indexed buyer,
    address indexed beneficiary,
    uint etherGive, 
    uint tokenGet,
    uint price,
    uint totalSupply,
    uint vaultBalance,
    uint time
  );

  event Sale(
    address indexed seller,
    uint tokenGive,
    uint etherGet,
    uint price,
    uint totalSupply,
    uint vaultBalance,
    uint time
  );

  /** lvl: 0 **/

  constructor (address _aggregator) public {
    // Gets ETH/USD price history from _aggregator contract
    ref = HistoricAggregatorInterface(_aggregator);
  }

  /* Allows this contract to receive payments */
  receive() external payable {
    emit Received(msg.sender, msg.value);
  }

  /* Returns tokens balance of specific address */
  function balanceOf(address _user) public view returns (uint) {
    return _balanceOf[_user];
  }

  /* Returns token name */
  function name() public pure returns (string memory) {
    return _name;
  }

  /** ERC20 function:
    * User allows someone to spend specific amount of his tokens.
    * more: https://github.com/ethereum/EIPs/blob/master/EIPS/eip-20.md
  */

  function approve(address _spender, uint256 _amount) public returns (bool) {
    _approve(msg.sender, _spender, _amount);

    return true;
  }

  /** Token purchase:
    * _preValidatePurchase - Checks if proper addresses (msg.sender, _beneficiary) and sufficient balance of sender,
    * _price               - Gets current token price,
    * _tokenAmount         - Calc. tokens amount to create base on the _price and msg.value (received Ether),
    * _sendTokens          - Create and send tokens to _beneficiary (purchaser can choose dif. destination address).
  */

  function buy(address _beneficiary) public payable {
    _preValidatePurchase(msg.sender, _beneficiary, msg.value);

    uint _price = updatePrice();
    uint _tokenAmount = _getTokenAmount(msg.value, _price);
    _sendTokens(msg.sender, _beneficiary, _tokenAmount);

    emit Purchase(msg.sender, _beneficiary, msg.value, _tokenAmount, _price, totalSupply, address(this).balance, block.timestamp);
  }

  /* User decrease allowance of his token to spend (approve function) */
  function decreaseAllowance(address _spender, uint256 _amount) public returns (bool) {
    _approve(msg.sender, _spender, allowance[msg.sender][_spender].sub(_amount, "Error, allowance will be less than zero"));

    return true;
  }

  /* User increase allowance of his token to spend (approve function) */
  function increaseAllowance(address _spender, uint256 _amount) public returns (bool) {
    _approve(msg.sender, _spender, allowance[msg.sender][_spender].add(_amount));

    return true;
  }

  /** Tokens Sale:
    * _preValidatePurchaseSale - Checks if proper address and sufficient balance,
    * _price                   - Gets current token price,
    * _etherAmount             - Calc. Ether amount to send,
    * _preValidateWithdraw     - Checks if contract have sufficient amount of Ether,
    * _burnTokens              - Remove tokens and decrease tokens total supply,
    * _sendEther               - Send Ether from contract to user.
  */

  function sell(uint _amount) public {
    _preValidatePurchaseSale(msg.sender, _amount);

    uint _price = updatePrice();
    uint _etherAmount = _getEtherAmount(_amount, _price);

    _preValidateWithdraw(_etherAmount);
    _burnTokens(msg.sender, _amount);
    _sendEther(msg.sender, _etherAmount);

    emit Sale(msg.sender, _amount, _etherAmount, _price, totalSupply, address(this).balance, block.timestamp);
  }

  /** Example of token price calculation:
    * TD     = TimeNow-TimeStart          ||  1609459200 - 1577836800 = 31622400‬ (1/1/2021 - 1/1/2020)
    * ethUsd = ETH/USD * 10**8            ||  200.00 * 10**8 = 20000000000                (200.00 USD)
    * scUsd  = TD + 10**9                 ||  1031622400‬                                    (1.03 USD)
    * scWei  = (scUsd * 10**17) / ethUsd  ||  5158112000000000                            (0.0051 ETH)
    * weiSc  = 10**18 / scWei             ||  193~                                (1 Wei = 193 tokens)
  */

  function updatePrice() public returns (uint) {
    TD = _getTime();

    ethUsd = _getEthUsd();
    scUsd = _getScUsd(TD);
    scWei = _getScWei(scUsd, ethUsd);
    weiSc = _getWeiSc(scWei);

    emit Price(ethUsd, scUsd, scWei, weiSc, block.timestamp);
    return weiSc;
  }

  /** ERC20 function: transfer tokens **/
  function transfer(address _recipient, uint256 _amount) public payable returns (bool) {
    _transfer(msg.sender, _recipient, _amount);

    return true;
  }

  /** ERC20 function: transfer tokens from someone (earlier allowance from someone is required) **/
  function transferFrom(address _sender, address _recipient, uint256 _amount) public returns (bool) {
    _approve(_sender, msg.sender, allowance[_sender][msg.sender].sub(_amount, 'Error, insufficient allowances'));
    _transfer(_sender, _recipient, _amount);

    return true;
  }

  /** lvl: -1 **/

  function _approve(address _owner, address _spender, uint256 _amount) internal {
    _preValidateApprovement(_owner, _spender);
    allowance[_owner][_spender] = _amount;

    emit Approval(_owner, _spender, _amount);
  }

  function _burnTokens(address _user, uint _tokenAmount) internal {
    _balanceOf[_user] = _balanceOf[_user].sub(_tokenAmount);
    totalSupply = totalSupply.sub(_tokenAmount);

    emit TokensBurn(_user, _tokenAmount);
  }

  function _getEtherAmount(uint _amount, uint _price) internal pure returns (uint) {
    return _amount.div(_price);
  }

  function _getEthUsd() internal returns (uint) {
    uint _ethUsd = 20000000000; //local
    //uint _ethUsd = uint(ref.latestAnswer()); // Gets latest price from Chainlink history
    _preValidatePrice(_ethUsd);

    return _ethUsd;
  }

  function _getScUsd(uint _TD) internal pure returns (uint) {
    return convert0.add(_TD);
  }

  function _getScWei(uint _scUsd, uint _ethUsd) internal pure returns (uint) {
    return convert1.mul(_scUsd).div(_ethUsd);
  }

  function _getTime() internal view returns (uint) {
    _preValidateTime();

    return block.timestamp-TS;
  }

  function _getTokenAmount(uint _weiAmount, uint _price) internal pure returns (uint) {
    return _weiAmount.mul(_price);
  }

  function _getWeiSc(uint _scWei) internal pure returns (uint) {
    return convert2.div(_scWei);
  }

  function _sendEther(address payable _user, uint _etherAmount) internal {
    _user.transfer(_etherAmount);

    emit TransferEther(address(this), _user, _etherAmount);
  }

  function _sendTokens(address _sender, address _beneficiary, uint _amount) internal {
    totalSupply = totalSupply.add(_amount);
    _balanceOf[_beneficiary] = _balanceOf[_beneficiary].add(_amount);

    emit TokensMint(_sender, _beneficiary, _amount);
  }

  function _transfer(address _sender, address _recipient, uint256 _amount) internal {
    _preValidateTransfer(_sender, _recipient, _amount);

    _balanceOf[_sender] = _balanceOf[_sender].sub(_amount);
    _balanceOf[_recipient] = _balanceOf[_recipient].add(_amount);

    emit Transfer(_sender, _recipient, _amount);
  }

  /** Functions validation section **/

  function _preValidateApprovement(address _owner, address _spender) internal pure {
    require(_owner != address(0), 'Error, owner is the zero address');
    require(_spender != address(0), 'Error, spender is the zero address');
  }

  function _preValidatePrice(uint _price) internal pure {
    require(_price>0, 'Error, problem with ETH/USD');
  }

  function _preValidatePurchase(address _buyer, address _beneficiary, uint _amount) internal view {
    require(_buyer.balance >= msg.value, 'Error, insufficient balances');
    require(address(_beneficiary) != address(0), 'Error, wrong beneficiary address');
    require(_amount>0, 'Error, wrong amount');
  }

  function _preValidatePurchaseSale(address _user, uint _amount) internal view {
    require(_user != address(0), 'Error, msg.sender is the zero address');
    require(_balanceOf[_user]>=_amount, 'Error, insufficient balances');
  }

  function _preValidateTime() internal view {
    require(block.timestamp>TS, 'Error, problem with timestamp');
  }

  function _preValidateTransfer(address _sender, address _recipient, uint _amount) internal view {
    require(_balanceOf[_sender] >= _amount, 'Error, insufficient balances of sender');
    require(_recipient != address(0), 'Error, recipient is the zero address');
    require(_sender != address(0), 'Error, sender is the zero address');
  }

  function _preValidateWithdraw(uint _etherAmount) internal view {
    require(address(this).balance >= _etherAmount, 'Error, insufficient balances of vault, try later');
  }
}

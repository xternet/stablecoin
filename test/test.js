const { calcPrice, ether, tokens, ZERO_ADDRESS } = require('./helpers.js');
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

require('chai')
  .use(require('chai-as-promised'))
  .should()

const Stablecoin = artifacts.require('./Stablecoin')

contract('Stablecoin', ([deployer, user, sender, recipient, spender, owner, beneficiary]) => {
  let result
  let scAmount

  beforeEach(async () => {
    sc = await Stablecoin.new('0x8468b2bDCE073A157E560AA4D9CcF6dB1DB98507')
  })

  describe('Accepting payments', () => {
    beforeEach(async () => {
      await sc.sendTransaction({value: ether(1), from: deployer})
    })

    it('SC vault should increase', async () => {
      expect(await web3.eth.getBalance(sc.address)).to.be.bignumber.eq(ether(1))
    })
  })

  describe('Variables', () => {
    it('name', async () => {
      expect(await sc.name()).to.eq('Stablecoin')
    })

    it('symbol', async () => {
      expect(await sc.symbol()).to.eq('SC')
    })

    it('decimals', async () => {
      expect(await sc.decimals()).to.be.bignumber.eq('18')
    })  

    it('totalSupply', async () => {
      expect(await sc.totalSupply()).to.be.bignumber.eq('0')
    })
  })

  describe('price()', () =>{
    beforeEach(async () =>{
      result = await sc.updatePrice()
    })

    it('WEI/SC', async () =>{
      expect(await sc.weiSc()).to.be.bignumber.eq(calcPrice())
    })

    it('check log values', () => {
      const log = result.logs

      expectEvent.inLogs(log, 'Price', {
        weiSc: calcPrice(),
      })
    })
  })

  describe('buy()', () => {
    describe('success', () => {
      describe('same beneficiary', () => {
        beforeEach(async () => {
          scAmount = ether(calcPrice())
          result = await sc.buy(user, {value: ether(1), from: user})
        })

        it('total supply should increase', async () =>{
          expect(await sc.totalSupply()).to.be.bignumber.eq(scAmount)
        })

        it('user balance should increase', async () =>{
          expect(await sc.balanceOf(user)).to.be.bignumber.eq(scAmount)
        })

        it('contract balance should increase', async () =>{
          expect(await web3.eth.getBalance(sc.address)).to.be.bignumber.eq(ether(1))
        })

        it('checks log values', () => {
          const log = result.logs
          expect(log[0].event).to.eq('Price')

          expectEvent.inLogs(log, 'TokensMint', {
            merchant: user,
            beneficiary: user,
            amount: scAmount,
          })

          expectEvent.inLogs(log, 'Purchase', {
            buyer: user,
            beneficiary: user,
            etherGive: ether(1),
            tokenGet: scAmount,
            price: calcPrice(),
            totalSupply: scAmount,
            vaultBalance: ether(1),
          })
        })
      })

      describe('different beneficiary', () => {
        beforeEach(async () => {
          scAmount = ether(calcPrice())
          result = await sc.buy(beneficiary, {value: ether(1), from: user})
        })

        it('total supply should increase', async () =>{
          expect(await sc.totalSupply()).to.be.bignumber.eq(scAmount)
        })

        it('beneficiary balance should increase', async () =>{
          expect(await sc.balanceOf(beneficiary)).to.be.bignumber.eq(scAmount)
        })

        it('contract balance should increase', async () =>{
          expect(await web3.eth.getBalance(sc.address)).to.be.bignumber.eq(ether(1))
        })

        it('checks log values', () => {
          const log = result.logs
          expect(log[0].event).to.eq('Price')

          expectEvent.inLogs(log, 'TokensMint', {
            merchant: user,
            beneficiary: beneficiary,
            amount: scAmount,
          })

          expectEvent.inLogs(log, 'Purchase', {
            buyer: user,
            beneficiary: beneficiary,
            etherGive: ether(1),
            tokenGet: scAmount,
            price: calcPrice(),
            totalSupply: scAmount,
            vaultBalance: ether(1),
          })
        })
      })
    })

    describe('failure', () => {
      it('insufficient balances', () => {
        expectRevert(sc.buy(user, {value: ether(101)}), 'Error, insufficient balances') 
      })

      it('wrong beneficiary address', () => {
        expectRevert(sc.buy(ZERO_ADDRESS, {value: ether(1)}), 'Error, wrong beneficiary address') 
      })

      it('wrong amount', () => {
        expectRevert(sc.buy(user, {value: ether(0)}), 'Error, wrong amount') 
      })
    })
  })

  describe('transfer()', () => {
    beforeEach(async () => {
      scAmount = ether(calcPrice())
      await sc.buy(sender, {value: ether(1), from: sender})
    })

    describe('success', () => {
      beforeEach(async () => {
        result = await sc.transfer(recipient, scAmount, {from: sender})
      })

      it('recipient balance should increase', async () => {
        expect(await sc.balanceOf(recipient)).to.be.bignumber.eq(scAmount)
      })

      it('sender balance should decrease', async () => {
        expect(await sc.balanceOf(sender)).to.be.bignumber.eq('0')
      })

      it('checks log values', () => {
        const log = result.logs

        expectEvent.inLogs(log, 'Transfer', {
          sender: sender,
          recipient: recipient,
          amount: scAmount,
        })
      })
    })

    describe('failure', () => {
      it('insufficient balances of sender', () => {
        expectRevert(sc.transfer(recipient, tokens(scAmount), {from: sender}), 'Error, insufficient balances of sender')
      })

      it('wrong recipient address', () => {
        expectRevert(sc.transfer(ZERO_ADDRESS, scAmount, {from: sender}), 'Error, recipient is the zero address')
      })
    })
  })

  describe('Allowance', () => {
    beforeEach(async () => {
      scAmount = ether(calcPrice())
      await sc.buy(owner, {value: ether(1), from: owner})
    })

    describe('approval()', () => {
      describe('success', () => {
        beforeEach(async () => {
          result = await sc.approve(spender, scAmount, {from: owner})
        })

        it('spender allowance should increase', async () =>{
          expect(await sc.allowance(owner, spender)).to.be.bignumber.eq(scAmount)
        })

        it('checks log values', () => {
          const log = result.logs

          expectEvent.inLogs(log, 'Approval', {
            owner: owner,
            spender: spender,
            amount: scAmount
          })
        })
      })

      describe('failure', () => {
        it('wrong spender address', ()=> {
          expectRevert(sc.approve(ZERO_ADDRESS, scAmount, {from: owner}), 'Error, spender is the zero address')
        })
      })
    })

    describe('increaseAllowance()', () => {
      let increasedAmount

      beforeEach(async () => {
        increasedAmount = tokens(101)
        await sc.approve(spender, tokens(100), {from: owner})
      })

      describe('success', () => {
        beforeEach(async () =>{
          result = await sc.increaseAllowance(spender, tokens(1), {from: owner})
        })

        it('allowance should increase', async () => {
          expect(await sc.allowance(owner, spender)).to.be.bignumber.eq(increasedAmount)
        })

        it('checks log values', () => {
          const log = result.logs

          expectEvent.inLogs(log, 'Approval', {
            owner: owner,
            spender: spender,
            amount: increasedAmount
          })
        })
      })

      describe('failure', () => {
        it('wrong spender address', () => {
          expectRevert(sc.increaseAllowance(ZERO_ADDRESS, increasedAmount, {from: owner}), 'Error, spender is the zero address')
        })
      })
    })

    describe('decreaseAllowance()', () => {
      let decreasedAllowance

      beforeEach(async () => {
        decreasedAllowance = tokens(99)
        await sc.approve(spender, tokens(100), {from: owner})
      })

      describe('success', () => {
        beforeEach(async () => {
          result = await sc.decreaseAllowance(spender, tokens(1), {from: owner})
        })

        it('allowance should decrease', async () => {
          expect(await sc.allowance(owner, spender)).to.be.bignumber.eq(decreasedAllowance)
        })

        it('checks the log values', () => {
          const log = result.logs

          expectEvent.inLogs(log, 'Approval', {
            owner: owner,
            spender: spender,
            amount: decreasedAllowance
          })
        })
      })

      describe('failure', () => {
        it('wrong spender address', async () => {
          await expectRevert(sc.decreaseAllowance(ZERO_ADDRESS, tokens(0), {from: owner}), 'Error, spender is the zero address')
        })

        it('wrong amount', async () => {
          await expectRevert(sc.decreaseAllowance(spender, tokens(101), {from: owner}), 'Error, allowance will be less than zero')
        })
      })
    })
  })

  describe('transferFrom()', () => {
    beforeEach(async () => {
      scAmount = ether(calcPrice())
      await sc.buy(owner, {value: ether(1), from: owner})
      await sc.approve(spender, scAmount, {from: owner})
    })

    describe('success', () => {
      beforeEach(async () => {
        result = await sc.transferFrom(owner, recipient, scAmount, {from: spender})
      })

      it('recipient balance should increase', async () => {
        expect(await sc.balanceOf(recipient)).to.be.bignumber.eq(scAmount)
      })

      it('owner balance should decrease', async () => {
        expect(await sc.balanceOf(owner)).to.be.bignumber.eq('0')
      })

      it('spender allowance should decrease', async () => {
        expect(await sc.allowance(owner, spender)).to.be.bignumber.eq('0')
      })

      it('checks logs values', () => {
        const log = result.logs

        expectEvent.inLogs(log, 'Approval', {
          owner: owner,
          spender: spender,
          amount: '0'
        })

        expectEvent.inLogs(log, 'Transfer', {
          sender: owner,
          recipient: recipient,
          amount: scAmount
        })
      })
    })

    describe('failure', () => {
      it('insufficient allowances', () =>{
        expectRevert(sc.transferFrom(owner, recipient, tokens(scAmount*2), {from: spender}), 'Error, insufficient allowances')
      })

      it('insufficient balances of owner', async () =>{
        await sc.transfer(deployer, scAmount, {from: owner})
        await expectRevert(sc.transferFrom(owner, recipient, scAmount, {from: spender}), 'Error, insufficient balances of sender')
      })

      it('wrong recipient address', () =>{
        expectRevert(sc.transferFrom(owner, ZERO_ADDRESS, scAmount, {from: spender}), 'Error, recipient is the zero address')
      })
    })
  })

  describe('sell()', () => {
    beforeEach(async () => {
      scAmount = ether(calcPrice())
      await sc.buy(user, {value: ether(1), from: user})
    })

    describe('success', () => {
      beforeEach(async () => {
        result = await sc.sell(scAmount, {from: user})
      })

      it('SC user balance should decrease', async () => {
        expect(await sc.balanceOf(user)).to.be.bignumber.eq('0')
      })

      it('SC totalSupply should decrease', async () => {
        expect(await sc.totalSupply()).to.be.bignumber.eq('0')
      })

      it('vault ETH balance should decrease', async () => {
        expect(await web3.eth.getBalance(sc.address)).to.be.bignumber.eq('0')
      })

      it('checks log values', () => {
        const log = result.logs

        expect(log[0].event).to.eq('Price')

        expectEvent.inLogs(log, 'TokensBurn', {
          from: user,
          amount: scAmount,
        })

        expectEvent.inLogs(log, 'Sale', {
          seller: user,
          tokenGive: scAmount,
          etherGet: ether(1),
          price: calcPrice(),
          totalSupply: '0',
          vaultBalance: '0'
        })
      })
    })

    describe('failure', () => {
      it('insufficient user balances', () => {
        expectRevert(sc.sell(tokens(scAmount), {from: user}), 'Error, insufficient balances')
      })
    })
  })
})
